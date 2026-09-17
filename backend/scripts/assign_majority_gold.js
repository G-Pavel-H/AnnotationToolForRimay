'use strict';

/**
 * Assign gold slots by annotator majority, for every atomic requirement in a
 * group.
 *
 * The gold is normally set by hand in the adjudication UI. When a run needs
 * categorical gold before that session has happened, this derives a provisional
 * gold from the submitted annotations instead:
 *
 *   * **Strict majority wins** — a value chosen by 2 or 3 of the 3 annotators.
 *   * **Three-way tie (1-1-1) → `implied`**, the median position between
 *     `present` and `missing` and the least-committal of the three. Every tie is
 *     recorded in the adjudication notes so it can be revisited.
 *   * `conditionType` uses the same majority rule, falling back to `none`.
 *
 * Non-atomic requirements are skipped by default: Rimay admits one system
 * response per requirement, so a single set of slot labels does not describe
 * them (see BACKLOG A2/R5). Non-atomicity is detected by any of the three
 * signals the annotators actually used — the `nonAtomic` checkbox, a
 * `<NON_ATOMIC>` marker in the conversion text, or a split described in the
 * notes — matching `RQ1ConvertToRimay/scripts/make_atomic_gold.py`.
 *
 * Writes through the HTTP API (not straight to Mongo) so `goldOverallIncomplete`,
 * `hadDisagreement` and `resolvedBy` are computed exactly as they are when a
 * human adjudicates.
 *
 * Usage:
 *   node scripts/assign_majority_gold.js --phase main [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Requirement = require('../src/models/Requirement');
const Annotation = require('../src/models/Annotation');

const SLOT_KEYS = ['scope', 'condition', 'actor', 'modalVerb', 'action'];
const TIE_VALUE = 'implied';
const TAG_RE = /<NON_ATOMIC>/i;
const PROSE_RE = /non[- ]?atomic|split into|multiple requests|multiple (?:distinct|separate) /i;

const API = process.env.GOLD_API_BASE || 'http://localhost:4000';
const USER = process.env.GOLD_ADMIN_USER || 'admin';
const PASS = process.env.GOLD_ADMIN_PASS;

/** Majority value, or null when every value ties. */
function majority(values) {
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const top = Math.max(...counts.values());
  const winners = [...counts.entries()].filter(([, n]) => n === top).map(([v]) => v);
  return winners.length === 1 ? winners[0] : null;
}

function isNonAtomic(annotations) {
  return annotations.some(
    (a) => a.nonAtomic || TAG_RE.test(a.rimayText || '') || PROSE_RE.test(a.notes || '')
  );
}

async function main() {
  const args = process.argv.slice(2);
  const phase = args[args.indexOf('--phase') + 1];
  const dryRun = args.includes('--dry-run');
  if (!phase || phase.startsWith('--')) {
    console.error('Usage: node scripts/assign_majority_gold.js --phase <group> [--dry-run]');
    process.exit(1);
  }
  if (!dryRun && !PASS) {
    console.error('Set GOLD_ADMIN_PASS (admin password) to write. Use --dry-run to preview.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const requirements = await Requirement.find({ phase }).sort({ order: 1, reqId: 1 });
  const annotations = await Annotation.find({ status: 'submitted' });

  const byReq = new Map();
  annotations.forEach((a) => {
    const k = a.requirementId.toString();
    if (!byReq.has(k)) byReq.set(k, []);
    byReq.get(k).push(a);
  });

  let token = null;
  if (!dryRun) {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    if (!res.ok) throw new Error(`login failed: ${res.status}`);
    token = (await res.json()).token;
  }

  const skipped = [];
  let written = 0;
  const ties = [];

  for (const req of requirements) {
    const anns = byReq.get(req._id.toString()) || [];
    if (anns.length < 2) {
      skipped.push(`${req.reqId} (only ${anns.length} submitted annotation(s))`);
      continue;
    }
    if (isNonAtomic(anns)) {
      skipped.push(`${req.reqId} (non-atomic)`);
      continue;
    }

    const goldSlots = {};
    const tiedSlots = [];
    SLOT_KEYS.forEach((k) => {
      const chosen = majority(anns.map((a) => a.slots[k]));
      if (chosen === null) tiedSlots.push(k);
      goldSlots[k] = chosen === null ? TIE_VALUE : chosen;
    });
    const goldConditionType = majority(anns.map((a) => a.conditionType)) || 'none';

    if (tiedSlots.length) ties.push(`${req.reqId}: ${tiedSlots.join(', ')}`);

    const note =
      `Provisional gold derived by annotator majority (${anns.length} annotators), ` +
      `not an adjudication session.` +
      (tiedSlots.length
        ? ` Three-way tie on ${tiedSlots.join(', ')} — set to '${TIE_VALUE}' by the ` +
          `documented tie rule; revisit these.`
        : '');

    if (dryRun) {
      console.log(`${req.reqId.padEnd(14)} ${SLOT_KEYS.map((k) => goldSlots[k][0]).join('')} ` +
        `cond=${goldConditionType}${tiedSlots.length ? '  TIE:' + tiedSlots.join(',') : ''}`);
    } else {
      const res = await fetch(`${API}/api/admin/adjudications/${req._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ goldSlots, goldConditionType, notes: note }),
      });
      if (!res.ok) throw new Error(`${req.reqId}: save failed ${res.status} ${await res.text()}`);
    }
    written += 1;
  }

  console.log(`\n${dryRun ? 'Would write' : 'Wrote'} gold for ${written} requirement(s) in '${phase}'.`);
  console.log(`Skipped ${skipped.length}:`);
  skipped.forEach((s) => console.log(`  - ${s}`));
  if (ties.length) {
    console.log(`\nThree-way ties set to '${TIE_VALUE}' (revisit with the annotators):`);
    ties.forEach((t) => console.log(`  - ${t}`));
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

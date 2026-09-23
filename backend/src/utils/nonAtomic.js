'use strict';

/**
 * Atomicity review worksheet.
 *
 * Rimay imposes atomicity — one requirement, one system response — so a source
 * requirement carrying several responses cannot be converted as it stands.
 * Annotators flag those with `nonAtomic` (and record how many responses they
 * counted in `nSystemResponses`).
 *
 * This builds the list of every requirement at least one annotator flagged,
 * with the full panel's verdict on each, so the flagged set can be worked
 * through and a decision taken per requirement (split, rewrite, or exclude).
 *
 * It reads the same analysis export rows as the agreement report and passes
 * them through the same `scopeRows` filter, so the two views always describe
 * exactly the same set of annotations.
 */

const { scopeRows, normalizeValue, SUBJECT_KEY, RATER_KEY } = require('./agreement');

// Annotators did not all use the same signal for non-atomicity: one ticked the
// checkbox, another wrote a `<NON_ATOMIC>` marker into the conversion text, and
// reasons often appear only in the notes. Reading the checkbox alone under-counts
// badly (15 of 50 instead of 20), so all three are honoured — the same rule the
// offline filter in RQ1ConvertToRimay/scripts/make_atomic_gold.py applies, so the
// tool and the experiment agree on which requirements are atomic.
const TAG_RE = /<NON_ATOMIC>/i;
const PROSE_RE = /non[- ]?atomic|split into|multiple requests|multiple (?:distinct|separate) /i;

/** Which non-atomicity signals one annotation carries. */
function signalsFor(row) {
  const found = [];
  if (normalizeValue(row.nonAtomic) === 'true') found.push('checkbox');
  if (TAG_RE.test(row.rimayText || '')) found.push('tag');
  if (PROSE_RE.test(row.notes || '')) found.push('notes');
  return found;
}

/**
 * Build the report from analysis export rows.
 *
 * options:
 *   phase  — the group these rows came from (recorded in the report only)
 *   status — 'all' (default) or 'submitted' to ignore drafts
 */
function buildNonAtomicReport(exportRows, options = {}) {
  const status = options.status === 'submitted' ? 'submitted' : 'all';
  const rows = scopeRows(exportRows, status);
  const raters = [...new Set(rows.map((row) => row[RATER_KEY]))].sort();

  // One entry per requirement, holding each annotator's verdict on it.
  const bySubject = new Map();
  rows.forEach((row) => {
    const key = row[SUBJECT_KEY];
    if (!bySubject.has(key)) {
      bySubject.set(key, {
        reqId: row[SUBJECT_KEY],
        requirementId: row.requirementId,
        phase: row.phase,
        nlText: row.nlText,
        byRater: new Map(),
      });
    }
    const signals = signalsFor(row);
    bySubject.get(key).byRater.set(row[RATER_KEY], {
      nonAtomic: signals.length > 0,
      signals,
      nSystemResponses: row.nSystemResponses,
      notes: row.notes || '',
    });
  });

  const requirements = [];
  bySubject.forEach(({ byRater, ...subject }) => {
    // A vote for every annotator in the panel: `nonAtomic: null` marks one who
    // never rated this requirement, which is not the same as voting "atomic".
    const votes = raters.map((rater) => {
      const rating = byRater.get(rater);
      return {
        rater,
        nonAtomic: rating ? rating.nonAtomic : null,
        signals: rating ? rating.signals : [],
        nSystemResponses: rating ? rating.nSystemResponses : null,
        notes: rating ? rating.notes : '',
      };
    });

    const flaggedBy = votes.filter((v) => v.nonAtomic === true);
    if (!flaggedBy.length) return; // nobody flagged it — not on the agenda

    const nRated = votes.filter((v) => v.nonAtomic !== null).length;
    const counts = flaggedBy
      .map((v) => v.nSystemResponses)
      .filter((n) => typeof n === 'number');

    requirements.push({
      ...subject,
      votes,
      nFlagged: flaggedBy.length,
      nRated,
      unanimous: flaggedBy.length === nRated,
      // How many responses the flaggers counted — the practical "how many
      // requirements would this split into". Null when nobody recorded one.
      maxSystemResponses: counts.length ? Math.max(...counts) : null,
    });
  });

  // Widest consensus first, then by requirement id: unanimous calls lead, and
  // the contested ones needing discussion follow.
  requirements.sort(
    (a, b) => b.nFlagged - a.nFlagged || String(a.reqId).localeCompare(String(b.reqId))
  );

  return {
    meta: {
      phase: options.phase || null,
      status,
      annotators: raters,
      nRequirements: bySubject.size,
      nFlagged: requirements.length,
      nUnanimous: requirements.filter((r) => r.unanimous).length,
      generatedAt: new Date().toISOString(),
    },
    requirements,
  };
}

module.exports = { buildNonAtomicReport, signalsFor };

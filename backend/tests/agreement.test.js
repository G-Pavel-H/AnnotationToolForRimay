'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  buildAgreementReport,
  fleissKappa,
  cohenKappa,
  landisKoch,
} = require('../src/utils/agreement');

const round3 = (x) => Math.round(x * 1000) / 1000;

// --- the maths, against values that can be checked by hand ------------------

test('fleissKappa: perfect agreement is 1', () => {
  // 3 subjects, 2 categories, 4 raters, every rater agreeing.
  assert.equal(fleissKappa([[4, 0], [0, 4], [4, 0]]), 1);
});

test('fleissKappa: no agreement beyond chance is <= 0', () => {
  // Every subject split down the middle: observed agreement equals chance.
  const kappa = fleissKappa([[2, 2], [2, 2], [2, 2]]);
  assert.ok(kappa <= 0);
});

test('fleissKappa: undefined when a single category is used throughout', () => {
  assert.equal(fleissKappa([[4, 0], [4, 0]]), null);
});

test('fleissKappa: subjects with fewer than two ratings are dropped', () => {
  assert.equal(fleissKappa([[1, 0]]), null);
});

test('fleissKappa: matches the textbook worked example', () => {
  // Landis & Koch style example: 10 subjects, 2 raters-equivalent counts.
  // p_bar = 0.9, p_e = 0.5 -> kappa = 0.8
  const matrix = [];
  for (let i = 0; i < 5; i += 1) matrix.push([2, 0]);
  for (let i = 0; i < 5; i += 1) matrix.push([0, 2]);
  assert.equal(fleissKappa(matrix), 1); // unanimous within each subject
});

test('cohenKappa: perfect and chance-level pairs', () => {
  const cats = ['a', 'b'];
  assert.equal(cohenKappa([['a', 'a'], ['b', 'b'], ['a', 'a']], cats), 1);
  // Rater A always 'a', rater B always 'a' -> no variation, undefined.
  assert.equal(cohenKappa([['a', 'a'], ['a', 'a']], cats), null);
  // Classic 2x2: 20 subjects, po = 0.7, pe = 0.5 -> kappa = 0.4
  const pairs = [];
  for (let i = 0; i < 6; i += 1) pairs.push(['a', 'a']);
  for (let i = 0; i < 4; i += 1) pairs.push(['a', 'b']);
  for (let i = 0; i < 2; i += 1) pairs.push(['b', 'a']);
  for (let i = 0; i < 8; i += 1) pairs.push(['b', 'b']);
  assert.equal(round3(cohenKappa(pairs, cats)), 0.4);
});

test('cohenKappa: empty overlap is undefined', () => {
  assert.equal(cohenKappa([], ['a', 'b']), null);
});

test('landisKoch: band boundaries', () => {
  assert.equal(landisKoch(-0.1), 'poor');
  assert.equal(landisKoch(0.2), 'slight');
  assert.equal(landisKoch(0.4), 'fair');
  assert.equal(landisKoch(0.6), 'moderate');
  assert.equal(landisKoch(0.8), 'substantial');
  assert.equal(landisKoch(0.95), 'almost perfect');
  assert.equal(landisKoch(null), 'undefined (no category variation)');
});

// --- the report -------------------------------------------------------------

function row(reqId, rater, slots, extra = {}) {
  return {
    reqId,
    annotatorUsername: rater,
    annotationStatus: 'submitted',
    slot_scope: slots[0],
    slot_condition: slots[1],
    slot_actor: slots[2],
    slot_modalVerb: slots[3],
    slot_action: slots[4],
    conditionType: 'none',
    nonAtomic: false,
    overallIncomplete: false,
    ...extra,
  };
}

const ALL_PRESENT = ['present', 'present', 'present', 'present', 'present'];

test('buildAgreementReport: needs at least two annotators', () => {
  const report = buildAgreementReport([row('1-A', 'ann1', ALL_PRESENT)]);
  assert.equal(report.empty, true);
  assert.match(report.reason, /two annotators/);
});

test('buildAgreementReport: rows without an annotator are not ratings', () => {
  const rows = [{ reqId: '1-A', annotatorUsername: null, slot_scope: null }];
  const report = buildAgreementReport(rows);
  assert.equal(report.empty, true);
  assert.equal(report.meta.nRatings, 0);
});

test('buildAgreementReport: status=submitted ignores drafts', () => {
  const rows = [
    row('1-A', 'ann1', ALL_PRESENT),
    row('1-A', 'ann2', ALL_PRESENT, { annotationStatus: 'draft' }),
  ];
  assert.equal(buildAgreementReport(rows, { status: 'all' }).meta.nRatings, 2);
  const submitted = buildAgreementReport(rows, { status: 'submitted' });
  assert.equal(submitted.meta.nRatings, 1);
  assert.equal(submitted.empty, true); // one annotator left
});

test('buildAgreementReport: disagreements list the split and who voted', () => {
  const rows = [
    row('1-A', 'ann1', ['present', 'present', 'present', 'present', 'present']),
    row('1-A', 'ann2', ['missing', 'present', 'present', 'present', 'present']),
  ];
  const report = buildAgreementReport(rows, {
    requirementIdByReqId: new Map([['1-A', 'req-object-id']]),
  });
  const scope = report.disagreements.find((d) => d.field === 'scope');
  assert.ok(scope, 'scope disagreement is reported');
  assert.equal(scope.requirementId, 'req-object-id');
  assert.equal(scope.votes.length, 2);
  // condition/actor/... were unanimous, so only scope shows up.
  assert.equal(report.disagreements.length, 1);
});

test('buildAgreementReport: unexpected values are skipped and reported', () => {
  const rows = [
    row('1-A', 'ann1', ['bogus', 'present', 'present', 'present', 'present']),
    row('1-A', 'ann2', ['present', 'present', 'present', 'present', 'present']),
  ];
  const report = buildAgreementReport(rows);
  assert.ok(report.warnings.some((w) => /unexpected 'scope'/.test(w)));
});

test('buildAgreementReport: gold agreement is null until adjudication exists', () => {
  const rows = [row('1-A', 'ann1', ALL_PRESENT), row('1-A', 'ann2', ALL_PRESENT)];
  assert.equal(buildAgreementReport(rows).gold, null);

  const withGold = rows.map((r) => ({ ...r, gold_scope: 'present', gold_actor: 'missing' }));
  const gold = buildAgreementReport(withGold).gold;
  assert.deepEqual(gold.slots, ['scope', 'actor']);
  assert.equal(gold.table.ann1.scope.rate, 1);
  assert.equal(gold.table.ann1.actor.rate, 0);
});

test('buildAgreementReport: pairwise Cohen covers every annotator pair', () => {
  const rows = [
    row('1-A', 'ann1', ALL_PRESENT),
    row('1-A', 'ann2', ALL_PRESENT),
    row('1-A', 'ann3', ALL_PRESENT),
  ];
  const scope = buildAgreementReport(rows).slots.find((s) => s.field === 'scope');
  assert.equal(scope.cohen.pairs.length, 3); // C(3,2)
  assert.deepEqual(
    scope.cohen.pairs.map((p) => `${p.a}~${p.b}`),
    ['ann1~ann2', 'ann1~ann3', 'ann2~ann3']
  );
});

// --- parity with the offline Python report ----------------------------------
// analysis/experiments/exp01_pilot/agreement_report.md is the committed output
// of analysis/pilot_agreement.py over the same export. The in-app numbers must
// match it exactly, otherwise the two would tell different stories.

const PILOT_EXPORT = path.join(
  __dirname,
  '../../analysis/experiments/exp01_pilot/rimay_export_pilot.json'
);

test('buildAgreementReport: reproduces the committed pilot report', { skip: !fs.existsSync(PILOT_EXPORT) && 'pilot export fixture not present' }, () => {
  const { rows } = JSON.parse(fs.readFileSync(PILOT_EXPORT, 'utf8'));
  const report = buildAgreementReport(rows, { phase: 'pilot' });

  assert.equal(report.meta.nRequirements, 10);
  assert.deepEqual(report.meta.annotators, ['Arthur', 'Mko', 'Rafo', 'admin']);

  const kappaOf = (list, field) => round3(list.find((r) => r.field === field).kappa);
  assert.equal(kappaOf(report.slots, 'scope'), -0.088);
  assert.equal(kappaOf(report.slots, 'condition'), 0.387);
  assert.equal(kappaOf(report.slots, 'actor'), 0.379);
  assert.equal(kappaOf(report.slots, 'modalVerb'), 0.074);
  assert.equal(kappaOf(report.slots, 'action'), -0.026);
  assert.equal(kappaOf(report.extras, 'conditionType'), 0.2);

  // Undefined where a single category was used throughout.
  assert.equal(report.extras.find((r) => r.field === 'overallIncomplete').kappa, null);
  assert.equal(report.extras.find((r) => r.field === 'nonAtomic').kappa, null);

  // Raw agreement percentages from the same table.
  const scope = report.slots.find((r) => r.field === 'scope');
  assert.equal(Math.round(scope.unanimous * 100), 60);
  assert.equal(Math.round(scope.majority * 100), 100);
  const action = report.slots.find((r) => r.field === 'action');
  assert.equal(Math.round(action.unanimous * 100), 90);

  // The worksheet had 24 (requirement, field) splits.
  assert.equal(report.disagreements.length, 24);
  const first = report.disagreements[0];
  assert.equal(first.reqId, '152-Mastodon');
  assert.equal(first.field, 'action');
  assert.deepEqual(first.distribution, [
    { value: 'present', count: 3 },
    { value: 'implied', count: 1 },
  ]);
});

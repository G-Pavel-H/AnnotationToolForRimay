'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { buildNonAtomicReport } = require('../src/utils/nonAtomic');

/** One analysis export row, with only the fields this report reads. */
const row = (reqId, rater, nonAtomic, extra = {}) => ({
  reqId,
  requirementId: `oid-${reqId}`,
  phase: 'main',
  nlText: `text of ${reqId}`,
  annotatorUsername: rater,
  annotationStatus: 'submitted',
  nonAtomic,
  nSystemResponses: null,
  notes: '',
  ...extra,
});

test('buildNonAtomicReport: only requirements someone flagged are listed', () => {
  const report = buildNonAtomicReport([
    row('1-A', 'ann1', true),
    row('1-A', 'ann2', false),
    row('2-A', 'ann1', false),
    row('2-A', 'ann2', false),
  ]);
  assert.deepEqual(report.requirements.map((r) => r.reqId), ['1-A']);
  assert.equal(report.meta.nRequirements, 2); // both were in scope
  assert.equal(report.meta.nFlagged, 1);
});

test('buildNonAtomicReport: every annotator gets a vote, unanimity is counted', () => {
  const report = buildNonAtomicReport([
    row('1-A', 'ann1', true),
    row('1-A', 'ann2', true),
    row('2-A', 'ann1', true),
    row('2-A', 'ann2', false),
  ]);
  const [first, second] = report.requirements;
  // Widest consensus first.
  assert.equal(first.reqId, '1-A');
  assert.equal(first.unanimous, true);
  assert.equal(first.nFlagged, 2);
  assert.equal(second.unanimous, false);
  assert.equal(second.nFlagged, 1);
  assert.deepEqual(second.votes.map((v) => v.nonAtomic), [true, false]);
  assert.equal(report.meta.nUnanimous, 1);
});

test('buildNonAtomicReport: an annotator who never rated it votes null, not "atomic"', () => {
  // ann2 is in the panel (they rated 2-A) but never rated 1-A.
  const report = buildNonAtomicReport([row('1-A', 'ann1', true), row('2-A', 'ann2', false)]);
  const flagged = report.requirements[0];
  assert.equal(flagged.reqId, '1-A');
  assert.deepEqual(flagged.votes.map((v) => v.nonAtomic), [true, null]);
  // Unanimity is over the ratings that exist; the absent annotator is not a
  // vote for "atomic", and does not count towards nRated.
  assert.equal(flagged.nRated, 1);
  assert.equal(flagged.unanimous, true);
});

test('buildNonAtomicReport: status=submitted ignores drafts', () => {
  const rows = [
    row('1-A', 'ann1', true, { annotationStatus: 'draft' }),
    row('1-A', 'ann2', false),
  ];
  assert.equal(buildNonAtomicReport(rows, { status: 'all' }).meta.nFlagged, 1);
  assert.equal(buildNonAtomicReport(rows, { status: 'submitted' }).meta.nFlagged, 0);
});

test('buildNonAtomicReport: maxSystemResponses is the largest count a flagger gave', () => {
  const report = buildNonAtomicReport([
    row('1-A', 'ann1', true, { nSystemResponses: 2 }),
    row('1-A', 'ann2', true, { nSystemResponses: 4 }),
    // An atomic vote's count must not leak into the flagged maximum.
    row('1-A', 'ann3', false, { nSystemResponses: 9 }),
  ]);
  assert.equal(report.requirements[0].maxSystemResponses, 4);

  const noCounts = buildNonAtomicReport([row('2-A', 'ann1', true)]);
  assert.equal(noCounts.requirements[0].maxSystemResponses, null);
});

test('buildNonAtomicReport: placeholder rows for unannotated requirements are ignored', () => {
  const report = buildNonAtomicReport([
    { reqId: '9-A', annotatorUsername: null, nonAtomic: null },
    row('1-A', 'ann1', true),
  ]);
  assert.equal(report.meta.nRequirements, 1);
  assert.deepEqual(report.meta.annotators, ['ann1']);
});

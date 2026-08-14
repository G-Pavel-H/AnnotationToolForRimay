'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { computeOverallIncomplete } = require('../src/utils/incompleteness');
const {
  parseIncompleteness,
  extractDescription,
  parseRequirementsCsv,
} = require('../src/utils/csvParser');
const { serializeRequirementForAnnotator } = require('../src/utils/serializers');
const { buildExportRows, rowsToCsv } = require('../src/utils/exporter');
const { sanitizeAnnotationBody } = require('../src/routes/annotations');
const { normalizePhase, phaseCounts } = require('../src/utils/phases');

test('computeOverallIncomplete: missing mandatory slot => incomplete', () => {
  assert.equal(
    computeOverallIncomplete({ scope: 'present', condition: 'present', actor: 'missing', modalVerb: 'present', action: 'present' }),
    true
  );
  assert.equal(
    computeOverallIncomplete({ scope: 'present', condition: 'present', actor: 'present', modalVerb: 'missing', action: 'present' }),
    true
  );
  assert.equal(
    computeOverallIncomplete({ scope: 'present', condition: 'present', actor: 'present', modalVerb: 'present', action: 'missing' }),
    true
  );
});

test('computeOverallIncomplete: missing optional slot (scope/condition) => complete', () => {
  assert.equal(
    computeOverallIncomplete({ scope: 'missing', condition: 'missing', actor: 'present', modalVerb: 'implied', action: 'present' }),
    false
  );
});

test('computeOverallIncomplete: implied mandatory slots => complete', () => {
  assert.equal(
    computeOverallIncomplete({ scope: 'missing', condition: 'missing', actor: 'implied', modalVerb: 'implied', action: 'implied' }),
    false
  );
});

test('parseIncompleteness: parses python-dict-style string and clamps to 0/1', () => {
  assert.equal(parseIncompleteness("{'Ambiguity': 2, 'Incompleteness': 0}"), 0);
  assert.equal(parseIncompleteness("{'Ambiguity': 2, 'Incompleteness': 1}"), 1);
  assert.equal(parseIncompleteness("{'Incompleteness': 3}"), 1);
  assert.equal(parseIncompleteness('{"Incompleteness": 0}'), 0);
  assert.equal(parseIncompleteness('garbage'), 0);
  assert.equal(parseIncompleteness(null), 0);
});

test('extractDescription: pulls the Request Description portion', () => {
  const text = 'Request Number - 72 | Request Title - Preview | Request Description - I would like a preview.';
  assert.equal(extractDescription(text), 'I would like a preview.');
  assert.equal(extractDescription('no marker here'), 'no marker here');
});

test('parseRequirementsCsv: parses reconciled-style rows', () => {
  const csv =
    ',Unnamed: 0,RequestNumber-App,FinalDefectCount,TextUsedForAnnotation\n' +
    '0,0,72-Signal,"{\'Ambiguity\': 2, \'Incompleteness\': 0}","Request Number - 72 | Request Title - X | Request Description - I want a preview."\n' +
    '1,1,99-App,"{\'Incompleteness\': 1}","Request Description - Another one."\n';
  const rows = parseRequirementsCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].reqId, '72-Signal');
  assert.equal(rows[0].pragyanIncomp, 0);
  assert.equal(rows[0].nlDescription, 'I want a preview.');
  assert.equal(rows[1].reqId, '99-App');
  assert.equal(rows[1].pragyanIncomp, 1);
});

test('serializer strips pragyanIncomp for annotators', () => {
  const req = { reqId: '1-A', nlText: 't', nlDescription: 'd', pragyanIncomp: 1, phase: 'main', order: 0 };
  const safe = serializeRequirementForAnnotator(req);
  assert.equal(safe.pragyanIncomp, undefined);
  assert.equal(safe.reqId, '1-A');
});

test('sanitizeAnnotationBody never trusts overallIncomplete/status from client', () => {
  const out = sanitizeAnnotationBody({
    rimayText: 'x',
    slots: { actor: 'present', modalVerb: 'bogus', action: 'missing' },
    conditionType: 'trigger',
    patternNumber: 5,
    nonAtomic: true,
    nSystemResponses: 2,
    overallIncomplete: false, // attacker tries to override
    status: 'submitted', // attacker tries to override
  });
  assert.equal(out.overallIncomplete, undefined);
  assert.equal(out.status, undefined);
  assert.equal(out.slots.actor, 'present');
  assert.equal(out.slots.modalVerb, undefined); // invalid enum dropped
  assert.equal(out.patternNumber, 5);
  assert.equal(out.nSystemResponses, 2);
});

test('sanitizeAnnotationBody rejects out-of-range pattern numbers', () => {
  assert.equal(sanitizeAnnotationBody({ patternNumber: 11 }).patternNumber, undefined);
  assert.equal(sanitizeAnnotationBody({ patternNumber: 0 }).patternNumber, undefined);
  assert.equal(sanitizeAnnotationBody({ patternNumber: null }).patternNumber, null);
});

test('buildExportRows: one row per (requirement, annotator) with flattened slots + gold + pragyan', () => {
  const requirements = [
    { _id: 'r1', reqId: '1-A', phase: 'main', order: 0, pragyanIncomp: 1, nlDescription: 'd', nlText: 't' },
  ];
  const annotations = [
    {
      requirementId: 'r1',
      annotatorId: 'u1',
      status: 'submitted',
      rimayText: 'The App must show a preview.',
      slots: { scope: 'missing', condition: 'missing', actor: 'implied', modalVerb: 'implied', action: 'present' },
      conditionType: 'none',
      patternNumber: 5,
      nonAtomic: false,
      nSystemResponses: null,
      overallIncomplete: false,
      notes: 'n',
    },
  ];
  const adjudications = [
    {
      requirementId: 'r1',
      goldSlots: { scope: 'missing', condition: 'missing', actor: 'implied', modalVerb: 'implied', action: 'present' },
      goldConditionType: 'none',
      goldOverallIncomplete: false,
      hadDisagreement: false,
      canonicalRimay: 'The App must show a preview.',
    },
  ];
  const users = [{ _id: 'u1', username: 'a1', displayName: 'Ann One' }];

  const rows = buildExportRows(requirements, annotations, adjudications, users);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.reqId, '1-A');
  assert.equal(row.pragyanIncomp, 1);
  assert.equal(row.slot_actor, 'implied');
  assert.equal(row.gold_action, 'present');
  assert.equal(row.annotatorUsername, 'a1');

  const csv = rowsToCsv(rows);
  assert.ok(csv.split('\n')[0].includes('reqId'));
  assert.ok(csv.split('\n')[0].includes('pragyanIncomp'));
});

test('normalizePhase: accepts any name, trimmed and whitespace-collapsed', () => {
  assert.equal(normalizePhase('pilot'), 'pilot');
  assert.equal(normalizePhase('  Batch   2 '), 'Batch 2');
  assert.equal(normalizePhase('Reliability Study'), 'Reliability Study');
});

test('normalizePhase: rejects what cannot be a group name', () => {
  assert.equal(normalizePhase('   '), null);
  assert.equal(normalizePhase(''), null);
  assert.equal(normalizePhase(null), null);
  assert.equal(normalizePhase(42), null);
  assert.equal(normalizePhase('x'.repeat(41)), null);
  assert.equal(normalizePhase('x'.repeat(40)), 'x'.repeat(40));
});

test('phaseCounts: distinct groups ordered by size then name', () => {
  const counts = phaseCounts([
    { phase: 'pilot' },
    { phase: 'main' },
    { phase: 'pilot' },
    { phase: 'batch 2' },
    { phase: '  pilot ' }, // same group, sloppily typed
  ]);
  assert.deepEqual(counts, [
    { phase: 'pilot', count: 3 },
    { phase: 'batch 2', count: 1 },
    { phase: 'main', count: 1 },
  ]);
});

test('buildExportRows: requirement with no annotations still emits a row', () => {
  const requirements = [{ _id: 'r1', reqId: '1-A', phase: 'main', order: 0, pragyanIncomp: 0, nlDescription: '', nlText: '' }];
  const rows = buildExportRows(requirements, [], [], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].annotatorId, null);
});

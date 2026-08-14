'use strict';

/**
 * Inter-annotator agreement, computed in-app.
 *
 * Input is the same analysis export the Python pipeline reads — one row per
 * (requirement, annotator) from `exporter.buildExportRows` — so the numbers
 * here and in `analysis/pilot_agreement.py` come from identical data and
 * identical formulas. Nothing in this module touches the database or Express;
 * it is pure functions over plain rows.
 *
 * Two chance-corrected measures, reported side by side:
 *
 *   * **Fleiss' Kappa** — all annotators at once, the headline number. It
 *     tolerates a varying number of raters per requirement (a requirement rated
 *     by fewer than two is dropped).
 *   * **Cohen's Kappa** — one value per pair of annotators, which is what shows
 *     *who* disagrees with whom. Averaged over pairs for a single figure.
 *
 * Raw observed agreement is reported next to both, because Kappa reads low when
 * one category dominates even though raters agree almost every time (the
 * *Kappa paradox*) — the pair must be read together.
 */

const SLOT_VALUES = ['present', 'implied', 'missing'];
const BOOLEAN_VALUES = ['true', 'false'];
const CONDITION_TYPES = ['precondition', 'trigger', 'temporal', 'none'];

// The categorical fields we can measure agreement on, in report order. `column`
// is the flat export column; `categories` is the closed set of valid values —
// anything else is skipped and reported as a data note.
const SLOT_FIELDS = [
  { field: 'scope', column: 'slot_scope', categories: SLOT_VALUES },
  { field: 'condition', column: 'slot_condition', categories: SLOT_VALUES },
  { field: 'actor', column: 'slot_actor', categories: SLOT_VALUES },
  { field: 'modalVerb', column: 'slot_modalVerb', categories: SLOT_VALUES },
  { field: 'action', column: 'slot_action', categories: SLOT_VALUES },
];

const EXTRA_FIELDS = [
  {
    field: 'overallIncomplete',
    column: 'overallIncomplete',
    categories: BOOLEAN_VALUES,
    note: 'binary; computed server-side from the mandatory slots',
  },
  {
    field: 'conditionType',
    column: 'conditionType',
    categories: CONDITION_TYPES,
    note: 'only meaningful where a condition exists; computed over all rows',
  },
  { field: 'nonAtomic', column: 'nonAtomic', categories: BOOLEAN_VALUES, note: 'binary' },
];

const GOLD_COLUMNS = {
  scope: 'gold_scope',
  condition: 'gold_condition',
  actor: 'gold_actor',
  modalVerb: 'gold_modalVerb',
  action: 'gold_action',
};

const SUBJECT_KEY = 'reqId';
const RATER_KEY = 'annotatorUsername';

// --- small numeric helpers ---------------------------------------------------

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);

/** Normalise any export value to the lowercase string used for comparison. */
function normalizeValue(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().toLowerCase();
}

// --- the two Kappas ----------------------------------------------------------

/**
 * Fleiss' Kappa from a subject x category count matrix: entry [i][j] is how
 * many raters put subject i in category j.
 *
 * Returns null when Kappa is undefined — no subject has two ratings, or a
 * single category was used throughout so expected agreement is already 1.
 */
function fleissKappa(matrix) {
  const rows = matrix.filter((row) => sum(row) >= 2);
  if (!rows.length) return null;

  const nPerSubject = rows.map(sum);
  const totalRatings = sum(nPerSubject);
  const nCategories = rows[0].length;

  // Category proportions across all ratings.
  const pCategory = [];
  for (let j = 0; j < nCategories; j += 1) {
    pCategory.push(sum(rows.map((row) => row[j])) / totalRatings);
  }

  // Per-subject observed agreement: (sum_j n_ij^2 - n_i) / (n_i * (n_i - 1)).
  const pSubject = rows.map((row, i) => {
    const n = nPerSubject[i];
    return (sum(row.map((c) => c * c)) - n) / (n * (n - 1));
  });

  const pBar = mean(pSubject);
  const pExpected = sum(pCategory.map((p) => p * p));
  const denominator = 1 - pExpected;
  if (denominator <= 1e-12) return null;
  return (pBar - pExpected) / denominator;
}

/**
 * Cohen's Kappa for one pair of raters. `pairs` is the list of [valueA, valueB]
 * for the subjects both rated. Returns null when it is undefined.
 */
function cohenKappa(pairs, categories) {
  if (!pairs.length) return null;
  const n = pairs.length;

  let agreed = 0;
  const countsA = new Map();
  const countsB = new Map();
  pairs.forEach(([a, b]) => {
    if (a === b) agreed += 1;
    countsA.set(a, (countsA.get(a) || 0) + 1);
    countsB.set(b, (countsB.get(b) || 0) + 1);
  });

  const observed = agreed / n;
  const expected = sum(
    categories.map((c) => ((countsA.get(c) || 0) / n) * ((countsB.get(c) || 0) / n))
  );
  const denominator = 1 - expected;
  if (denominator <= 1e-12) return null;
  return (observed - expected) / denominator;
}

/** Landis & Koch interpretation band for a Kappa value. */
function landisKoch(kappa) {
  if (kappa === null || kappa === undefined || Number.isNaN(kappa)) {
    return 'undefined (no category variation)';
  }
  if (kappa < 0) return 'poor';
  if (kappa <= 0.2) return 'slight';
  if (kappa <= 0.4) return 'fair';
  if (kappa <= 0.6) return 'moderate';
  if (kappa <= 0.8) return 'substantial';
  return 'almost perfect';
}

/** Below this, a field is flagged as worth refining in the annotation guide. */
const SUBSTANTIAL = 0.61;

// --- per-field analysis ------------------------------------------------------

/**
 * Group rows into `subject -> [{ rater, value }]` for one field, skipping blank
 * or out-of-vocabulary values (each one recorded as a data note).
 */
function collectRatings(rows, field, warnings) {
  const perSubject = new Map();
  rows.forEach((row) => {
    const subject = row[SUBJECT_KEY];
    const rater = row[RATER_KEY];
    const value = normalizeValue(row[field.column]);
    if (!value) {
      warnings.push(`blank '${field.field}' for ${subject} / ${rater}; rating skipped`);
      return;
    }
    if (!field.categories.includes(value)) {
      warnings.push(
        `unexpected '${field.field}' value '${row[field.column]}' for ${subject} / ${rater}; rating skipped`
      );
      return;
    }
    if (!perSubject.has(subject)) perSubject.set(subject, []);
    perSubject.get(subject).push({ rater, value });
  });
  return perSubject;
}

/** Subject x category count matrix in `categories` order. */
function countMatrix(perSubject, categories) {
  return [...perSubject.values()].map((ratings) => {
    const counts = categories.map(() => 0);
    ratings.forEach(({ value }) => {
      counts[categories.indexOf(value)] += 1;
    });
    return counts;
  });
}

/**
 * Raw observed agreement over subjects with at least two ratings:
 * unanimous (everyone chose the same) and majority (all but at most one).
 */
function rawAgreement(perSubject) {
  let unanimous = 0;
  let majority = 0;
  let used = 0;
  perSubject.forEach((ratings) => {
    if (ratings.length < 2) return;
    used += 1;
    const counts = new Map();
    ratings.forEach(({ value }) => counts.set(value, (counts.get(value) || 0) + 1));
    const top = Math.max(...counts.values());
    if (top === ratings.length) unanimous += 1;
    if (top >= ratings.length - 1) majority += 1;
  });
  if (!used) return { unanimous: null, majority: null, nSubjects: 0 };
  return { unanimous: unanimous / used, majority: majority / used, nSubjects: used };
}

/**
 * Cohen's Kappa for every pair of raters on one field, plus the mean over
 * pairs. Only subjects that both raters in a pair rated are used.
 */
function pairwiseCohen(perSubject, raters, categories) {
  const byRater = new Map(raters.map((r) => [r, new Map()]));
  perSubject.forEach((ratings, subject) => {
    ratings.forEach(({ rater, value }) => {
      if (byRater.has(rater)) byRater.get(rater).set(subject, value);
    });
  });

  const pairs = [];
  for (let i = 0; i < raters.length; i += 1) {
    for (let j = i + 1; j < raters.length; j += 1) {
      const a = raters[i];
      const b = raters[j];
      const valuesA = byRater.get(a);
      const valuesB = byRater.get(b);
      const shared = [];
      valuesA.forEach((value, subject) => {
        if (valuesB.has(subject)) shared.push([value, valuesB.get(subject)]);
      });
      const kappa = cohenKappa(shared, categories);
      const agreed = shared.filter(([x, y]) => x === y).length;
      pairs.push({
        a,
        b,
        n: shared.length,
        kappa,
        band: landisKoch(kappa),
        observed: shared.length ? agreed / shared.length : null,
      });
    }
  }

  const defined = pairs.map((p) => p.kappa).filter((k) => k !== null);
  return { pairs, mean: defined.length ? mean(defined) : null };
}

/** Everything reported for one field. `perSubject` is kept for the worksheet. */
function analyzeField(rows, field, raters, warnings) {
  const perSubject = collectRatings(rows, field, warnings);
  if (!perSubject.size) return null;

  const kappa = fleissKappa(countMatrix(perSubject, field.categories));
  const raw = rawAgreement(perSubject);

  const distribution = {};
  field.categories.forEach((c) => {
    distribution[c] = 0;
  });
  perSubject.forEach((ratings) => ratings.forEach(({ value }) => {
    distribution[value] += 1;
  }));

  return {
    field: field.field,
    note: field.note || '',
    categories: field.categories,
    kappa,
    band: landisKoch(kappa),
    unanimous: raw.unanimous,
    majority: raw.majority,
    nSubjects: raw.nSubjects,
    distribution,
    cohen: pairwiseCohen(perSubject, raters, field.categories),
    belowSubstantial: kappa !== null && kappa < SUBSTANTIAL,
    perSubject,
  };
}

/**
 * Every (requirement, field) where the raters split, with the vote breakdown —
 * the agenda for an adjudication session.
 */
function disagreementRows(results, requirementIdByReqId) {
  const rows = [];
  results.forEach((result) => {
    if (!result) return;
    result.perSubject.forEach((ratings, subject) => {
      const counts = new Map();
      ratings.forEach(({ value }) => counts.set(value, (counts.get(value) || 0) + 1));
      if (counts.size <= 1) return; // unanimous, or a single rating
      rows.push({
        reqId: subject,
        requirementId: requirementIdByReqId.get(subject) || null,
        field: result.field,
        distribution: [...counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((x, y) => y.count - x.count || x.value.localeCompare(y.value)),
        votes: ratings
          .map(({ rater, value }) => ({ rater, value }))
          .sort((x, y) => String(x.rater).localeCompare(String(y.rater))),
      });
    });
  });
  rows.sort((a, b) => String(a.reqId).localeCompare(String(b.reqId)) || a.field.localeCompare(b.field));
  return rows;
}

/**
 * Each annotator's raw agreement with the adjudicated gold, per slot, over the
 * requirements that actually have a gold value for that slot. Null when no gold
 * has been adjudicated yet.
 */
function goldAgreement(rows, raters) {
  const goldByReq = new Map();
  rows.forEach((row) => {
    if (goldByReq.has(row[SUBJECT_KEY])) return;
    const gold = {};
    Object.entries(GOLD_COLUMNS).forEach(([slot, column]) => {
      gold[slot] = normalizeValue(row[column]);
    });
    goldByReq.set(row[SUBJECT_KEY], gold);
  });

  const slots = SLOT_FIELDS.filter((f) =>
    [...goldByReq.values()].some((gold) => SLOT_VALUES.includes(gold[f.field]))
  );
  if (!slots.length) return null;

  const table = {};
  raters.forEach((rater) => {
    table[rater] = {};
    slots.forEach((f) => {
      table[rater][f.field] = { matches: 0, comparable: 0, rate: null };
    });
  });

  rows.forEach((row) => {
    const rater = row[RATER_KEY];
    const gold = goldByReq.get(row[SUBJECT_KEY]) || {};
    if (!table[rater]) return;
    slots.forEach((f) => {
      const goldValue = gold[f.field];
      const value = normalizeValue(row[f.column]);
      if (!SLOT_VALUES.includes(goldValue) || !SLOT_VALUES.includes(value)) return;
      const cell = table[rater][f.field];
      cell.comparable += 1;
      if (value === goldValue) cell.matches += 1;
    });
  });

  raters.forEach((rater) => {
    slots.forEach((f) => {
      const cell = table[rater][f.field];
      cell.rate = cell.comparable ? cell.matches / cell.comparable : null;
    });
  });

  return { slots: slots.map((f) => f.field), raters, table };
}

// --- the report --------------------------------------------------------------

/** Strip the internal `perSubject` map before the result goes over the wire. */
function publicResult(result) {
  if (!result) return null;
  const { perSubject, ...rest } = result;
  return rest;
}

/**
 * Build the full agreement report from analysis export rows.
 *
 * options:
 *   phase  — the group these rows came from (recorded in the report only)
 *   status — 'all' (default) or 'submitted' to ignore drafts
 *   requirementIdByReqId — Map used to link a disagreement to its adjudication
 */
function buildAgreementReport(exportRows, options = {}) {
  const status = options.status === 'submitted' ? 'submitted' : 'all';
  const requirementIdByReqId =
    options.requirementIdByReqId instanceof Map ? options.requirementIdByReqId : new Map();

  // Requirements with no annotations appear in the export as a single row with
  // a null annotator — they carry no rating and must not count as one.
  let rows = exportRows.filter((row) => normalizeValue(row[RATER_KEY]) !== '');
  if (status === 'submitted') {
    rows = rows.filter((row) => normalizeValue(row.annotationStatus) === 'submitted');
  }

  const warnings = [];
  const raters = [...new Set(rows.map((row) => row[RATER_KEY]))].sort();
  const subjects = [...new Set(rows.map((row) => row[SUBJECT_KEY]))];

  const meta = {
    phase: options.phase || null,
    status,
    nRequirements: subjects.length,
    nRatings: rows.length,
    annotators: raters,
    generatedAt: new Date().toISOString(),
  };

  if (rows.length === 0 || raters.length < 2) {
    return {
      meta,
      slots: [],
      extras: [],
      gold: null,
      disagreements: [],
      warnings,
      empty: true,
      reason:
        rows.length === 0
          ? 'No annotations in this scope yet.'
          : 'Agreement needs at least two annotators; this scope has one.',
    };
  }

  // Flag requirements that were not rated by everyone — agreement is still
  // computed, but an uneven panel is worth knowing about.
  const ratersPerSubject = new Map();
  rows.forEach((row) => {
    const key = row[SUBJECT_KEY];
    if (!ratersPerSubject.has(key)) ratersPerSubject.set(key, new Set());
    ratersPerSubject.get(key).add(row[RATER_KEY]);
  });
  const maxRaters = Math.max(...[...ratersPerSubject.values()].map((s) => s.size));
  ratersPerSubject.forEach((set, subject) => {
    if (set.size !== maxRaters) {
      warnings.push(`${subject} was rated by ${set.size} annotator(s), expected ${maxRaters}`);
    }
  });

  const slots = SLOT_FIELDS.map((f) => analyzeField(rows, f, raters, warnings));
  const extras = EXTRA_FIELDS.map((f) => analyzeField(rows, f, raters, warnings));

  return {
    meta,
    slots: slots.map(publicResult).filter(Boolean),
    extras: extras.map(publicResult).filter(Boolean),
    gold: goldAgreement(rows, raters),
    disagreements: disagreementRows([...slots, ...extras], requirementIdByReqId),
    warnings,
    empty: false,
  };
}

module.exports = {
  buildAgreementReport,
  fleissKappa,
  cohenKappa,
  landisKoch,
  analyzeField,
  rawAgreement,
  pairwiseCohen,
  goldAgreement,
  SLOT_FIELDS,
  EXTRA_FIELDS,
  SUBSTANTIAL,
};

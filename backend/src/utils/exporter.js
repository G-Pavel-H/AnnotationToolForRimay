'use strict';

const SLOT_KEYS = ['scope', 'condition', 'actor', 'modalVerb', 'action'];

/**
 * Build analysis-ready export rows: one record per (requirement, annotator),
 * with slot values flattened and the gold standard + pragyanIncomp joined in.
 * Requirements with no annotations still emit one row (annotator fields null)
 * so the corpus is fully represented.
 */
function buildExportRows(requirements, annotations, adjudications, users) {
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const adjByReq = new Map(adjudications.map((a) => [a.requirementId.toString(), a]));
  const annByReq = new Map();
  annotations.forEach((a) => {
    const key = a.requirementId.toString();
    if (!annByReq.has(key)) annByReq.set(key, []);
    annByReq.get(key).push(a);
  });

  const rows = [];
  requirements.forEach((req) => {
    const reqKey = req._id.toString();
    const adj = adjByReq.get(reqKey);
    const reqAnns = annByReq.get(reqKey) || [];

    const goldBase = {};
    SLOT_KEYS.forEach((k) => {
      goldBase[`gold_${k}`] = adj ? adj.goldSlots[k] : null;
    });
    goldBase.gold_conditionType = adj ? adj.goldConditionType : null;
    goldBase.gold_overallIncomplete = adj ? adj.goldOverallIncomplete : null;
    goldBase.gold_hadDisagreement = adj ? adj.hadDisagreement : null;
    goldBase.canonicalRimay = adj ? adj.canonicalRimay : null;

    const reqBase = {
      reqId: req.reqId,
      requirementId: reqKey,
      phase: req.phase,
      order: req.order,
      pragyanIncomp: req.pragyanIncomp,
      nlDescription: req.nlDescription,
      nlText: req.nlText,
      ...goldBase,
    };

    if (reqAnns.length === 0) {
      rows.push({
        ...reqBase,
        annotatorId: null,
        annotatorUsername: null,
        annotatorDisplayName: null,
        annotationStatus: null,
        rimayText: null,
        slot_scope: null,
        slot_condition: null,
        slot_actor: null,
        slot_modalVerb: null,
        slot_action: null,
        conditionType: null,
        patternNumber: null,
        nonAtomic: null,
        nSystemResponses: null,
        overallIncomplete: null,
        notes: null,
      });
      return;
    }

    reqAnns.forEach((ann) => {
      const u = userById.get(ann.annotatorId.toString());
      rows.push({
        ...reqBase,
        annotatorId: ann.annotatorId.toString(),
        annotatorUsername: u ? u.username : null,
        annotatorDisplayName: u ? u.displayName : null,
        annotationStatus: ann.status,
        rimayText: ann.rimayText,
        slot_scope: ann.slots.scope,
        slot_condition: ann.slots.condition,
        slot_actor: ann.slots.actor,
        slot_modalVerb: ann.slots.modalVerb,
        slot_action: ann.slots.action,
        conditionType: ann.conditionType,
        patternNumber: ann.patternNumber,
        nonAtomic: ann.nonAtomic,
        nSystemResponses: ann.nSystemResponses,
        overallIncomplete: ann.overallIncomplete,
        notes: ann.notes,
      });
    });
  });

  return rows;
}

/**
 * Convert an array of flat objects to CSV. Uses the union of keys (in first-row
 * order) as the header. Values are RFC-4180 quoted.
 */
function rowsToCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  });
  return lines.join('\n');
}

module.exports = { buildExportRows, rowsToCsv, SLOT_KEYS };

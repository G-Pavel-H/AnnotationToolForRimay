'use strict';

const express = require('express');
const multer = require('multer');
const Requirement = require('../models/Requirement');
const Annotation = require('../models/Annotation');
const Adjudication = require('../models/Adjudication');
const User = require('../models/User');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { parseRequirementsCsv } = require('../utils/csvParser');
const { computeOverallIncomplete } = require('../utils/incompleteness');
const { buildExportRows, rowsToCsv } = require('../utils/exporter');
const { buildAgreementReport } = require('../utils/agreement');
const {
  SUGGESTED_PHASES,
  DEFAULT_PHASE,
  normalizePhase,
  phaseCounts,
} = require('../utils/phases');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requireAuth, requireAdmin);

const SLOT_KEYS = ['scope', 'condition', 'actor', 'modalVerb', 'action'];
const CONDITION_TYPES = ['precondition', 'trigger', 'temporal', 'none'];

const BAD_PHASE = 'phase must be a non-empty name of at most 40 characters';

/**
 * POST /api/admin/requirements/import
 * Multipart CSV upload. Parses the Pragyan corpus and upserts requirements.
 * An optional `phase` field puts the newly created rows straight into a group;
 * existing rows keep the group they are already in.
 */
router.post('/requirements/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required (field name "file")' });
    }
    const parsed = parseRequirementsCsv(req.file.buffer);
    if (!parsed.length) {
      return res.status(400).json({ error: 'No valid requirements found in CSV' });
    }
    const phase = normalizePhase((req.body || {}).phase) || DEFAULT_PHASE;

    let created = 0;
    let updated = 0;
    for (const r of parsed) {
      const existing = await Requirement.findOne({ reqId: r.reqId });
      if (existing) {
        existing.nlText = r.nlText;
        existing.nlDescription = r.nlDescription;
        existing.pragyanIncomp = r.pragyanIncomp;
        // Preserve phase/order if already set by admin; only set order if unset.
        if (existing.order === 0) existing.order = r.order;
        await existing.save();
        updated += 1;
      } else {
        await Requirement.create({ ...r, phase });
        created += 1;
      }
    }
    res.json({ imported: parsed.length, created, updated, phase });
  } catch (err) {
    next(err);
  }
});

/**
 * Build a clean requirement field set from a request body. `nlText` falls back
 * to `nlDescription` when omitted (e.g. a manually-added requirement).
 */
function sanitizeRequirementBody(body = {}) {
  const out = {};
  if (typeof body.reqId === 'string') out.reqId = body.reqId.trim();
  if (typeof body.nlDescription === 'string') out.nlDescription = body.nlDescription;
  if (typeof body.nlText === 'string') out.nlText = body.nlText;
  const phase = normalizePhase(body.phase);
  if (phase) out.phase = phase;
  if (body.pragyanIncomp === 0 || body.pragyanIncomp === 1) out.pragyanIncomp = body.pragyanIncomp;
  if (Number.isFinite(body.order)) out.order = body.order;
  return out;
}

/**
 * POST /api/admin/requirements -> create a single requirement manually.
 */
router.post('/requirements', async (req, res, next) => {
  try {
    const fields = sanitizeRequirementBody(req.body);
    if (!fields.reqId) return res.status(400).json({ error: 'reqId is required' });
    if (!fields.nlText && !fields.nlDescription) {
      return res.status(400).json({ error: 'A description (or full text) is required' });
    }
    if (!fields.nlText) fields.nlText = fields.nlDescription;
    if (!fields.nlDescription) fields.nlDescription = fields.nlText;

    const clash = await Requirement.findOne({ reqId: fields.reqId });
    if (clash) return res.status(409).json({ error: `Req ID "${fields.reqId}" already exists` });

    if (!Number.isFinite(fields.order)) {
      const last = await Requirement.findOne().sort({ order: -1 });
      fields.order = last ? last.order + 1 : 0;
    }
    if (!fields.phase) fields.phase = DEFAULT_PHASE;
    if (fields.pragyanIncomp == null) fields.pragyanIncomp = 0;

    const requirement = await Requirement.create(fields);
    res.status(201).json({ requirement });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Req ID already exists' });
    }
    next(err);
  }
});

/**
 * PUT /api/admin/requirements/:id -> edit a requirement's fields.
 */
router.put('/requirements/:id', async (req, res, next) => {
  try {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });

    const fields = sanitizeRequirementBody(req.body);

    // If reqId is changing, ensure it stays unique.
    if (fields.reqId && fields.reqId !== requirement.reqId) {
      const clash = await Requirement.findOne({ reqId: fields.reqId, _id: { $ne: requirement._id } });
      if (clash) return res.status(409).json({ error: `Req ID "${fields.reqId}" already exists` });
    }

    Object.assign(requirement, fields);
    if (!requirement.nlText) requirement.nlText = requirement.nlDescription;
    await requirement.save();
    res.json({ requirement });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Req ID already exists' });
    }
    next(err);
  }
});

/**
 * DELETE /api/admin/requirements/:id -> delete a requirement and cascade-delete
 * its annotations and adjudication (so nothing is left orphaned).
 */
router.delete('/requirements/:id', async (req, res, next) => {
  try {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });

    const [annRes, adjRes] = await Promise.all([
      Annotation.deleteMany({ requirementId: requirement._id }),
      Adjudication.deleteMany({ requirementId: requirement._id }),
    ]);
    await Requirement.deleteOne({ _id: requirement._id });

    res.json({
      deleted: true,
      reqId: requirement.reqId,
      deletedAnnotations: annRes.deletedCount,
      deletedAdjudications: adjRes.deletedCount,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/phases -> the groups currently in use, with their counts.
 * `suggested` are only naming hints for an empty dataset; any name is valid.
 */
router.get('/phases', async (req, res, next) => {
  try {
    const requirements = await Requirement.find({}, 'phase');
    res.json({ phases: phaseCounts(requirements), suggested: SUGGESTED_PHASES });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/phases/rename -> rename a group across every requirement in it.
 * Renaming onto an existing name merges the two groups, which is the only way
 * to merge and is why it is not treated as an error.
 * Body: { from, to }
 */
router.put('/phases/rename', async (req, res, next) => {
  try {
    const from = normalizePhase((req.body || {}).from);
    const to = normalizePhase((req.body || {}).to);
    if (!from || !to) return res.status(400).json({ error: BAD_PHASE });
    if (from === to) return res.json({ modified: 0, from, to, merged: false });

    const existing = await Requirement.countDocuments({ phase: to });
    const result = await Requirement.updateMany({ phase: from }, { phase: to });
    res.json({ modified: result.modifiedCount, from, to, merged: existing > 0 });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/requirements/:id/phase -> set the group for one requirement.
 * Any non-empty name is accepted; a name that does not exist yet creates the
 * group implicitly (groups are just the distinct values in use).
 */
router.put('/requirements/:id/phase', async (req, res, next) => {
  try {
    const phase = normalizePhase((req.body || {}).phase);
    if (!phase) return res.status(400).json({ error: BAD_PHASE });
    const requirement = await Requirement.findByIdAndUpdate(
      req.params.id,
      { phase },
      { new: true }
    );
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
    res.json({ requirement });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/requirements/phase/bulk -> bulk-assign a group.
 * Body: { ids: [..], phase } or { phase } (applies to all).
 */
router.put('/requirements/phase/bulk', async (req, res, next) => {
  try {
    const { ids } = req.body || {};
    const phase = normalizePhase((req.body || {}).phase);
    if (!phase) return res.status(400).json({ error: BAD_PHASE });
    const filter = Array.isArray(ids) && ids.length ? { _id: { $in: ids } } : {};
    const result = await Requirement.updateMany(filter, { phase });
    res.json({ modified: result.modifiedCount });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/progress -> per-annotator completion counts per group.
 * The group list is derived from the requirements, so a renamed or brand-new
 * group shows up here without any code change.
 */
router.get('/progress', async (req, res, next) => {
  try {
    const [users, requirements, annotations] = await Promise.all([
      User.find().sort({ role: 1, username: 1 }),
      Requirement.find(),
      Annotation.find(),
    ]);

    const counted = phaseCounts(requirements);
    const phases = counted.map((p) => p.phase);
    const totalsByPhase = {};
    counted.forEach((p) => {
      totalsByPhase[p.phase] = p.count;
    });

    const phaseByReq = new Map(
      requirements.map((r) => [r._id.toString(), normalizePhase(r.phase) || DEFAULT_PHASE])
    );

    const perAnnotator = users.map((u) => {
      const counts = {};
      phases.forEach((p) => {
        counts[p] = { draft: 0, submitted: 0 };
      });
      annotations
        .filter((a) => a.annotatorId.toString() === u._id.toString())
        .forEach((a) => {
          const phase = phaseByReq.get(a.requirementId.toString());
          if (phase && counts[phase]) counts[phase][a.status] += 1;
        });
      return {
        annotatorId: u._id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        counts,
      };
    });

    res.json({ phases, totalsByPhase, perAnnotator });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/annotations/:requirementId
 * All annotators' annotations for one requirement, side by side.
 */
router.get('/annotations/:requirementId', async (req, res, next) => {
  try {
    const requirement = await Requirement.findById(req.params.requirementId);
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });

    const annotations = await Annotation.find({ requirementId: req.params.requirementId })
      .populate('annotatorId', 'username displayName role');

    const adjudication = await Adjudication.findOne({ requirementId: req.params.requirementId });

    res.json({ requirement, annotations, adjudication: adjudication || null });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/adjudications/:requirementId -> save the gold standard.
 */
router.post('/adjudications/:requirementId', async (req, res, next) => {
  try {
    const requirement = await Requirement.findById(req.params.requirementId);
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });

    const body = req.body || {};
    const goldSlots = {};
    SLOT_KEYS.forEach((k) => {
      const v = body.goldSlots && body.goldSlots[k];
      goldSlots[k] = ['present', 'implied', 'missing'].includes(v) ? v : 'missing';
    });

    const goldConditionType = CONDITION_TYPES.includes(body.goldConditionType)
      ? body.goldConditionType
      : 'none';

    // Compute hadDisagreement from the submitted annotations on any slot.
    const annotations = await Annotation.find({ requirementId: req.params.requirementId });
    const hadDisagreement = computeHadDisagreement(annotations);

    const update = {
      requirementId: requirement._id,
      goldSlots,
      goldConditionType,
      goldOverallIncomplete: computeOverallIncomplete(goldSlots),
      resolvedBy: req.user._id,
      hadDisagreement,
      notes: typeof body.notes === 'string' ? body.notes : '',
      resolvedAt: new Date(),
    };

    const adjudication = await Adjudication.findOneAndUpdate(
      { requirementId: requirement._id },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ adjudication });
  } catch (err) {
    next(err);
  }
});

function computeHadDisagreement(annotations) {
  if (annotations.length < 2) return false;
  return SLOT_KEYS.some((slot) => {
    const values = new Set(annotations.map((a) => a.slots[slot]));
    return values.size > 1;
  });
}

/**
 * GET /api/admin/export?format=json|csv&phase=<group>
 * Analysis-ready export (admin-only, so pragyanIncomp is included). An optional
 * `phase` limits the export to that group's requirements; omitted = all groups.
 */
router.get('/export', async (req, res, next) => {
  try {
    const format = (req.query.format || 'json').toLowerCase();
    const phase = normalizePhase(req.query.phase);
    const reqFilter = phase ? { phase } : {};

    const [requirements, annotations, adjudications, users] = await Promise.all([
      Requirement.find(reqFilter).sort({ order: 1, reqId: 1 }),
      Annotation.find(),
      Adjudication.find(),
      User.find(),
    ]);

    // buildExportRows only emits rows for the requirements passed in, so filtering
    // requirements by phase is enough to scope annotations + gold to that phase.
    const rows = buildExportRows(requirements, annotations, adjudications, users);
    const scope = phase || 'all';
    // Group names are free-form, so keep the filename to safe characters.
    const slug = scope.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';

    if (format === 'csv') {
      const csv = rowsToCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="rimay_export_${slug}.csv"`);
      return res.send(csv);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="rimay_export_${slug}.json"`);
    res.json({ exportedAt: new Date().toISOString(), phase: scope, count: rows.length, rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/agreement?phase=<group>&status=all|submitted
 * Inter-annotator agreement computed in-app over the same rows the export
 * produces, so it matches the offline Python report exactly. `phase` scopes it
 * to one group (omitted = every group); `status=submitted` ignores drafts.
 */
router.get('/agreement', async (req, res, next) => {
  try {
    const phase = normalizePhase(req.query.phase);
    const status = req.query.status === 'submitted' ? 'submitted' : 'all';
    const reqFilter = phase ? { phase } : {};

    const [requirements, annotations, adjudications, users] = await Promise.all([
      Requirement.find(reqFilter).sort({ order: 1, reqId: 1 }),
      Annotation.find(),
      Adjudication.find(),
      User.find(),
    ]);

    const rows = buildExportRows(requirements, annotations, adjudications, users);
    const report = buildAgreementReport(rows, {
      phase,
      status,
      requirementIdByReqId: new Map(requirements.map((r) => [r.reqId, r._id.toString()])),
    });

    res.json(report);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/data
 * Danger zone: wipes the entire uploaded dataset — all requirements, all
 * annotations (everyone's), and all adjudications. Users are NOT touched.
 * Use this to reset before a fresh import. Admin-only.
 */
router.delete('/data', async (req, res, next) => {
  try {
    const [annRes, adjRes, reqRes] = await Promise.all([
      Annotation.deleteMany({}),
      Adjudication.deleteMany({}),
      Requirement.deleteMany({}),
    ]);
    res.json({
      deletedRequirements: reqRes.deletedCount,
      deletedAnnotations: annRes.deletedCount,
      deletedAdjudications: adjRes.deletedCount,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.computeHadDisagreement = computeHadDisagreement;

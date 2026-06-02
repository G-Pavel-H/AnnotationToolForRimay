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

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requireAuth, requireAdmin);

const SLOT_KEYS = ['scope', 'condition', 'actor', 'modalVerb', 'action'];
const PHASES = ['training', 'pilot', 'main'];
const CONDITION_TYPES = ['precondition', 'trigger', 'temporal', 'none'];

/**
 * POST /api/admin/requirements/import
 * Multipart CSV upload. Parses the Pragyan corpus and upserts requirements.
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
        await Requirement.create(r);
        created += 1;
      }
    }
    res.json({ imported: parsed.length, created, updated });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/requirements/:id/phase -> set phase for one requirement.
 */
router.put('/requirements/:id/phase', async (req, res, next) => {
  try {
    const { phase } = req.body || {};
    if (!PHASES.includes(phase)) {
      return res.status(400).json({ error: `phase must be one of ${PHASES.join(', ')}` });
    }
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
 * PUT /api/admin/requirements/phase/bulk -> bulk-assign phase.
 * Body: { ids: [..], phase } or { phase } (applies to all).
 */
router.put('/requirements/phase/bulk', async (req, res, next) => {
  try {
    const { ids, phase } = req.body || {};
    if (!PHASES.includes(phase)) {
      return res.status(400).json({ error: `phase must be one of ${PHASES.join(', ')}` });
    }
    const filter = Array.isArray(ids) && ids.length ? { _id: { $in: ids } } : {};
    const result = await Requirement.updateMany(filter, { phase });
    res.json({ modified: result.modifiedCount });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/progress -> per-annotator completion counts by phase.
 */
router.get('/progress', async (req, res, next) => {
  try {
    const [users, requirements, annotations] = await Promise.all([
      User.find().sort({ role: 1, username: 1 }),
      Requirement.find(),
      Annotation.find(),
    ]);

    const totalsByPhase = { training: 0, pilot: 0, main: 0 };
    const phaseByReq = new Map();
    requirements.forEach((r) => {
      totalsByPhase[r.phase] = (totalsByPhase[r.phase] || 0) + 1;
      phaseByReq.set(r._id.toString(), r.phase);
    });

    const perAnnotator = users.map((u) => {
      const counts = {
        training: { draft: 0, submitted: 0 },
        pilot: { draft: 0, submitted: 0 },
        main: { draft: 0, submitted: 0 },
      };
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

    res.json({ totalsByPhase, perAnnotator });
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
      canonicalRimay: typeof body.canonicalRimay === 'string' ? body.canonicalRimay : null,
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
 * GET /api/admin/export?format=json|csv
 * Full analysis-ready export (admin-only, so pragyanIncomp is included).
 */
router.get('/export', async (req, res, next) => {
  try {
    const format = (req.query.format || 'json').toLowerCase();
    const [requirements, annotations, adjudications, users] = await Promise.all([
      Requirement.find().sort({ order: 1, reqId: 1 }),
      Annotation.find(),
      Adjudication.find(),
      User.find(),
    ]);

    const rows = buildExportRows(requirements, annotations, adjudications, users);

    if (format === 'csv') {
      const csv = rowsToCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="rimay_export.csv"');
      return res.send(csv);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="rimay_export.json"');
    res.json({ exportedAt: new Date().toISOString(), count: rows.length, rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.computeHadDisagreement = computeHadDisagreement;

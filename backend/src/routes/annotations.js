'use strict';

const express = require('express');
const Annotation = require('../models/Annotation');
const Requirement = require('../models/Requirement');
const { requireAuth } = require('../middleware/auth');
const { computeOverallIncomplete } = require('../utils/incompleteness');

const router = express.Router();
router.use(requireAuth);

const SLOT_KEYS = ['scope', 'condition', 'actor', 'modalVerb', 'action'];
const SLOT_VALUES = ['present', 'implied', 'missing'];
const CONDITION_TYPES = ['precondition', 'trigger', 'temporal', 'none'];

/**
 * Sanitise client-supplied annotation fields into a safe update object.
 * Never trusts overallIncomplete or status from the client.
 */
function sanitizeAnnotationBody(body = {}) {
  const out = {};

  if (typeof body.rimayText === 'string') out.rimayText = body.rimayText;
  if (typeof body.notes === 'string') out.notes = body.notes;

  if (body.slots && typeof body.slots === 'object') {
    const slots = {};
    SLOT_KEYS.forEach((k) => {
      if (SLOT_VALUES.includes(body.slots[k])) slots[k] = body.slots[k];
    });
    if (Object.keys(slots).length) out.slots = slots;
  }

  if (CONDITION_TYPES.includes(body.conditionType)) {
    out.conditionType = body.conditionType;
  }

  if (body.patternNumber === null) {
    out.patternNumber = null;
  } else if (Number.isInteger(body.patternNumber) && body.patternNumber >= 1 && body.patternNumber <= 10) {
    out.patternNumber = body.patternNumber;
  }

  if (typeof body.nonAtomic === 'boolean') out.nonAtomic = body.nonAtomic;

  if (body.nSystemResponses === null) {
    out.nSystemResponses = null;
  } else if (Number.isInteger(body.nSystemResponses) && body.nSystemResponses >= 0) {
    out.nSystemResponses = body.nSystemResponses;
  }

  return out;
}

// GET /api/annotations/mine/:requirementId
router.get('/mine/:requirementId', async (req, res, next) => {
  try {
    const annotation = await Annotation.findOne({
      requirementId: req.params.requirementId,
      annotatorId: req.user._id,
    });
    res.json({ annotation: annotation || null });
  } catch (err) {
    next(err);
  }
});

// POST /api/annotations -> create or upsert a draft for the current user
router.post('/', async (req, res, next) => {
  try {
    const { requirementId } = req.body || {};
    if (!requirementId) {
      return res.status(400).json({ error: 'requirementId is required' });
    }
    const requirement = await Requirement.findById(requirementId);
    if (!requirement) {
      return res.status(404).json({ error: 'Requirement not found' });
    }

    const fields = sanitizeAnnotationBody(req.body);

    let annotation = await Annotation.findOne({
      requirementId,
      annotatorId: req.user._id,
    });

    if (!annotation) {
      annotation = new Annotation({
        requirementId,
        annotatorId: req.user._id,
        status: 'draft',
        ...fields,
      });
    } else {
      Object.assign(annotation, fields);
    }

    annotation.overallIncomplete = computeOverallIncomplete(annotation.slots);
    await annotation.save();
    res.status(201).json({ annotation });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Annotation already exists' });
    }
    next(err);
  }
});

// PUT /api/annotations/:id -> update own annotation
router.put('/:id', async (req, res, next) => {
  try {
    const annotation = await Annotation.findById(req.params.id);
    if (!annotation) {
      return res.status(404).json({ error: 'Annotation not found' });
    }
    // Only the owning annotator may edit. (Admins do not edit others' annotations;
    // they adjudicate via the admin routes instead.)
    if (annotation.annotatorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You can only edit your own annotation' });
    }

    const fields = sanitizeAnnotationBody(req.body);
    Object.assign(annotation, fields);
    annotation.overallIncomplete = computeOverallIncomplete(annotation.slots);
    await annotation.save();
    res.json({ annotation });
  } catch (err) {
    next(err);
  }
});

// POST /api/annotations/:id/submit -> mark submitted
router.post('/:id/submit', async (req, res, next) => {
  try {
    const annotation = await Annotation.findById(req.params.id);
    if (!annotation) {
      return res.status(404).json({ error: 'Annotation not found' });
    }
    if (annotation.annotatorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You can only submit your own annotation' });
    }
    annotation.overallIncomplete = computeOverallIncomplete(annotation.slots);
    annotation.status = 'submitted';
    await annotation.save();
    res.json({ annotation });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.sanitizeAnnotationBody = sanitizeAnnotationBody;

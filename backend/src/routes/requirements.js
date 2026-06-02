'use strict';

const express = require('express');
const Requirement = require('../models/Requirement');
const Annotation = require('../models/Annotation');
const { requireAuth } = require('../middleware/auth');
const { serializeRequirement } = require('../utils/serializers');

const router = express.Router();

router.use(requireAuth);

/**
 * GET /api/requirements
 * Requirements visible to the current user, ordered, each joined with this
 * user's annotation status (not_started | draft | submitted).
 * pragyanIncomp is stripped for annotators.
 *
 * Visibility: every annotator (admin included) annotates the whole dataset
 * (the study assigns the full corpus per phase). Annotators only ever see
 * their OWN annotation status, never anyone else's.
 */
router.get('/', async (req, res, next) => {
  try {
    const { phase } = req.query;
    const filter = {};
    if (phase) filter.phase = phase;

    const requirements = await Requirement.find(filter).sort({ order: 1, reqId: 1 });

    const myAnnotations = await Annotation.find({ annotatorId: req.user._id });
    const statusByReq = new Map(
      myAnnotations.map((a) => [a.requirementId.toString(), a.status])
    );

    const result = requirements.map((r) => {
      const safe = serializeRequirement(r, req.user.role);
      const status = statusByReq.get(r._id.toString()) || 'not_started';
      return { ...safe, annotationStatus: status };
    });

    res.json({ requirements: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/requirements/:id -> single requirement (pragyan stripped for annotators)
 */
router.get('/:id', async (req, res, next) => {
  try {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) {
      return res.status(404).json({ error: 'Requirement not found' });
    }
    res.json({ requirement: serializeRequirement(requirement, req.user.role) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

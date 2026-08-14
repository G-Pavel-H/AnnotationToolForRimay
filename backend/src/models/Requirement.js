'use strict';

const mongoose = require('mongoose');

const { DEFAULT_PHASE, MAX_PHASE_LENGTH } = require('../utils/phases');

const requirementSchema = new mongoose.Schema(
  {
    reqId: { type: String, required: true, unique: true, trim: true },
    nlText: { type: String, required: true },
    nlDescription: { type: String, default: '' },
    // ADMIN ONLY. Never serialised to an annotator (see serializers.js).
    pragyanIncomp: { type: Number, enum: [0, 1], default: 0 },
    // Free-form group name chosen by the admin (see utils/phases.js). Not an
    // enum: the set of groups is whatever the dataset currently uses.
    phase: {
      type: String,
      trim: true,
      maxlength: MAX_PHASE_LENGTH,
      default: DEFAULT_PHASE,
    },
    order: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

module.exports = mongoose.model('Requirement', requirementSchema);

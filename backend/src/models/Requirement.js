'use strict';

const mongoose = require('mongoose');

const requirementSchema = new mongoose.Schema(
  {
    reqId: { type: String, required: true, unique: true, trim: true },
    nlText: { type: String, required: true },
    nlDescription: { type: String, default: '' },
    // ADMIN ONLY. Never serialised to an annotator (see serializers.js).
    pragyanIncomp: { type: Number, enum: [0, 1], default: 0 },
    phase: {
      type: String,
      enum: ['training', 'pilot', 'main'],
      default: 'main',
    },
    order: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

module.exports = mongoose.model('Requirement', requirementSchema);

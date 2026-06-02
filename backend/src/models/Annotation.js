'use strict';

const mongoose = require('mongoose');

const SLOT_VALUES = ['present', 'implied', 'missing'];

const slotsSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: SLOT_VALUES, default: 'missing' },
    condition: { type: String, enum: SLOT_VALUES, default: 'missing' },
    actor: { type: String, enum: SLOT_VALUES, default: 'missing' },
    modalVerb: { type: String, enum: SLOT_VALUES, default: 'missing' },
    action: { type: String, enum: SLOT_VALUES, default: 'missing' },
  },
  { _id: false }
);

const annotationSchema = new mongoose.Schema(
  {
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Requirement',
      required: true,
    },
    annotatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rimayText: { type: String, default: '' },
    slots: { type: slotsSchema, default: () => ({}) },
    conditionType: {
      type: String,
      enum: ['precondition', 'trigger', 'temporal', 'none'],
      default: 'none',
    },
    patternNumber: { type: Number, min: 1, max: 10, default: null },
    nonAtomic: { type: Boolean, default: false },
    nSystemResponses: { type: Number, default: null },
    // Computed server-side from slots (see utils/incompleteness.js). Never trusted from client.
    overallIncomplete: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'submitted'], default: 'draft' },
  },
  { timestamps: true }
);

// One annotation per annotator per requirement.
annotationSchema.index({ requirementId: 1, annotatorId: 1 }, { unique: true });

module.exports = mongoose.model('Annotation', annotationSchema);
module.exports.SLOT_VALUES = SLOT_VALUES;

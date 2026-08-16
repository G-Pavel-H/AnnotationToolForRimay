'use strict';

const mongoose = require('mongoose');

const SLOT_VALUES = ['present', 'implied', 'missing'];

const goldSlotsSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: SLOT_VALUES, default: 'missing' },
    condition: { type: String, enum: SLOT_VALUES, default: 'missing' },
    actor: { type: String, enum: SLOT_VALUES, default: 'missing' },
    modalVerb: { type: String, enum: SLOT_VALUES, default: 'missing' },
    action: { type: String, enum: SLOT_VALUES, default: 'missing' },
  },
  { _id: false }
);

/**
 * The gold standard for one requirement — deliberately **categorical only**.
 *
 * There is no adjudicated gold for the Rimay conversion *text*: a requirement
 * has as many valid conversions as it has annotators, so conversion quality is
 * measured annotator-to-annotator (each annotation keeps its own `rimayText`).
 * Adjudication resolves the slot labels, nothing else.
 */
const adjudicationSchema = new mongoose.Schema(
  {
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Requirement',
      required: true,
      unique: true,
    },
    goldSlots: { type: goldSlotsSchema, default: () => ({}) },
    goldConditionType: {
      type: String,
      enum: ['precondition', 'trigger', 'temporal', 'none'],
      default: 'none',
    },
    goldOverallIncomplete: { type: Boolean, default: false },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hadDisagreement: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    resolvedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

module.exports = mongoose.model('Adjudication', adjudicationSchema);

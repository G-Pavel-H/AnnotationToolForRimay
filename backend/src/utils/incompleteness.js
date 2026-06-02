'use strict';

// Mandatory Rimay slots. A requirement is structurally incomplete if any of
// these is "missing". SCOPE and CONDITION are optional and do not affect this.
const MANDATORY_SLOTS = ['actor', 'modalVerb', 'action'];

/**
 * Compute overallIncomplete from a slots object.
 * Authoritative server-side rule: true if any mandatory slot is "missing".
 * @param {Object} slots
 * @returns {boolean}
 */
function computeOverallIncomplete(slots) {
  if (!slots) return true;
  return MANDATORY_SLOTS.some((slot) => slots[slot] === 'missing');
}

module.exports = { computeOverallIncomplete, MANDATORY_SLOTS };

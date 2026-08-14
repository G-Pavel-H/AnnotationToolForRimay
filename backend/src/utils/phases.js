'use strict';

/**
 * Phases (a.k.a. groups) are free-form labels chosen by the admin, not a fixed
 * enum: a study may have "training"/"pilot"/"main", or "batch-1", "reliability",
 * whatever the design needs. The set of groups is therefore whatever the
 * requirements say it is — always read it from the data, never from a constant.
 *
 * These are the names offered in the UI when a dataset is still empty. They
 * carry no special meaning anywhere in the code.
 */
const SUGGESTED_PHASES = ['training', 'pilot', 'main'];

const DEFAULT_PHASE = 'main';

const MAX_PHASE_LENGTH = 40;

/**
 * Normalise a user-supplied group name: trim, collapse inner whitespace, cap
 * the length. Returns null when the value is not a usable name, so callers can
 * reject it explicitly instead of silently storing junk.
 */
function normalizePhase(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) return null;
  if (name.length > MAX_PHASE_LENGTH) return null;
  return name;
}

/**
 * Distinct group names across the given requirements, ordered by how many
 * requirements each holds (largest first, then alphabetically) so the busiest
 * group leads the UI.
 */
function phaseCounts(requirements) {
  const counts = new Map();
  requirements.forEach((r) => {
    const name = normalizePhase(r.phase) || DEFAULT_PHASE;
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([phase, count]) => ({ phase, count }))
    .sort((a, b) => b.count - a.count || a.phase.localeCompare(b.phase));
}

module.exports = {
  SUGGESTED_PHASES,
  DEFAULT_PHASE,
  MAX_PHASE_LENGTH,
  normalizePhase,
  phaseCounts,
};

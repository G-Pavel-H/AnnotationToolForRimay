'use strict';

/**
 * Reference LLM conversions, read from a static snapshot in this repo.
 *
 * `data/llm_reference.json` is a copy of one RQ1 experiment run, taken by hand
 * so the annotation tool stays self-contained — there is no live connection to
 * the experiment repo and nothing here regenerates it. To refresh it, re-copy
 * the file from a newer run.
 *
 * These conversions are **guidance, not gold**: on some requirements the model
 * reads better than the annotators, on others worse. They sit beside the human
 * text during curation so the reviewer can borrow a phrasing when it is
 * genuinely better, and ignore it otherwise.
 */

const fs = require('fs');
const path = require('path');

const REFERENCE_PATH = path.join(__dirname, '..', '..', 'data', 'llm_reference.json');

const EMPTY = {
  source: null,
  model: null,
  strategies: [],
  copiedAt: null,
  conversions: {},
};

let cached = null;

/**
 * The snapshot, parsed once and held in memory (it is small and never changes
 * at runtime). A missing or malformed file is not fatal: curation still works,
 * just without the reference column.
 */
function loadLlmReference() {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(REFERENCE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cached = { ...EMPTY, ...parsed, conversions: parsed.conversions || {} };
  } catch (err) {
    cached = EMPTY;
  }
  return cached;
}

module.exports = { loadLlmReference, REFERENCE_PATH };

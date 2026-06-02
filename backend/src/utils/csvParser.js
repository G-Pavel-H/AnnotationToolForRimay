'use strict';

const { parse } = require('csv-parse/sync');

/**
 * Robustly extract the Incompleteness count from a Python-dict-style string
 * such as "{'Ambiguity': 2, 'Incompleteness': 0}".
 * Returns 0 or 1 (clamped: any count >= 1 becomes 1), or 0 if absent/unparseable.
 */
function parseIncompleteness(finalDefectCount) {
  if (finalDefectCount == null) return 0;
  const str = String(finalDefectCount);
  // Match 'Incompleteness': <number> tolerating single/double quotes and spacing.
  const match = str.match(/['"]Incompleteness['"]\s*:\s*(\d+)/i);
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  if (Number.isNaN(n)) return 0;
  return n >= 1 ? 1 : 0;
}

/**
 * Extract the "Request Description" portion from a TextUsedForAnnotation string
 * of the form:
 *   "Request Number - 72 | Request Title - ... | Request Description - <desc>"
 * Falls back to the full text if the marker is absent.
 */
function extractDescription(nlText) {
  if (!nlText) return '';
  const marker = /Request Description\s*-\s*/i;
  const idx = String(nlText).search(marker);
  if (idx === -1) return String(nlText).trim();
  const after = String(nlText).slice(idx).replace(marker, '');
  return after.trim();
}

/**
 * Parse a Pragyan corpus CSV buffer/string into requirement-shaped objects.
 * Expects columns: RequestNumber-App, TextUsedForAnnotation, FinalDefectCount.
 * Tolerates the leading unnamed index columns present in the reconciled export.
 *
 * @param {Buffer|string} input
 * @returns {Array<{reqId, nlText, nlDescription, pragyanIncomp, order}>}
 */
function parseRequirementsCsv(input) {
  const records = parse(input, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    trim: true,
  });

  const out = [];
  records.forEach((row, i) => {
    const reqId = (row['RequestNumber-App'] || row['reqId'] || '').trim();
    const nlText = (row['TextUsedForAnnotation'] || row['nlText'] || '').trim();
    if (!reqId || !nlText) return; // skip malformed rows

    out.push({
      reqId,
      nlText,
      nlDescription: extractDescription(nlText),
      pragyanIncomp: parseIncompleteness(row['FinalDefectCount']),
      order: i,
    });
  });
  return out;
}

module.exports = {
  parseIncompleteness,
  extractDescription,
  parseRequirementsCsv,
};

'use strict';

// CLI importer for the Pragyan corpus CSV. Usage:
//   node scripts/import_requirements.js <path-to-csv> [phase]
// Upserts requirements by reqId. Optional phase (default: main).

const fs = require('fs');
const path = require('path');
const { connect, disconnect } = require('../src/db');
const Requirement = require('../src/models/Requirement');
const { parseRequirementsCsv } = require('../src/utils/csvParser');

async function run() {
  const csvPath = process.argv[2];
  const phase = process.argv[3] || 'main';
  if (!csvPath) {
    // eslint-disable-next-line no-console
    console.error('Usage: node scripts/import_requirements.js <path-to-csv> [phase]');
    process.exit(1);
  }
  const buf = fs.readFileSync(path.resolve(csvPath));
  const parsed = parseRequirementsCsv(buf);

  await connect();
  let created = 0;
  let updated = 0;
  for (const r of parsed) {
    const existing = await Requirement.findOne({ reqId: r.reqId });
    if (existing) {
      existing.nlText = r.nlText;
      existing.nlDescription = r.nlDescription;
      existing.pragyanIncomp = r.pragyanIncomp;
      if (existing.order === 0) existing.order = r.order;
      await existing.save();
      updated += 1;
    } else {
      await Requirement.create({ ...r, phase });
      created += 1;
    }
  }
  await disconnect();
  // eslint-disable-next-line no-console
  console.log(`Imported ${parsed.length} requirements (created ${created}, updated ${updated}).`);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Import failed:', err);
  process.exit(1);
});

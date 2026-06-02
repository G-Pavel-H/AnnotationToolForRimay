'use strict';

// Seeds the 4 study users (1 admin + 3 annotators). Idempotent: upserts by
// username and updates the password hash each run. Credentials come from env
// vars (see .env.example) with sensible local defaults.

const bcrypt = require('bcryptjs');
const { connect, disconnect } = require('../src/db');
const User = require('../src/models/User');

function parseUserSpec(spec, fallback) {
  const raw = spec || fallback;
  const [username, password, ...nameParts] = raw.split(':');
  return {
    username: username.trim(),
    password,
    displayName: nameParts.join(':').trim() || username.trim(),
  };
}

const SEED = [
  { role: 'admin', spec: process.env.SEED_ADMIN, fallback: 'admin:admin123:Admin User' },
  { role: 'annotator', spec: process.env.SEED_ANNOTATOR_1, fallback: 'Rafo:pass123:Rafo' },
  { role: 'annotator', spec: process.env.SEED_ANNOTATOR_2, fallback: 'Arthur:pass123:Arthur' },
  { role: 'annotator', spec: process.env.SEED_ANNOTATOR_3, fallback: 'Mko:pass123:Mko' },
];

async function seed() {
  await connect();
  for (const entry of SEED) {
    const { username, password, displayName } = parseUserSpec(entry.spec, entry.fallback);
    const passwordHash = await bcrypt.hash(password, 10);
    await User.findOneAndUpdate(
      { username },
      { username, passwordHash, displayName, role: entry.role },
      { upsert: true, setDefaultsOnInsert: true, new: true }
    );
    // eslint-disable-next-line no-console
    console.log(`Seeded ${entry.role}: ${username} (${displayName})`);
  }
  await disconnect();
  // eslint-disable-next-line no-console
  console.log('Done seeding users.');
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});

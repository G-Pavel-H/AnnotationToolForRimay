'use strict';

const createApp = require('./app');
const { connect } = require('./db');
const config = require('./config');

async function main() {
  await connect();
  // eslint-disable-next-line no-console
  console.log('Connected to MongoDB');

  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Rimay annotation backend listening on port ${config.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});

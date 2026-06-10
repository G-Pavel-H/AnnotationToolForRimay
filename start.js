#!/usr/bin/env node
'use strict';

/**
 * Launch the backend and the frontend together.
 *
 *   node start.js   (or:  npm start)
 *
 * Starts the API (port 4000) and the Angular dev server (port 4200), shows a
 * clear link once the app is ready, and shuts both down cleanly on Ctrl+C.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const APP_URL = 'http://localhost:4200';

function line(char = '─', n = 60) {
  return char.repeat(n);
}

// Pre-flight checks.
if (!fs.existsSync(path.join(BACKEND, '.env'))) {
  console.error(
    '\nNo backend/.env found. Run the setup first:\n\n    node setup.js   (or:  npm run setup)\n'
  );
  process.exit(1);
}
if (
  !fs.existsSync(path.join(BACKEND, 'node_modules')) ||
  !fs.existsSync(path.join(FRONTEND, 'node_modules'))
) {
  console.error(
    '\nDependencies are not installed. Run the setup first:\n\n    node setup.js   (or:  npm run setup)\n'
  );
  process.exit(1);
}

let frontendReady = false;
let bannerShown = false;

function showBanner() {
  if (bannerShown) return;
  bannerShown = true;
  console.log(
    `\n${line('═')}\n  ✅ Rimay Annotation Tool is running\n\n  Open:  ${APP_URL}\n\n  (API on http://localhost:4000)\n  Press Ctrl+C here to stop everything.\n${line('═')}\n`
  );
}

/**
 * Spawn a child `npm` process, prefixing its output and scanning for a
 * readiness marker.
 */
function launch(name, cwd, args, color, onReady) {
  const child = spawn('npm', args, { cwd, shell: true });
  const prefix = `${color}[${name}]\x1b[0m`;

  const handle = (buf, isErr) => {
    const text = buf.toString();
    text
      .split(/\r?\n/)
      .filter((l) => l.length)
      .forEach((l) => console.log(`${prefix} ${l}`));
    if (onReady) onReady(text);
  };

  child.stdout.on('data', (b) => handle(b, false));
  child.stderr.on('data', (b) => handle(b, true));
  child.on('exit', (code) => {
    console.log(`${prefix} process exited (code ${code}). Shutting down.`);
    shutdown();
  });
  return child;
}

const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

const backend = launch('backend', BACKEND, ['start'], CYAN);

const frontend = launch('frontend', FRONTEND, ['start'], MAGENTA, (text) => {
  // Angular's dev server prints the local URL once it's serving.
  if (!frontendReady && /localhost:4200/.test(text)) {
    frontendReady = true;
    // Small delay so the banner lands after the dev-server's own output.
    setTimeout(showBanner, 300);
  }
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of [backend, frontend]) {
    if (c && !c.killed) {
      try {
        c.kill();
      } catch (_) {
        /* ignore */
      }
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(
  `\n${line()}\nStarting backend (port 4000) and frontend (port 4200)…\nThe app link will appear here once the frontend has compiled.\n${line()}`
);

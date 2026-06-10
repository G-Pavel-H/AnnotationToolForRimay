#!/usr/bin/env node
'use strict';

/**
 * One-step setup for annotators.
 *
 *   node setup.js
 *
 * Prompts for the shared MongoDB connection string, writes backend/.env
 * (auto-generating a private JWT_SECRET), and installs all dependencies for
 * both the backend and the frontend.
 *
 * Annotators do NOT seed users or import the dataset — the admin does that once
 * against the shared database. This script just connects you to it.
 *
 * Flags:
 *   --no-install   Skip `npm install` (just (re)write backend/.env).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const ENV_PATH = path.join(BACKEND, '.env');
const ENV_EXAMPLE_PATH = path.join(BACKEND, '.env.example');

const SKIP_INSTALL = process.argv.includes('--no-install');

function line(char = '─', n = 60) {
  return char.repeat(n);
}

/**
 * Build a prompter that works both interactively (TTY) and with piped/automated
 * input. For non-TTY input we pre-read all of stdin and serve it line by line,
 * which avoids readline dropping lines on EOF during sequential questions.
 */
function createPrompter() {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return {
      ask: (question) => new Promise((resolve) => rl.question(question, resolve)),
      close: () => rl.close(),
    };
  }
  let lines = [];
  try {
    lines = fs.readFileSync(0, 'utf8').split(/\r?\n/);
  } catch (_) {
    lines = [];
  }
  let i = 0;
  return {
    ask: (question) => {
      process.stdout.write(question);
      const answer = i < lines.length ? lines[i] : '';
      i += 1;
      process.stdout.write(`${answer}\n`);
      return Promise.resolve(answer);
    },
    close: () => {},
  };
}

function cleanUri(raw) {
  let s = (raw || '').trim();
  // Strip wrapping quotes and an accidental leading "MONGO_URI=".
  s = s.replace(/^MONGO_URI\s*=\s*/i, '').trim();
  s = s.replace(/^['"]|['"]$/g, '').trim();
  return s;
}

function looksLikeMongoUri(s) {
  return /^mongodb(\+srv)?:\/\/.+/.test(s);
}

function buildEnv(uri) {
  const jwtSecret = crypto.randomBytes(32).toString('hex');

  // Prefer the committed template so this stays in sync with the project.
  let template;
  if (fs.existsSync(ENV_EXAMPLE_PATH)) {
    template = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  } else {
    template = [
      '# Backend configuration',
      'PORT=4000',
      'MONGO_URI=',
      'JWT_SECRET=',
      'JWT_EXPIRES_IN=7d',
      '',
      'SEED_ADMIN=admin:admin123:Admin User',
      'SEED_ANNOTATOR_1=Rafo:pass123:Rafo',
      'SEED_ANNOTATOR_2=Arthur:pass123:Arthur',
      'SEED_ANNOTATOR_3=Mko:pass123:Mko',
      '',
    ].join('\n');
  }

  let out = template;
  // Replace (or append) MONGO_URI.
  if (/^MONGO_URI\s*=.*$/m.test(out)) {
    out = out.replace(/^MONGO_URI\s*=.*$/m, `MONGO_URI=${uri}`);
  } else {
    out += `\nMONGO_URI=${uri}\n`;
  }
  // Replace (or append) JWT_SECRET with a unique, machine-local secret.
  if (/^JWT_SECRET\s*=.*$/m.test(out)) {
    out = out.replace(/^JWT_SECRET\s*=.*$/m, `JWT_SECRET=${jwtSecret}`);
  } else {
    out += `\nJWT_SECRET=${jwtSecret}\n`;
  }
  return out;
}

function npmInstall(cwd, label) {
  console.log(`\n${line()}\nInstalling ${label} dependencies (this can take a minute)…\n${line()}`);
  const res = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd,
    stdio: 'inherit',
    shell: true,
  });
  if (res.status !== 0) {
    throw new Error(`npm install failed for ${label} (exit ${res.status}).`);
  }
}

async function main() {
  console.log(`\n${line('═')}\n  Rimay Annotation Tool — setup\n${line('═')}\n`);

  if (!fs.existsSync(BACKEND) || !fs.existsSync(FRONTEND)) {
    console.error(
      'Error: run this from the project root (the folder containing "backend" and "frontend").'
    );
    process.exit(1);
  }

  const prompter = createPrompter();

  try {
    // Warn before clobbering an existing .env (e.g. the admin's real config).
    if (fs.existsSync(ENV_PATH)) {
      const overwrite = await prompter.ask(
        'A backend/.env already exists. Overwrite it with a new connection string? (y/N) '
      );
      if (!/^y(es)?$/i.test(overwrite.trim())) {
        console.log('\nKeeping the existing backend/.env. Skipping config step.');
        prompter.close();
        if (!SKIP_INSTALL) {
          npmInstall(BACKEND, 'backend');
          npmInstall(FRONTEND, 'frontend');
        }
        printDone();
        return;
      }
    }

    let uri = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const raw = await prompter.ask(
        '\nPaste the MongoDB connection string (MONGO_URI) and press Enter:\n> '
      );
      uri = cleanUri(raw);
      if (looksLikeMongoUri(uri)) break;
      console.log(
        '  ⚠  That doesn\'t look like a MongoDB URI (it should start with "mongodb://" or "mongodb+srv://"). Try again.'
      );
      uri = '';
    }
    if (!uri) {
      console.error('\nNo valid connection string provided. Aborting.');
      prompter.close();
      process.exit(1);
    }

    fs.writeFileSync(ENV_PATH, buildEnv(uri), 'utf8');
    console.log(`\n✓ Wrote ${path.relative(ROOT, ENV_PATH)} (with a private, auto-generated JWT_SECRET).`);

    prompter.close();

    if (!SKIP_INSTALL) {
      npmInstall(BACKEND, 'backend');
      npmInstall(FRONTEND, 'frontend');
    } else {
      console.log('\n(Skipped npm install — --no-install was passed.)');
    }

    printDone();
  } catch (err) {
    console.error(`\nSetup failed: ${err.message}`);
    process.exit(1);
  }
}

function printDone() {
  console.log(
    `\n${line('═')}\n  ✅ Setup complete!\n\n  To start the app, run:\n\n      npm start\n        (or:  node start.js)\n\n  Then open the link it prints (http://localhost:4200) and log in.\n${line('═')}\n`
  );
}

main();

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { connect, disconnect } = require('../src/db');
const createApp = require('../src/app');
const User = require('../src/models/User');
const Requirement = require('../src/models/Requirement');

let mongod;
let app;
let request;

// Minimal supertest-free HTTP helper using the running app via supertest.
const supertest = require('supertest');

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connect(mongod.getUri());
  app = createApp();
  request = supertest(app);

  await User.create({
    username: 'admin',
    passwordHash: await bcrypt.hash('admin123', 10),
    displayName: 'Admin',
    role: 'admin',
  });
  await User.create({
    username: 'ann1',
    passwordHash: await bcrypt.hash('pass123', 10),
    displayName: 'Annotator One',
    role: 'annotator',
  });

  await Requirement.create({
    reqId: '72-Signal',
    nlText: 'Request Description - I want a preview.',
    nlDescription: 'I want a preview.',
    pragyanIncomp: 1,
    phase: 'pilot',
    order: 0,
  });
});

after(async () => {
  await disconnect();
  if (mongod) await mongod.stop();
});

async function login(username, password) {
  const res = await request.post('/api/auth/login').send({ username, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

test('login returns a token and user; bad password rejected', async () => {
  const token = await login('admin', 'admin123');
  assert.ok(token);
  const bad = await request.post('/api/auth/login').send({ username: 'admin', password: 'nope' });
  assert.equal(bad.status, 401);
});

test('GET /me returns current user', async () => {
  const token = await login('ann1', 'pass123');
  const res = await request.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.username, 'ann1');
  assert.equal(res.body.user.role, 'annotator');
});

test('annotator requirements list strips pragyanIncomp and joins status', async () => {
  const token = await login('ann1', 'pass123');
  const res = await request.get('/api/requirements').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  const req = res.body.requirements[0];
  assert.equal(req.pragyanIncomp, undefined, 'pragyanIncomp must be stripped for annotators');
  assert.equal(req.annotationStatus, 'not_started');
});

test('admin requirements list includes pragyanIncomp', async () => {
  const token = await login('admin', 'admin123');
  const res = await request.get('/api/requirements').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.requirements[0].pragyanIncomp, 1);
});

test('admin-only route blocked for annotator', async () => {
  const token = await login('ann1', 'pass123');
  const res = await request.get('/api/admin/progress').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403);
});

test('annotation upsert computes overallIncomplete server-side', async () => {
  const token = await login('ann1', 'pass123');
  const reqDoc = await Requirement.findOne({ reqId: '72-Signal' });

  // actor missing => incomplete, regardless of what client claims
  const res = await request
    .post('/api/annotations')
    .set('Authorization', `Bearer ${token}`)
    .send({
      requirementId: reqDoc._id.toString(),
      slots: { scope: 'missing', condition: 'missing', actor: 'missing', modalVerb: 'implied', action: 'present' },
      overallIncomplete: false, // should be ignored
      status: 'submitted', // should be ignored
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.annotation.overallIncomplete, true);
  assert.equal(res.body.annotation.status, 'draft');

  // Update to all-present/implied => complete
  const id = res.body.annotation._id;
  const upd = await request
    .put(`/api/annotations/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ slots: { scope: 'missing', condition: 'missing', actor: 'implied', modalVerb: 'implied', action: 'present' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.annotation.overallIncomplete, false);

  // Submit
  const sub = await request.post(`/api/annotations/${id}/submit`).set('Authorization', `Bearer ${token}`);
  assert.equal(sub.status, 200);
  assert.equal(sub.body.annotation.status, 'submitted');
});

test('one annotation per annotator per requirement (upsert, not duplicate)', async () => {
  const token = await login('ann1', 'pass123');
  const reqDoc = await Requirement.findOne({ reqId: '72-Signal' });
  const res = await request
    .post('/api/annotations')
    .set('Authorization', `Bearer ${token}`)
    .send({ requirementId: reqDoc._id.toString(), notes: 'second save' });
  assert.equal(res.status, 201);
  assert.equal(res.body.annotation.notes, 'second save');
});

test('admin CSV import upserts requirements and parses incompleteness', async () => {
  const token = await login('admin', 'admin123');
  const csv =
    ',Unnamed: 0,RequestNumber-App,FinalDefectCount,TextUsedForAnnotation\n' +
    '0,0,500-Test,"{\'Ambiguity\': 0, \'Incompleteness\': 1}","Request Number - 500 | Request Title - T | Request Description - A brand new requirement."\n';
  const res = await request
    .post('/api/admin/requirements/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from(csv), 'corpus.csv');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.created, 1);

  const created = await Requirement.findOne({ reqId: '500-Test' });
  assert.ok(created);
  assert.equal(created.pragyanIncomp, 1);
  assert.equal(created.nlDescription, 'A brand new requirement.');

  // Annotators must not see the imported pragyan label.
  const annToken = await login('ann1', 'pass123');
  const list = await request.get('/api/requirements').set('Authorization', `Bearer ${annToken}`);
  const imported = list.body.requirements.find((r) => r.reqId === '500-Test');
  assert.ok(imported);
  assert.equal(imported.pragyanIncomp, undefined);
});

test('import endpoint blocked for annotators', async () => {
  const token = await login('ann1', 'pass123');
  const res = await request
    .post('/api/admin/requirements/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('RequestNumber-App,TextUsedForAnnotation,FinalDefectCount\n1-A,x,{}'), 'c.csv');
  assert.equal(res.status, 403);
});

test('admin export includes pragyanIncomp and flattened slots', async () => {
  const token = await login('admin', 'admin123');
  const res = await request.get('/api/admin/export?format=json').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  const row = res.body.rows[0];
  assert.equal(row.pragyanIncomp, 1);
  assert.ok('slot_actor' in row);
  assert.ok('gold_actor' in row);

  const csv = await request.get('/api/admin/export?format=csv').set('Authorization', `Bearer ${token}`);
  assert.equal(csv.status, 200);
  assert.ok(csv.text.includes('pragyanIncomp'));
});

test('export can be scoped to a single phase', async () => {
  const token = await login('admin', 'admin123');

  // The seeded requirement 72-Signal is in the "pilot" phase.
  const all = await request.get('/api/admin/export?format=json').set('Authorization', `Bearer ${token}`);
  const pilot = await request.get('/api/admin/export?format=json&phase=pilot').set('Authorization', `Bearer ${token}`);
  const main = await request.get('/api/admin/export?format=json&phase=main').set('Authorization', `Bearer ${token}`);

  assert.equal(pilot.body.phase, 'pilot');
  assert.ok(pilot.body.rows.every((r) => r.phase === 'pilot'));
  assert.ok(pilot.body.rows.some((r) => r.reqId === '72-Signal'));
  // Scoped export is a subset of all.
  assert.ok(pilot.body.count <= all.body.count);
  // The pilot requirement should not appear in the main-only export.
  assert.ok(main.body.rows.every((r) => r.reqId !== '72-Signal'));

  const csv = await request
    .get('/api/admin/export?format=csv&phase=pilot')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-disposition'], /rimay_export_pilot\.csv/);
});

test('admin can create a requirement; duplicate reqId rejected; annotators blocked', async () => {
  const adminToken = await login('admin', 'admin123');

  const created = await request
    .post('/api/admin/requirements')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ reqId: '900-New', nlDescription: 'A manually added requirement.', phase: 'main', pragyanIncomp: 1 });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.requirement.reqId, '900-New');
  // nlText falls back to the description when omitted.
  assert.equal(created.body.requirement.nlText, 'A manually added requirement.');
  assert.equal(created.body.requirement.pragyanIncomp, 1);

  const dup = await request
    .post('/api/admin/requirements')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ reqId: '900-New', nlDescription: 'dup' });
  assert.equal(dup.status, 409);

  const annToken = await login('ann1', 'pass123');
  const blocked = await request
    .post('/api/admin/requirements')
    .set('Authorization', `Bearer ${annToken}`)
    .send({ reqId: '901-X', nlDescription: 'nope' });
  assert.equal(blocked.status, 403);

  // The annotator must not see the admin-only pragyan label on the new requirement.
  const list = await request.get('/api/requirements').set('Authorization', `Bearer ${annToken}`);
  const seen = list.body.requirements.find((r) => r.reqId === '900-New');
  assert.ok(seen);
  assert.equal(seen.pragyanIncomp, undefined);
});

test('admin can edit a requirement and delete it (cascading annotations)', async () => {
  const adminToken = await login('admin', 'admin123');
  const created = await request
    .post('/api/admin/requirements')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ reqId: '902-Edit', nlDescription: 'before' });
  const id = created.body.requirement._id;

  // Edit the text.
  const edited = await request
    .put(`/api/admin/requirements/${id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nlDescription: 'after the fix' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.requirement.nlDescription, 'after the fix');

  // An annotator adds an annotation to it.
  const annToken = await login('ann1', 'pass123');
  await request
    .post('/api/annotations')
    .set('Authorization', `Bearer ${annToken}`)
    .send({ requirementId: id, notes: 'will be cascaded away' });

  // Annotators cannot delete.
  const blocked = await request.delete(`/api/admin/requirements/${id}`).set('Authorization', `Bearer ${annToken}`);
  assert.equal(blocked.status, 403);

  // Admin deletes; the annotation is cascaded.
  const del = await request.delete(`/api/admin/requirements/${id}`).set('Authorization', `Bearer ${adminToken}`);
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(del.body.deletedAnnotations, 1);

  const gone = await request.get(`/api/requirements/${id}`).set('Authorization', `Bearer ${adminToken}`);
  assert.equal(gone.status, 404);
});

test('clear-data endpoint blocked for annotators', async () => {
  const token = await login('ann1', 'pass123');
  const res = await request.delete('/api/admin/data').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403);
});

// NOTE: this wipes the shared test DB, so it must be the LAST test in the file.
test('admin clear-data wipes requirements, annotations and adjudications (keeps users)', async () => {
  const token = await login('admin', 'admin123');

  const before = await request.get('/api/requirements').set('Authorization', `Bearer ${token}`);
  assert.ok(before.body.requirements.length > 0);

  const res = await request.delete('/api/admin/data').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.deletedRequirements > 0);

  const after = await request.get('/api/requirements').set('Authorization', `Bearer ${token}`);
  assert.equal(after.body.requirements.length, 0);

  // Users untouched — admin can still authenticate.
  const me = await request.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'admin');
});

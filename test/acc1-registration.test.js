// ACC-1 Account Registration: one test per confirmation criterion.
const { test } = require('node:test');
const assert = require('node:assert');
const { makeApp, request } = require('../testkit/helpers');

const valid = {
  first_name: 'Ava', last_name: 'Nguyen', email: 'ava@example.com',
  licence_no: 'N1234-56789-01234', password: 'longpassword', consent: 'on',
};

test('ACC-1.1 valid details create a customer account', async () => {
  const { app, db } = makeApp();
  const res = await request(app).post('/register').type('form').send(valid);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get('ava@example.com');
  assert.ok(user, 'user row exists');
  assert.strictEqual(user.role, 'customer');
  assert.ok(user.consent_at, 'consent time recorded');
});

test('ACC-1.2 duplicate email is rejected with a clear message', async () => {
  const { app } = makeApp();
  await request(app).post('/register').type('form').send(valid);
  const res = await request(app).post('/register').type('form').send({ ...valid, email: 'AVA@example.com' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /An account with this email already exists/);
});

test('ACC-1.3 passwords shorter than 8 characters are rejected', async () => {
  const { app, db } = makeApp();
  const res = await request(app).post('/register').type('form').send({ ...valid, password: 'short7!' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /at least 8 characters/);
  assert.strictEqual(db.prepare('SELECT 1 FROM users WHERE email = ?').get(valid.email), undefined);
});

test('ACC-1.4 account is not created without consent to the privacy notice', async () => {
  const { app, db } = makeApp();
  const { consent, ...noConsent } = valid;
  const res = await request(app).post('/register').type('form').send(noConsent);
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /agree to the privacy notice/);
  assert.strictEqual(db.prepare('SELECT 1 FROM users WHERE email = ?').get(valid.email), undefined);
});

test('ACC-1 extra: public sign-up cannot create a staff or manager account', async () => {
  const { app, db } = makeApp();
  await request(app).post('/register').type('form').send({ ...valid, role: 'manager' });
  assert.strictEqual(db.prepare('SELECT role FROM users WHERE email = ?').get(valid.email).role, 'customer');
});

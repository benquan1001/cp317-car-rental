// ACC-2 Login and Logout
const { test } = require('node:test');
const assert = require('node:assert');
const { makeApp, loginAs, ACCOUNTS, request } = require('../testkit/helpers');
const { LOCK_MS } = require('../src/auth');

test('ACC-2.1 valid credentials open the home page for each role', async () => {
  const { app } = makeApp();
  const homes = { customer: '/search', staff: '/staff/fleet', manager: '/manager/reports' };
  for (const [role, [email, pw]] of Object.entries(ACCOUNTS)) {
    const { res } = await loginAs(app, email, pw);
    assert.strictEqual(res.status, 302, role);
    assert.strictEqual(res.headers.location, homes[role], role);
  }
});

test('ACC-2.2 wrong email and wrong password show the same generic error', async () => {
  const { app } = makeApp();
  const a = await request(app).post('/login').type('form').send({ email: 'nobody@x.com', password: 'whatever1' });
  const b = await request(app).post('/login').type('form').send({ email: ACCOUNTS.customer[0], password: 'wrongpass' });
  assert.strictEqual(a.status, 401);
  assert.strictEqual(b.status, 401);
  const msg = (t) => t.match(/<p class="errors" role="alert">([^<]+)</)[1];
  assert.strictEqual(msg(a.text), msg(b.text));
  assert.strictEqual(msg(a.text), 'Incorrect email or password.');
});

test('ACC-2.3 logging out ends the session and protected pages redirect to login', async () => {
  const { app } = makeApp();
  const { agent } = await loginAs(app, ...ACCOUNTS.customer);
  assert.strictEqual((await agent.get('/search')).status, 200);
  await agent.post('/logout');
  const after = await agent.get('/search');
  assert.strictEqual(after.status, 302);
  assert.match(after.headers.location, /^\/login/);
});

test('ACC-2.4 no plain-text passwords are stored', async () => {
  const { db } = makeApp();
  const rows = db.prepare('SELECT password_hash FROM users').all();
  for (const r of rows) {
    assert.match(r.password_hash, /^\$2[aby]\$10\$/, 'bcrypt hash with cost 10');
    assert.ok(!['Customer123!', 'Staff123!', 'Manager123!'].includes(r.password_hash));
  }
});

test('ACC-2 conversation: account locks for 15 minutes after 5 failed attempts', async () => {
  const { app, db } = makeApp();
  const [email, pw] = ACCOUNTS.customer;
  for (let i = 0; i < 5; i++) await request(app).post('/login').type('form').send({ email, password: 'bad-password' });
  const locked = await request(app).post('/login').type('form').send({ email, password: pw });
  assert.strictEqual(locked.status, 401, 'correct password refused while locked');
  assert.match(locked.text, /Too many failed attempts/);
  const until = db.prepare('SELECT locked_until FROM users WHERE email = ?').get(email).locked_until;
  assert.ok(Math.abs(until - (Date.now() + LOCK_MS)) < 5000, 'lock lasts about 15 minutes');
  // Simulate the 15 minutes passing
  db.prepare('UPDATE users SET locked_until = ? WHERE email = ?').run(Date.now() - 1, email);
  const ok = await request(app).post('/login').type('form').send({ email, password: pw });
  assert.strictEqual(ok.status, 302, 'login works again after the lock expires');
});

test('ACC-2 conversation: idle sessions expire', async () => {
  const { app } = makeApp({ idleMs: 1500 }); // 1.5 s stands in for 30 minutes
  const { agent } = await loginAs(app, ...ACCOUNTS.customer);
  assert.strictEqual((await agent.get('/search')).status, 200);
  await new Promise((r) => setTimeout(r, 2600)); // cookie expiry has 1-second resolution
  const res = await agent.get('/search');
  assert.strictEqual(res.status, 302);
  assert.match(res.headers.location, /^\/login/);
});

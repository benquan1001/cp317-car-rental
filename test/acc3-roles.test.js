// ACC-3 Role-Based Access
const { test } = require('node:test');
const assert = require('node:assert');
const { makeApp, loginAs, ACCOUNTS } = require('../testkit/helpers');

const STAFF_URLS = ['/staff/fleet', '/staff/fleet/new', '/staff/fleet/1/edit'];
const MANAGER_URLS = ['/manager/reports', '/manager/staff'];

test('ACC-3.1 a customer opening staff or manager URLs gets access denied', async () => {
  const { app } = makeApp();
  const { agent } = await loginAs(app, ...ACCOUNTS.customer);
  for (const url of [...STAFF_URLS, ...MANAGER_URLS]) {
    const res = await agent.get(url);
    assert.strictEqual(res.status, 403, url);
    assert.match(res.text, /Access denied/);
  }
  // The check runs on the server: a hand-made POST is refused too
  const post = await agent.post('/staff/fleet/1/retire');
  assert.strictEqual(post.status, 403);
});

test('ACC-3.2 staff cannot open the reports pages', async () => {
  const { app } = makeApp();
  const { agent } = await loginAs(app, ...ACCOUNTS.staff);
  for (const url of MANAGER_URLS) assert.strictEqual((await agent.get(url)).status, 403, url);
  assert.strictEqual((await agent.get('/staff/fleet')).status, 200, 'staff can still use the fleet page');
});

test('ACC-3.3 a manager can create a staff account and assign its role', async () => {
  const { app, db } = makeApp();
  const { agent } = await loginAs(app, ...ACCOUNTS.manager);
  const res = await agent.post('/manager/staff').type('form').send({
    first_name: 'Riley', last_name: 'Chen', email: 'riley@carrental.test', password: 'TempPass1', role: 'staff',
  });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(db.prepare('SELECT role FROM users WHERE email = ?').get('riley@carrental.test').role, 'staff');
  const { res: login } = await loginAs(app, 'riley@carrental.test', 'TempPass1');
  assert.strictEqual(login.headers.location, '/staff/fleet', 'new staff member lands on Fleet');
});

test('ACC-3 extra: visitors who are not logged in are sent to login', async () => {
  const { app } = makeApp();
  const { request } = require('../testkit/helpers');
  for (const url of ['/search', ...STAFF_URLS, ...MANAGER_URLS]) {
    const res = await request(app).get(url);
    assert.strictEqual(res.status, 302, url);
    assert.match(res.headers.location, /^\/login/);
  }
});

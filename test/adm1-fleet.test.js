// ADM-1 Manage Fleet
const { test } = require('node:test');
const assert = require('node:assert');
const { makeApp, loginAs, ACCOUNTS, day } = require('../testkit/helpers');

const newCar = {
  plate: 'TEST 999', make: 'Subaru', model: 'Crosstrek', year: '2025', category: 'SUV',
  seats: '5', transmission: 'Automatic', daily_rate: '66.50', location_id: '1',
};
const search = (agent, loc = 1) => agent.get(`/search?location_id=${loc}&pickup=${day(30)}&return=${day(33)}`);

test('ADM-1.1 staff can add a car and it appears in search', async () => {
  const { app } = makeApp();
  const { agent: staff } = await loginAs(app, ...ACCOUNTS.staff);
  const res = await staff.post('/staff/fleet/new').type('form').send(newCar);
  assert.strictEqual(res.status, 302);
  const { agent: cust } = await loginAs(app, ...ACCOUNTS.customer);
  assert.match((await search(cust)).text, /2025 Subaru Crosstrek/);
});

test('ADM-1.2 staff can edit a field and the change shows immediately', async () => {
  const { app, db } = makeApp();
  const { agent: staff } = await loginAs(app, ...ACCOUNTS.staff);
  const car = db.prepare("SELECT * FROM cars WHERE plate = 'CRWT 103'").get();
  const res = await staff.post(`/staff/fleet/${car.id}/edit`).type('form').send({ ...car, daily_rate: '41.25' });
  assert.strictEqual(res.status, 302);
  const { agent: cust } = await loginAs(app, ...ACCOUNTS.customer);
  assert.match((await search(cust, car.location_id)).text, /\$41\.25\/day/);
});

test('ADM-1.3 a retired car leaves search but stays linked to past reservations', async () => {
  const { app, db } = makeApp();
  const { agent: staff } = await loginAs(app, ...ACCOUNTS.staff);
  const car = db.prepare("SELECT * FROM cars WHERE plate = 'CRWT 101'").get(); // has a seeded reservation
  await staff.post(`/staff/fleet/${car.id}/retire`);
  const { agent: cust } = await loginAs(app, ...ACCOUNTS.customer);
  assert.doesNotMatch((await search(cust)).text, /Toyota Corolla/);
  assert.strictEqual(db.prepare('SELECT status FROM cars WHERE id = ?').get(car.id).status, 'retired');
  assert.ok(db.prepare('SELECT 1 FROM reservations WHERE car_id = ?').get(car.id), 'reservation history kept');
  assert.match((await staff.get('/staff/fleet?show=retired')).text, /CRWT 101/);
});

test('ADM-1.4 required fields are validated before saving', async () => {
  const { app, db } = makeApp();
  const { agent: staff } = await loginAs(app, ...ACCOUNTS.staff);
  const before = db.prepare('SELECT COUNT(*) n FROM cars').get().n;
  const res = await staff.post('/staff/fleet/new').type('form').send({ ...newCar, make: '', daily_rate: '0', category: 'Boat' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /Make is required/);
  assert.match(res.text, /Daily rate must be greater than \$0/);
  assert.match(res.text, /Choose a category/);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM cars').get().n, before);
  const dup = await staff.post('/staff/fleet/new').type('form').send({ ...newCar, plate: 'CRWT 101' });
  assert.match(dup.text, /plate already exists/);
});

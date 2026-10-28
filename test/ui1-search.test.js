// UI-1 Car Search
const { test } = require('node:test');
const assert = require('node:assert');
const { makeApp, loginAs, ACCOUNTS, day } = require('../testkit/helpers');
const { searchAvailableCars } = require('../src/search');

// Seeded bookings at Waterloo (location 1): Corolla day3-day7, RAV4 day5-day9
const plates = (db, from, to, categories = []) =>
  searchAvailableCars(db, { location_id: 1, pickup: day(from), ret: day(to), categories }).map((c) => c.plate);

test('UI-1.1 results show only cars free for the whole range at the chosen location', () => {
  const { db } = makeApp();
  const r = plates(db, 4, 6);
  assert.ok(!r.includes('CRWT 101'), 'Corolla booked day3-7 is hidden');
  assert.ok(!r.includes('CRWT 105'), 'RAV4 booked day5-9 overlaps the end of the range');
  assert.ok(r.includes('CRWT 103'), 'free car is shown');
  assert.ok(r.every((p) => p.startsWith('CRWT')), 'only Waterloo cars');
  // Back-to-back: a car returned on day 7 can be picked up on day 7
  assert.ok(plates(db, 7, 8).includes('CRWT 101'));
  // A range that fully contains a booking is blocked too
  assert.ok(!plates(db, 2, 10).includes('CRWT 101'));
  // Cancelled bookings do not block
  db.prepare("UPDATE reservations SET status = 'cancelled' WHERE car_id = (SELECT id FROM cars WHERE plate = 'CRWT 101')").run();
  assert.ok(plates(db, 4, 6).includes('CRWT 101'));
});

test('UI-1.1 results are sorted by daily rate', () => {
  const { db } = makeApp();
  const rates = searchAvailableCars(db, { location_id: 1, pickup: day(20), ret: day(22) }).map((c) => c.daily_rate);
  assert.deepStrictEqual(rates, [...rates].sort((a, b) => a - b));
});

test('UI-1.2 the category filter narrows the results', async () => {
  const { app } = makeApp();
  const { agent } = await loginAs(app, ...ACCOUNTS.customer);
  const res = await agent.get(`/search?location_id=1&pickup=${day(20)}&return=${day(22)}&category=SUV`);
  assert.match(res.text, /2 cars available/);
  assert.match(res.text, /RAV4/);
  assert.doesNotMatch(res.text, /Corolla/);
});

test('UI-1.3 a message appears when no cars match', async () => {
  const { app } = makeApp();
  const { agent } = await loginAs(app, ...ACCOUNTS.customer);
  const res = await agent.get(`/search?location_id=2&pickup=${day(20)}&return=${day(22)}&category=Luxury`);
  assert.match(res.text, /0 cars available/);
  assert.match(res.text, /No cars match/);
});

test('UI-1 extra: invalid dates are rejected', async () => {
  const { app } = makeApp();
  const { agent } = await loginAs(app, ...ACCOUNTS.customer);
  const res = await agent.get(`/search?location_id=1&pickup=${day(5)}&return=${day(5)}`);
  assert.match(res.text, /Return date must be after the pickup date/);
  const past = await agent.get(`/search?location_id=1&pickup=${day(-2)}&return=${day(1)}`);
  assert.match(past.text, /cannot be in the past/);
});

test('UI-1.4 results load within 2 seconds with a 500-car fleet', async () => {
  const { app, db } = makeApp({ extraCars: 484 });
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM cars').get().n, 500);
  const server = app.listen(0); // one shared server for 20 concurrent users
  const { agent } = await loginAs(server, ...ACCOUNTS.customer);
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    agent.get(`/search?location_id=${(i % 3) + 1}&pickup=${day(2)}&return=${day(9)}`).expect(200)));
  const elapsed = Date.now() - t0;
  server.close();
  console.log(`  20 concurrent searches over 500 cars: ${elapsed} ms total`);
  assert.ok(elapsed < 2000, `took ${elapsed} ms`);
});

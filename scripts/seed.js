// Loads demo data: npm run seed        (wipes and refills data/car_rental.db)
// Larger fleet for performance testing: npm run seed -- --cars 500
const fs = require('fs');
const { openDb } = require('../src/db');
const { hashPassword } = require('../src/auth');

function seed(db, { extraCars = 0 } = {}) {
  db.exec('DELETE FROM reservations; DELETE FROM cars; DELETE FROM users;');
  const loc = Object.fromEntries(db.prepare('SELECT name, id FROM locations').all().map((r) => [r.name, r.id]));

  const addUser = db.prepare(`INSERT INTO users (first_name, last_name, email, licence_no, password_hash, role, consent_at)
                              VALUES (?, ?, ?, ?, ?, ?, ?)`);
  addUser.run('Morgan', 'Lee', 'manager@carrental.test', null, hashPassword('Manager123!'), 'manager', null);
  addUser.run('Sam', 'Patel', 'staff@carrental.test', null, hashPassword('Staff123!'), 'staff', null);
  const customer = addUser.run('Jordan', 'Smith', 'customer@carrental.test', 'S1234-56789-01234', hashPassword('Customer123!'), 'customer', new Date().toISOString()).lastInsertRowid;

  const addCar = db.prepare(`INSERT INTO cars (plate, make, model, year, category, seats, transmission, daily_rate, location_id)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const fleet = [
    ['CRWT 101', 'Toyota', 'Corolla', 2024, 'Compact', 5, 'Automatic', 48, 'Waterloo'],
    ['CRWT 102', 'Honda', 'Civic', 2023, 'Compact', 5, 'Manual', 44, 'Waterloo'],
    ['CRWT 103', 'Hyundai', 'Accent', 2023, 'Economy', 5, 'Automatic', 39, 'Waterloo'],
    ['CRWT 104', 'Kia', 'Rio', 2022, 'Economy', 5, 'Automatic', 37, 'Waterloo'],
    ['CRWT 105', 'Toyota', 'RAV4', 2025, 'SUV', 5, 'Automatic', 74, 'Waterloo'],
    ['CRWT 106', 'Honda', 'CR-V', 2024, 'SUV', 5, 'Automatic', 71, 'Waterloo'],
    ['CRWT 107', 'Chrysler', 'Pacifica', 2023, 'Van', 7, 'Automatic', 90, 'Waterloo'],
    ['CRWT 108', 'BMW', '330i', 2024, 'Luxury', 5, 'Automatic', 129, 'Waterloo'],
    ['CRKT 201', 'Nissan', 'Sentra', 2023, 'Compact', 5, 'Automatic', 46, 'Kitchener'],
    ['CRKT 202', 'Mitsubishi', 'Mirage', 2022, 'Economy', 5, 'Manual', 34, 'Kitchener'],
    ['CRKT 203', 'Mazda', 'CX-5', 2024, 'SUV', 5, 'Automatic', 69, 'Kitchener'],
    ['CRKT 204', 'Toyota', 'Sienna', 2025, 'Van', 8, 'Automatic', 95, 'Kitchener'],
    ['CRMS 301', 'Toyota', 'Camry', 2025, 'Compact', 5, 'Automatic', 52, 'Mississauga'],
    ['CRMS 302', 'Chevrolet', 'Spark', 2021, 'Economy', 4, 'Automatic', 33, 'Mississauga'],
    ['CRMS 303', 'Ford', 'Explorer', 2024, 'SUV', 7, 'Automatic', 82, 'Mississauga'],
    ['CRMS 304', 'Mercedes-Benz', 'C 300', 2025, 'Luxury', 5, 'Automatic', 139, 'Mississauga'],
  ];
  for (const c of fleet) addCar.run(...c.slice(0, 8), loc[c[8]]);

  // A few bookings so search has something to exclude (dates relative to today)
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const carId = (plate) => db.prepare('SELECT id FROM cars WHERE plate = ?').get(plate).id;
  const addRes = db.prepare('INSERT INTO reservations (car_id, customer_id, pickup_date, return_date) VALUES (?, ?, ?, ?)');
  addRes.run(carId('CRWT 101'), customer, day(3), day(7));
  addRes.run(carId('CRWT 105'), customer, day(5), day(9));
  addRes.run(carId('CRKT 203'), customer, day(1), day(4));

  // Optional bulk fleet for the 2-second performance check
  const cats = [['Economy', 36], ['Compact', 47], ['SUV', 70], ['Van', 92], ['Luxury', 130]];
  const locs = Object.values(loc);
  for (let i = 0; i < extraCars; i++) {
    const [cat, rate] = cats[i % cats.length];
    const id = addCar.run(`PERF${String(i).padStart(4, '0')}`, 'Test', `Model ${i}`, 2020 + (i % 6), cat, 5, 'Automatic', rate + (i % 9), locs[i % locs.length]).lastInsertRowid;
    if (i % 3 === 0) addRes.run(id, customer, day(i % 20), day((i % 20) + 3));
  }
}

if (require.main === module) {
  const i = process.argv.indexOf('--cars');
  const extraCars = i > -1 ? Number(process.argv[i + 1]) - 16 : 0;
  fs.mkdirSync('data', { recursive: true });
  const db = openDb(process.env.DB_FILE || 'data/car_rental.db');
  seed(db, { extraCars: Math.max(0, extraCars) });
  const n = db.prepare('SELECT COUNT(*) n FROM cars').get().n;
  console.log(`Seeded ${n} cars and 3 demo accounts:
  manager@carrental.test / Manager123!
  staff@carrental.test   / Staff123!
  customer@carrental.test / Customer123!`);
}

module.exports = { seed };

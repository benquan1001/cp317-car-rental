// Database setup: opens SQLite and creates the schema if it does not exist yet.
const Database = require('better-sqlite3');

const CATEGORIES = ['Economy', 'Compact', 'SUV', 'Van', 'Luxury'];
const TRANSMISSIONS = ['Automatic', 'Manual'];
const ROLES = ['customer', 'staff', 'manager'];
const LOCATIONS = ['Waterloo', 'Kitchener', 'Mississauga'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  licence_no      TEXT,                       -- customers only (ACC-1)
  password_hash   TEXT NOT NULL,              -- bcrypt, salted (ACC-2)
  role            TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','staff','manager')),
  consent_at      TEXT,                       -- when the customer accepted the privacy notice
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER,                    -- epoch ms; NULL when not locked
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cars (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  plate        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  make         TEXT NOT NULL,
  model        TEXT NOT NULL,
  year         INTEGER NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('Economy','Compact','SUV','Van','Luxury')),
  seats        INTEGER NOT NULL,
  transmission TEXT NOT NULL CHECK (transmission IN ('Automatic','Manual')),
  daily_rate   REAL NOT NULL CHECK (daily_rate > 0),
  location_id  INTEGER NOT NULL REFERENCES locations(id),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reservations are created through the UI in Sprint 2 (UI-2). The table exists now
-- because car search (UI-1) must exclude cars that are already booked.
CREATE TABLE IF NOT EXISTS reservations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id      INTEGER NOT NULL REFERENCES cars(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  pickup_date TEXT NOT NULL,   -- YYYY-MM-DD
  return_date TEXT NOT NULL,   -- YYYY-MM-DD, must be after pickup_date
  status      TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','picked_up','returned','cancelled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (return_date > pickup_date)
);

CREATE INDEX IF NOT EXISTS idx_res_car_dates ON reservations(car_id, pickup_date, return_date);
CREATE INDEX IF NOT EXISTS idx_cars_search ON cars(status, location_id, category);
`;

function openDb(file = 'data/car_rental.db') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const addLoc = db.prepare('INSERT OR IGNORE INTO locations (name) VALUES (?)');
  for (const name of LOCATIONS) addLoc.run(name);
  return db;
}

module.exports = { openDb, CATEGORIES, TRANSMISSIONS, ROLES, LOCATIONS };

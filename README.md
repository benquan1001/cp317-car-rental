# Car Rental Management System

CP317A group project. Sprint 1 prototype: account registration, login, role-based access, fleet management, and car search.

Built with Node.js, Express, EJS templates, and SQLite through Node's built-in `node:sqlite` module, so there is nothing native to compile.

## Run it

Requires Node.js 22.13 or newer (check with `node -v`). Node prints an "ExperimentalWarning: SQLite" line on start; that is expected.

```bash
npm install
npm run seed      # creates data/car_rental.db with demo data
npm start         # http://localhost:3000
```

Demo accounts (created by `npm run seed`):

| Role     | Email                    | Password      |
|----------|--------------------------|---------------|
| Manager  | manager@carrental.test   | Manager123!   |
| Staff    | staff@carrental.test     | Staff123!     |
| Customer | customer@carrental.test  | Customer123!  |

Or register a new customer at `/register`.

## Test it

```bash
npm test
```

Runs 25 automated tests in `test/`, one or more per acceptance criterion in the Product Backlog. Each test name starts with its story ID (for example `ACC-2.3`). Every test builds a fresh in-memory database, so tests never touch `data/`.

For the performance check with a 500-car fleet in the real database: `npm run seed -- --cars 500`.

## Sprint 1 scope

| Story | What works |
|-------|------------|
| ACC-1 Account Registration | `/register` with validation, duplicate-email check, 8-character minimum password, required privacy consent |
| ACC-2 Login and Logout | `/login`, `/logout`, bcrypt-hashed passwords, generic error message, 15-minute lockout after 5 failed attempts, 30-minute idle timeout |
| ACC-3 Role-Based Access | Server-side role checks on every staff and manager route; managers create staff accounts at `/manager/staff` |
| ADM-1 Manage Fleet | `/staff/fleet`: list, add, edit, and retire (soft delete) cars |
| UI-1 Car Search | `/search` by location, dates, and category; excludes cars with overlapping bookings; sorted by daily rate |

Reservations are created through the UI in Sprint 2 (UI-2). The seed script adds three bookings so search has something to exclude.

## Project layout

```
server.js            starts the app
src/app.js           routes
src/auth.js          password hashing, lockout, role middleware
src/db.js            SQLite schema
src/search.js        availability query
src/validate.js      server-side input validation
views/               EJS pages
public/style.css     styles
scripts/seed.js      demo data
test/                automated acceptance tests
testkit/helpers.js   shared test setup
```

## Configuration

| Variable         | Default               | Purpose |
|------------------|-----------------------|---------|
| `PORT`           | `3000`                | Web server port |
| `DB_FILE`        | `data/car_rental.db`  | SQLite file |
| `SESSION_SECRET` | `dev-only-secret`     | Signs session cookies. Set a long random value outside local development. |

// Express application. createApp() is used by server.js and by the automated tests.
const path = require('path');
const express = require('express');
const session = require('express-session');
const { openDb, CATEGORIES, TRANSMISSIONS } = require('./db');
const {
  hashPassword, attemptLogin, requireLogin, requireRole, HOME_BY_ROLE,
} = require('./auth');
const { validateRegistration, validateStaff, validateCar, validateSearch } = require('./validate');
const { searchAvailableCars, daysBetween } = require('./search');

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // ACC-2: idle sessions end after 30 minutes

function createApp({ dbFile, db = openDb(dbFile), sessionSecret = process.env.SESSION_SECRET || 'dev-only-secret', idleMs = IDLE_TIMEOUT_MS } = {}) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.locals.db = db;

  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // each request resets the idle timer
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: idleMs },
  }));

  // Values every view can use
  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    res.locals.path = req.path;
    next();
  });
  const flash = (req, msg) => { req.session.flash = msg; };
  const locations = () => db.prepare('SELECT * FROM locations ORDER BY name').all();

  app.get('/', (req, res) => res.redirect(req.session.user ? HOME_BY_ROLE[req.session.user.role] : '/login'));

  /* ---------- ACC-1 Account Registration ---------- */
  app.get('/register', (req, res) => res.render('register', { title: 'Create account', values: {}, errors: [] }));

  app.post('/register', (req, res) => {
    const { data, errors } = validateRegistration(req.body);
    if (!errors.length && db.prepare('SELECT 1 FROM users WHERE email = ?').get(data.email)) {
      errors.push('An account with this email already exists.');
    }
    if (errors.length) {
      return res.status(400).render('register', { title: 'Create account', values: { ...data, password: '' }, errors });
    }
    db.prepare(`INSERT INTO users (first_name, last_name, email, licence_no, password_hash, role, consent_at)
                VALUES (?, ?, ?, ?, ?, 'customer', datetime('now'))`)
      .run(data.first_name, data.last_name, data.email, data.licence_no, hashPassword(data.password));
    flash(req, 'Account created. You can log in now.');
    res.redirect('/login');
  });

  app.get('/privacy', (req, res) => res.render('privacy', { title: 'Privacy notice' }));

  /* ---------- ACC-2 Login and Logout ---------- */
  app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect(HOME_BY_ROLE[req.session.user.role]);
    res.render('login', { title: 'Log in', error: null, email: '', next: req.query.next || '' });
  });

  app.post('/login', (req, res, next) => {
    const { user, error } = attemptLogin(db, req.body.email, req.body.password);
    if (error) {
      return res.status(401).render('login', { title: 'Log in', error, email: req.body.email || '', next: req.body.next || '' });
    }
    // New session id on login to prevent session fixation
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = { id: user.id, first_name: user.first_name, role: user.role };
      const dest = typeof req.body.next === 'string' && req.body.next.startsWith('/') && !req.body.next.startsWith('//')
        ? req.body.next : HOME_BY_ROLE[user.role];
      res.redirect(dest);
    });
  });

  app.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/login');
    });
  });

  /* ---------- UI-1 Car Search ---------- */
  app.get('/search', requireLogin, (req, res) => {
    const searched = Boolean(req.query.pickup || req.query.return || req.query.location_id);
    let results = [];
    let errors = [];
    let data = { categories: [] };
    let days = 0;
    let ms = 0;
    if (searched) {
      ({ data, errors } = validateSearch(req.query));
      if (!errors.length) {
        const t0 = process.hrtime.bigint();
        results = searchAvailableCars(db, data);
        ms = Number(process.hrtime.bigint() - t0) / 1e6;
        days = daysBetween(data.pickup, data.ret);
      }
    }
    res.render('search', { title: 'Find a car', locations: locations(), categories: CATEGORIES, searched, data, errors, results, days, ms });
  });

  /* ---------- ADM-1 Manage Fleet (staff and managers) ---------- */
  const fleetAccess = requireRole('staff', 'manager');

  app.get('/staff/fleet', fleetAccess, (req, res) => {
    const show = req.query.show === 'retired' ? 'retired' : 'active';
    const cars = db.prepare(`SELECT c.*, l.name AS location FROM cars c JOIN locations l ON l.id = c.location_id
                             WHERE c.status = ? ORDER BY l.name, c.category, c.make`).all(show);
    const counts = db.prepare(`SELECT status, COUNT(*) n FROM cars GROUP BY status`).all()
      .reduce((a, r) => ({ ...a, [r.status]: r.n }), { active: 0, retired: 0 });
    res.render('fleet', { title: 'Fleet', cars, show, counts });
  });

  const carForm = (res, status, car, errors, isNew) => res.status(status).render('car-form', {
    title: isNew ? 'Add car' : 'Edit car', car, errors, isNew, locations: locations(), categories: CATEGORIES, transmissions: TRANSMISSIONS,
  });

  app.get('/staff/fleet/new', fleetAccess, (req, res) => carForm(res, 200, {}, [], true));

  app.post('/staff/fleet/new', fleetAccess, (req, res) => {
    const { data, errors } = validateCar(req.body, locations().map((l) => l.id));
    if (!errors.length && db.prepare('SELECT 1 FROM cars WHERE plate = ?').get(data.plate)) errors.push('A car with this plate already exists.');
    if (errors.length) return carForm(res, 400, data, errors, true);
    db.prepare(`INSERT INTO cars (plate, make, model, year, category, seats, transmission, daily_rate, location_id)
                VALUES (@plate, @make, @model, @year, @category, @seats, @transmission, @daily_rate, @location_id)`).run(data);
    flash(req, `${data.year} ${data.make} ${data.model} (${data.plate}) added to the fleet.`);
    res.redirect('/staff/fleet');
  });

  const findCar = (id) => db.prepare('SELECT * FROM cars WHERE id = ?').get(Number(id));

  app.get('/staff/fleet/:id/edit', fleetAccess, (req, res) => {
    const car = findCar(req.params.id);
    if (!car) return res.status(404).render('notfound', { title: 'Not found' });
    carForm(res, 200, car, [], false);
  });

  app.post('/staff/fleet/:id/edit', fleetAccess, (req, res) => {
    const car = findCar(req.params.id);
    if (!car) return res.status(404).render('notfound', { title: 'Not found' });
    const { data, errors } = validateCar(req.body, locations().map((l) => l.id));
    if (!errors.length && db.prepare('SELECT 1 FROM cars WHERE plate = ? AND id <> ?').get(data.plate, car.id)) errors.push('A car with this plate already exists.');
    if (errors.length) return carForm(res, 400, { ...data, id: car.id }, errors, false);
    db.prepare(`UPDATE cars SET plate=@plate, make=@make, model=@model, year=@year, category=@category, seats=@seats,
                transmission=@transmission, daily_rate=@daily_rate, location_id=@location_id, updated_at=datetime('now')
                WHERE id=@id`).run({ ...data, id: car.id });
    flash(req, `Changes to ${data.plate} saved.`);
    res.redirect('/staff/fleet');
  });

  // Retire = soft delete, so past reservations keep pointing at a real car
  app.post('/staff/fleet/:id/retire', fleetAccess, (req, res) => {
    const car = findCar(req.params.id);
    if (!car) return res.status(404).render('notfound', { title: 'Not found' });
    db.prepare(`UPDATE cars SET status='retired', updated_at=datetime('now') WHERE id=?`).run(car.id);
    flash(req, `${car.plate} retired. It no longer appears in search.`);
    res.redirect('/staff/fleet');
  });

  /* ---------- ACC-3 Role-Based Access (manager only) ---------- */
  const managerOnly = requireRole('manager');

  // Reports are built in Sprint 3; the route exists now so access rules can be tested.
  app.get('/manager/reports', managerOnly, (req, res) => res.render('reports', { title: 'Reports' }));

  const staffPage = (res, status, values, errors) => res.status(status).render('staff', {
    title: 'Staff accounts',
    accounts: db.prepare(`SELECT id, first_name, last_name, email, role, created_at FROM users
                          WHERE role IN ('staff','manager') ORDER BY role DESC, last_name`).all(),
    values, errors,
  });

  app.get('/manager/staff', managerOnly, (req, res) => staffPage(res, 200, {}, []));

  app.post('/manager/staff', managerOnly, (req, res) => {
    const { data, errors } = validateStaff(req.body);
    if (!errors.length && db.prepare('SELECT 1 FROM users WHERE email = ?').get(data.email)) errors.push('An account with this email already exists.');
    if (errors.length) return staffPage(res, 400, { ...data, password: '' }, errors);
    db.prepare(`INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`)
      .run(data.first_name, data.last_name, data.email, hashPassword(data.password), data.role);
    flash(req, `${data.role === 'manager' ? 'Manager' : 'Staff'} account created for ${data.email}.`);
    res.redirect('/manager/staff');
  });

  app.use((req, res) => res.status(404).render('notfound', { title: 'Not found' }));
  return app;
}

module.exports = { createApp };

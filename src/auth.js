// Authentication helpers: password hashing, lockout rules, and role checks (ACC-2, ACC-3).
const bcrypt = require('bcryptjs');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes
const GENERIC_LOGIN_ERROR = 'Incorrect email or password.';

const hashPassword = (plain) => bcrypt.hashSync(plain, 10); // bcrypt adds a random salt
const checkPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

const HOME_BY_ROLE = { customer: '/search', staff: '/staff/fleet', manager: '/manager/reports' };

/**
 * Attempts a login and applies the lockout rule.
 * Returns { user } on success or { error } on failure.
 */
function attemptLogin(db, email, password, now = Date.now()) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim());
  if (!user) return { error: GENERIC_LOGIN_ERROR };

  if (user.locked_until && user.locked_until > now) {
    const mins = Math.ceil((user.locked_until - now) / 60000);
    return { error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` };
  }

  if (!checkPassword(String(password || ''), user.password_hash)) {
    const attempts = user.failed_attempts + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      db.prepare('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?').run(now + LOCK_MS, user.id);
    } else {
      db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, user.id);
    }
    return { error: GENERIC_LOGIN_ERROR };
  }

  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
  return { user };
}

// Middleware: any logged-in user.
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  next();
}

// Middleware: only the listed roles. Checked on the server for every request, not just hidden in the UI.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('denied', { title: 'Access denied' });
    }
    next();
  };
}

module.exports = {
  hashPassword, checkPassword, attemptLogin, requireLogin, requireRole,
  HOME_BY_ROLE, GENERIC_LOGIN_ERROR, MAX_FAILED_ATTEMPTS, LOCK_MS,
};

// Input validation shared by the routes. Every check runs on the server.
const { CATEGORIES, TRANSMISSIONS } = require('./db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function validateRegistration(body) {
  const data = {
    first_name: str(body.first_name),
    last_name: str(body.last_name),
    email: str(body.email).toLowerCase(),
    licence_no: str(body.licence_no).toUpperCase(),
    password: typeof body.password === 'string' ? body.password : '',
    consent: body.consent === 'on' || body.consent === 'yes',
  };
  const errors = [];
  if (!data.first_name) errors.push('First name is required.');
  if (!data.last_name) errors.push('Last name is required.');
  if (!EMAIL_RE.test(data.email)) errors.push('Enter a valid email address.');
  if (!/^[A-Z0-9-]{5,20}$/.test(data.licence_no)) errors.push('Enter a valid driver’s licence number.');
  if (data.password.length < 8) errors.push('Password must be at least 8 characters.');
  if (!data.consent) errors.push('You must agree to the privacy notice to create an account.');
  return { data, errors };
}

function validateStaff(body) {
  const data = {
    first_name: str(body.first_name),
    last_name: str(body.last_name),
    email: str(body.email).toLowerCase(),
    password: typeof body.password === 'string' ? body.password : '',
    role: str(body.role),
  };
  const errors = [];
  if (!data.first_name || !data.last_name) errors.push('First and last name are required.');
  if (!EMAIL_RE.test(data.email)) errors.push('Enter a valid email address.');
  if (data.password.length < 8) errors.push('Temporary password must be at least 8 characters.');
  if (!['staff', 'manager'].includes(data.role)) errors.push('Role must be staff or manager.');
  return { data, errors };
}

function validateCar(body, locationIds) {
  const thisYear = new Date().getFullYear();
  const data = {
    plate: str(body.plate).toUpperCase(),
    make: str(body.make),
    model: str(body.model),
    year: Number(body.year),
    category: str(body.category),
    seats: Number(body.seats),
    transmission: str(body.transmission),
    daily_rate: Number(body.daily_rate),
    location_id: Number(body.location_id),
  };
  const errors = [];
  if (!/^[A-Z0-9 -]{2,10}$/.test(data.plate)) errors.push('Plate is required (2–10 letters or numbers).');
  if (!data.make) errors.push('Make is required.');
  if (!data.model) errors.push('Model is required.');
  if (!Number.isInteger(data.year) || data.year < 1990 || data.year > thisYear + 1) errors.push(`Year must be between 1990 and ${thisYear + 1}.`);
  if (!CATEGORIES.includes(data.category)) errors.push('Choose a category.');
  if (!Number.isInteger(data.seats) || data.seats < 2 || data.seats > 15) errors.push('Seats must be a whole number from 2 to 15.');
  if (!TRANSMISSIONS.includes(data.transmission)) errors.push('Choose a transmission.');
  if (!(data.daily_rate > 0) || data.daily_rate > 2000) errors.push('Daily rate must be greater than $0.');
  if (!locationIds.includes(data.location_id)) errors.push('Choose a location.');
  return { data, errors };
}

function validateSearch(query, today = new Date().toISOString().slice(0, 10)) {
  const cats = [].concat(query.category || []).map(String).filter((c) => CATEGORIES.includes(c));
  const data = {
    location_id: Number(query.location_id),
    pickup: str(query.pickup),
    ret: str(query.return),
    categories: cats,
  };
  const errors = [];
  if (!data.location_id) errors.push('Choose a pickup location.');
  if (!DATE_RE.test(data.pickup) || !DATE_RE.test(data.ret)) errors.push('Choose pickup and return dates.');
  else {
    if (data.pickup < today) errors.push('Pickup date cannot be in the past.');
    if (data.ret <= data.pickup) errors.push('Return date must be after the pickup date.');
  }
  return { data, errors };
}

module.exports = { validateRegistration, validateStaff, validateCar, validateSearch };

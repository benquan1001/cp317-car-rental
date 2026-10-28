// Shared test setup: a fresh in-memory database with demo data for every test file.
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { seed } = require('../scripts/seed');

function makeApp(opts = {}) {
  const db = openDb(':memory:');
  seed(db, { extraCars: opts.extraCars || 0 });
  const app = createApp({ db, sessionSecret: 'test', ...opts });
  return { app, db };
}

async function loginAs(app, email, password) {
  const agent = request.agent(app);
  const res = await agent.post('/login').type('form').send({ email, password });
  return { agent, res };
}

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ACCOUNTS = {
  customer: ['customer@carrental.test', 'Customer123!'],
  staff: ['staff@carrental.test', 'Staff123!'],
  manager: ['manager@carrental.test', 'Manager123!'],
};

module.exports = { makeApp, loginAs, day, ACCOUNTS, request };

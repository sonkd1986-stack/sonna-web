'use strict';

const { Pool } = require('pg');

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    pool.on('error', error => {
      console.error('[SONNA] PostgreSQL idle client error:', error);
    });
  }

  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

async function testConnection() {
  const result = await query('SELECT NOW() AS connected_at');
  return result.rows[0];
}

module.exports = { query, testConnection };

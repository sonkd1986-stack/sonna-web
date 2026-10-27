'use strict';

const fs = require('fs');
const path = require('path');
const { getPool } = require('./db');

const cache = new Map();
const STATE_KEYS = new Set([
  'store.json', 'admin.json', 'users.json', 'orders.json', 'community.json',
  'accounts.json', 'sessions.json', 'payment.json', 'deposits.json'
]);
let initialized = false;
let writes = Promise.resolve();
let writeError = null;

function keyFor(file) {
  return path.basename(file);
}

async function initialize() {
  const result = await getPool().query(
    'SELECT key, value FROM public.sonna_state'
  );
  cache.clear();
  result.rows.forEach(row => cache.set(row.key, row.value));
  initialized = true;
}

function readJSON(file, fallback) {
  const key = keyFor(file);
  if (STATE_KEYS.has(key)) {
    if (!initialized) return fallback;
    return cache.has(key) ? cache.get(key) : fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function persistBatch(entries) {
  const pending = writes.then(async () => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of entries) {
        await client.query(
          `INSERT INTO public.sonna_state (key, value, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key)
           DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, JSON.stringify(value)]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  writes = pending.catch(error => {
    writeError = error;
  });
}

function writeJSON(file, value) {
  const key = keyFor(file);
  if (!initialized) throw new Error('Supabase state store is not initialized.');
  if (!STATE_KEYS.has(key)) throw new Error(`Unsupported Supabase state document: ${key}`);

  cache.set(key, value);
  persistBatch([[key, value]]);
}

function writeBatch(files) {
  const entries = Object.entries(files).map(([file, value]) => [keyFor(file), value]);
  if (!initialized) throw new Error('Supabase state store is not initialized.');
  if (entries.some(([key]) => !STATE_KEYS.has(key))) {
    throw new Error('Unsupported Supabase state document in transaction.');
  }

  entries.forEach(([key, value]) => cache.set(key, value));
  persistBatch(entries);
}

async function flush() {
  await writes;
  if (writeError) throw writeError;
}

function has(key) {
  return cache.has(key);
}

module.exports = { initialize, readJSON, writeJSON, writeBatch, flush, has };

/*
 * db.js — Triply's own Postgres pool and migrations.
 * The pool sets search_path to Triply's schema, so queries use plain table names and can never
 * touch Kalendaryo's tables. It is a separate pool on purpose: a Triply problem stays inside Triply.
 */
'use strict';

const { Pool } = require('pg');
const crypto = require('node:crypto');
const migrations = require('./migrations');

function createDb(cfg) {
  if (!cfg.databaseUrl) throw new Error('DATABASE_URL is not set. Triply needs a Postgres database.');
  const pool = new Pool({
    connectionString: cfg.databaseUrl,
    max: cfg.poolSize,
    options: '-c search_path=' + cfg.schema,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    idleTimeoutMillis: 30000
  });
  pool.on('error', (e) => { if (cfg.log) cfg.log.error('[triply] idle database client error:', e.message); });

  const q = (text, params) => pool.query(text, params);

  // Run fn(client) inside one transaction. Rolls back on any error.
  async function tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const out = await fn(client);
      await client.query('commit');
      return out;
    } catch (e) {
      try { await client.query('rollback'); } catch (e2) { /* connection already gone */ }
      throw e;
    } finally {
      client.release();
    }
  }

  async function migrate() {
    const client = await pool.connect();
    try {
      await client.query('select pg_advisory_lock(hashtext($1))', ['triply_migrate:' + cfg.schema]);
      await client.query('create schema if not exists ' + cfg.schema);
      await client.query('create table if not exists migrations (id text primary key, applied_at timestamptz not null default now())');
      const done = new Set((await client.query('select id from migrations')).rows.map((r) => r.id));
      for (const m of migrations) {
        if (done.has(m.id)) continue;
        await client.query('begin');
        try {
          await client.query(m.sql);
          await client.query('insert into migrations (id) values ($1)', [m.id]);
          await client.query('commit');
          if (cfg.log) cfg.log.log('[triply] applied migration', m.id);
        } catch (e) {
          await client.query('rollback');
          throw e;
        }
      }
    } finally {
      try { await client.query('select pg_advisory_unlock(hashtext($1))', ['triply_migrate:' + cfg.schema]); } catch (e) { /* ignore */ }
      client.release();
    }
  }

  return { pool, q, tx, migrate, close: () => pool.end() };
}

/* ---------- secrets ---------- */
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const randomToken = (bytes) => crypto.randomBytes(bytes || 24).toString('base64url');

module.exports = { createDb, sha256, randomToken };

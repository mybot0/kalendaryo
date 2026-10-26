// db.js — Postgres connection and tables. Tables are created on start (safe to run again).
const { Pool } = require('pg');

function sslFor(url) {
  if (process.env.PGSSL === '0') return false;
  if (process.env.PGSSL === '1') return { rejectUnauthorized: false };
  try { const host = new URL(url).hostname; return host.includes('render.com') ? { rejectUnauthorized: false } : false; } catch (e) { return false; }
}

const url = process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/kal';
const pool = new Pool({ connectionString: url, ssl: sslFor(url), max: 10 });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ai_day DATE,
  ai_count INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS access (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer','editor','owner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS access_family ON access(family_id);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('viewer','editor','owner')),
  label TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by TEXT
);
CREATE INDEX IF NOT EXISTS invites_family ON invites(family_id);
CREATE TABLE IF NOT EXISTS docs (
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  col TEXT NOT NULL,
  id TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, col, id)
);
CREATE TABLE IF NOT EXISTS blobs (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  size INT NOT NULL,
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blobs_family ON blobs(family_id);
`;

async function migrate() { await pool.query(SCHEMA); }
const q = (text, params) => pool.query(text, params);
async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { try { await c.query('ROLLBACK'); } catch (_) {} throw e; }
  finally { c.release(); }
}

module.exports = { pool, migrate, q, tx };

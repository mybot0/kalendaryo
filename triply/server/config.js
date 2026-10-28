/*
 * config.js — every setting in one place. Nothing else reads process.env.
 * createTriply(options) passes options in; anything missing falls back to the environment, then a default.
 */
'use strict';

function cleanBase(p) {
  let s = String(p == null ? '' : p).trim();
  if (!s || s === '/') return '';
  if (s[0] !== '/') s = '/' + s;
  return s.replace(/\/+$/, '');
}

function load(options) {
  const o = options || {};
  const env = process.env;
  const pick = (k, envKey, dflt) => (o[k] !== undefined ? o[k] : env[envKey] !== undefined && env[envKey] !== '' ? env[envKey] : dflt);
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
  const schema = String(pick('schema', 'TRIPLY_SCHEMA', 'triply'));
  if (!/^[a-z_][a-z0-9_]{0,40}$/.test(schema)) throw new Error('TRIPLY_SCHEMA must be lowercase letters, numbers and underscores.');
  return {
    databaseUrl: pick('databaseUrl', 'DATABASE_URL', ''),
    schema,
    basePath: cleanBase(pick('basePath', 'BASE_PATH', '')),
    publicUrl: String(pick('publicUrl', 'PUBLIC_URL', '')).replace(/\/+$/, ''),
    allowedOrigin: String(pick('allowedOrigin', 'ALLOWED_ORIGIN', '')).replace(/\/+$/, ''),
    inviteDays: num(pick('inviteDays', 'INVITE_DAYS', 14), 14),
    maxTripBytes: num(pick('maxTripMb', 'MAX_TRIP_MB', 200), 200) * 1024 * 1024,
    maxBlobBytes: num(pick('maxBlobMb', 'MAX_BLOB_MB', 8), 8) * 1024 * 1024,
    poolSize: num(pick('poolSize', 'PG_POOL_SIZE', 6), 6),
    ssl: pick('ssl', 'PGSSL', '') === '1' || pick('ssl', 'PGSSL', '') === true,
    // AI helpers (read bookings, find a flight, plan my trip). Off when there is no key.
    ai: {
      key: String(pick('aiKey', 'ANTHROPIC_API_KEY', '')),
      model: String(pick('aiModel', 'TRIPLY_AI_MODEL', 'claude-haiku-5-5')),
      planModel: String(pick('aiPlanModel', 'TRIPLY_AI_PLAN_MODEL', '') || pick('aiModel', 'TRIPLY_AI_MODEL', 'claude-haiku-5-5')),
      dailyUsd: (() => { const n = Number(pick('aiDailyUsd', 'TRIPLY_AI_DAILY_USD', 1)); return Number.isFinite(n) && n >= 0 ? n : 1; })(), // 0 turns AI off
      planSearches: Math.min(20, Math.max(0, parseInt(pick('aiPlanSearches', 'TRIPLY_AI_PLAN_SEARCHES', 8), 10) || 0)),
      timeZone: String(pick('aiTimeZone', 'TRIPLY_AI_TIMEZONE', 'America/Vancouver')),
      fake: o.aiFake || env.TRIPLY_AI_FAKE_JS || '' // tests only: a module that answers like the AI
    },
    // Test and tuning knobs
    limits: o.limits || null,
    log: o.log === undefined ? console : o.log,
    htmlPath: o.htmlPath || null
  };
}

module.exports = { load, cleanBase };

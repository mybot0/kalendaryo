/*
 * limits.js — tiny in-memory rate limiter (sliding window). Keeps guessing and spam in check.
 * It is per process, which is fine for one server; the numbers are generous for real people.
 */
'use strict';

const { ApiError } = require('./mini');

const DEFAULTS = {
  create:  { windowMs: 60 * 60 * 1000, max: 20 },   // new trips per address per hour
  invite:  { windowMs: 10 * 60 * 1000, max: 60 },   // invite look-ups and joins per address
  message: { windowMs: 60 * 1000, max: 60 },        // chat messages per member per minute
  upload:  { windowMs: 60 * 1000, max: 30 },        // uploads per member per minute
  lookup:  { windowMs: 60 * 1000, max: 120 }        // My Trips refreshes per address per minute
};

function createLimiter(overrides) {
  const rules = Object.assign({}, DEFAULTS, overrides || {});
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) {
      const rule = rules[k.split('|')[0]] || { windowMs: 60000 };
      if (!v.length || now - v[v.length - 1] > rule.windowMs) hits.delete(k);
    }
  }, 60 * 1000);
  if (sweep.unref) sweep.unref();

  // Throws 429 when the caller has used up the rule.
  function check(rule, key) {
    const r = rules[rule];
    if (!r) return;
    const k = rule + '|' + key, now = Date.now();
    const list = (hits.get(k) || []).filter((t) => now - t < r.windowMs);
    if (list.length >= r.max) {
      hits.set(k, list);
      throw new ApiError(429, 'rate_limited', 'Too many tries. Please wait a moment and try again.');
    }
    list.push(now);
    hits.set(k, list);
  }
  return { check, stop: () => clearInterval(sweep) };
}

module.exports = { createLimiter };

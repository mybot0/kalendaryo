// ai.js — asks Claude for recipes, ingredients, dinner ideas, and holidays the public list does not have.
// Uses ANTHROPIC_API_KEY from the server's settings. The key never goes to the browser.
// Each family gets AI_DAILY_LIMIT requests a day (default 20), and the whole site spends at most
// AI_DAILY_USD a day (default US$1; 0 turns AI off). The day follows AI_TIMEZONE (default America/Vancouver).
const { q, tx } = require('./db');

const KEY = () => process.env.ANTHROPIC_API_KEY || '';
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const LIMIT = () => Math.max(0, parseInt(process.env.AI_DAILY_LIMIT || '20', 10) || 0);

const DAILY_USD = () => { const n = Number(process.env.AI_DAILY_USD === undefined || process.env.AI_DAILY_USD === '' ? 1 : process.env.AI_DAILY_USD); return Number.isFinite(n) && n >= 0 ? n : 1; };
const TZ = () => process.env.AI_TIMEZONE || 'America/Vancouver';
const RESERVE = 10000; // micro-dollars held for one request (a request costs well under 1¢)
const enabled = () => !!KEY() && LIMIT() > 0 && DAILY_USD() > 0;

// The site-wide cap: hold 1¢ before asking, then keep the real cost. false = spent for today.
async function reserve() {
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(7332)');
    const day = (await c.query('SELECT (now() AT TIME ZONE $1)::date AS d', [TZ()])).rows[0].d;
    const r = await c.query('SELECT micro FROM ai_spend WHERE day = $1', [day]);
    const spent = r.rows[0] ? Number(r.rows[0].micro) : 0;
    if (spent + RESERVE > DAILY_USD() * 1e6) return null;
    await c.query('INSERT INTO ai_spend (day, micro, uses) VALUES ($1, $2, 1) ON CONFLICT (day) DO UPDATE SET micro = ai_spend.micro + $2, uses = ai_spend.uses + 1', [day, RESERVE]);
    return day;
  });
}
async function settle(day, usd) {
  await q('UPDATE ai_spend SET micro = GREATEST(0, micro - $2 + $3) WHERE day = $1', [day, RESERVE, Math.round(usd * 1e6)]).catch(() => {});
}
const priceOf = (model, inTok) => (/haiku/i.test(model) ? (inTok > 100000 ? [0.5, 2.5] : [0.1, 0.5]) : /sonnet/i.test(model) ? [2, 10] : [15, 75]);

async function left(familyId) {
  if (!enabled()) return 0;
  const r = await q('SELECT ai_day, ai_count FROM families WHERE id=$1', [familyId]);
  const f = r.rows[0];
  if (!f) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const used = f.ai_day && f.ai_day.toISOString().slice(0, 10) === today ? f.ai_count : 0;
  return Math.max(0, LIMIT() - used);
}

// Count one use, atomically. Returns false when today's limit is reached.
async function take(familyId) {
  const r = await q(
    `UPDATE families SET ai_count = CASE WHEN ai_day = CURRENT_DATE THEN ai_count + 1 ELSE 1 END, ai_day = CURRENT_DATE
     WHERE id = $1 AND (ai_day IS DISTINCT FROM CURRENT_DATE OR ai_count < $2) RETURNING ai_count`, [familyId, LIMIT()]);
  return r.rowCount === 1;
}
async function giveBack(familyId) {
  await q('UPDATE families SET ai_count = GREATEST(ai_count - 1, 0) WHERE id=$1 AND ai_day = CURRENT_DATE', [familyId]);
}

async function ask(prompt) {
  if (process.env.AI_FAKE) return { text: process.env.AI_FAKE, usd: 0.0005 }; // tests only
  if (process.env.AI_FAKE_JS) return { text: require(process.env.AI_FAKE_JS)(prompt), usd: 0.0005 }; // tests only: a file that answers like Claude
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': KEY(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL(), max_tokens: 4000,
        system: 'You help a family plan meals and groceries in a family calendar app. Answer only about food, meals, recipes, groceries and public holidays. When asked for JSON, reply with JSON only.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (r.status === 429) { const e = new Error('busy'); e.code = 'rate_limited'; throw e; }
    if (!r.ok) { const e = new Error('ai ' + r.status + ' ' + (await r.text()).slice(0, 200)); e.code = 'ai_failed'; throw e; }
    const j = await r.json();
    const u = j.usage || {}, inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const [pin, pout] = priceOf(MODEL(), inTok);
    return { text: (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''), usd: (inTok * pin + (u.output_tokens || 0) * pout) / 1e6 };
  } finally { clearTimeout(t); }
}

module.exports = { enabled, left, take, giveBack, ask, reserve, settle };

// ai.js — asks Claude for recipes, ingredients, dinner ideas, and holidays the public list does not have.
// Uses ANTHROPIC_API_KEY from the server's settings. The key never goes to the browser.
// Each family gets AI_DAILY_LIMIT requests a day (default 20).
const { q } = require('./db');

const KEY = () => process.env.ANTHROPIC_API_KEY || '';
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const LIMIT = () => Math.max(0, parseInt(process.env.AI_DAILY_LIMIT || '20', 10) || 0);

const enabled = () => !!KEY() && LIMIT() > 0;

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
  if (process.env.AI_FAKE) return process.env.AI_FAKE; // tests only
  if (process.env.AI_FAKE_JS) return require(process.env.AI_FAKE_JS)(prompt); // tests only: a file that answers like Claude
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
    return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  } finally { clearTimeout(t); }
}

module.exports = { enabled, left, take, giveBack, ask };

# Changes made from the Kalendaryo chat (paste this into the Triply chat)

1. **Demo trip at /triply/demo** (server/handler.js `demoPage()`): serves the real page plus
   `tools/demo-europe.js` (the story) and `tools/mock-api.js` (the in-browser stand-in server).
   localStorage is swapped for an in-memory copy on that page, so nothing is saved and it resets on reload.
   CSP on that page also allows images from https://images.unsplash.com and blob: objects (for the sample PDFs).
2. **tools/mock-api.js**: if `window.TRIPLY_DEMO.seed` exists, it uses that story (in memory only),
   opens the trip, uses `TRIPLY_DEMO.bot` as the chat helper, and `TRIPLY_DEMO.banner` for the top bar.
   The old artifact demo (tools/build-demo.js) works as before. It also accepts `budget` and `budget_currency` on trips.
3. **tools/demo-europe.js** (new): a family of 11 (Nana Rosa & Papa Ben, Maya & Leo + 2 kids, Carlos & Ana + 2 kids, Tita Isa)
   on 14 days: YVR → Paris → Nice → Florence → Rome → YVR. Today is day 9. ~45 plans, ~60 costs (CAD + EUR),
   a €75,000 budget, packing, 3 sample PDFs, 13 Unsplash photos in chat, group chat and private messages.
   All confirmation numbers start with DEMO-.
4. **Trip budget** (new): migration `004_budget` (trips.budget numeric, trips.budget_currency text),
   `models.trip()` cleans it, `shapes.tripOut` returns it, PATCH /trips/:id saves it.
   Costs screen shows a budget card (spent / budget, % bar, left or over), owners can set, change or remove it.
5. Kalendaryo's start page has a "Try a demo trip" button that links to /triply/demo.

Tests: triply api 29/29, kal-mount 3/3 pass.

# AI helpers (added later, also from the Kalendaryo chat)

1. **server/ai.js** (new) + **server/routes/ai.js** (new), registered in handler.js ROUTES:
   - `GET /trips/:id/ai/status`, `POST /trips/:id/ai/read` ({ blobId } or { text }), `POST /trips/:id/ai/flight` ({ query }), `POST /trips/:id/ai/plan`.
   - Calendar files (.ics) are read for free. PDFs/images go to Claude as document/image blocks; flight and plan use the web_search tool.
   - Editors and owners only. Nothing is saved by these routes; the page adds what the person ticks.
2. **Spending cap**: migration `005_ai_usage`; each use reserves its most likely cost (read 2¢, flight 5¢, plan 60¢)
   under an advisory lock, then stores the real cost (tokens + $0.01 per web search). Whole site: TRIPLY_AI_DAILY_USD (default 1).
   Per trip per day: 40 reads, 20 flight look-ups, 5 plans. Limiter rules `ai` (10/min per member) and `aiAddr` (60/h per address).
   Settings in config.js: ANTHROPIC_API_KEY, TRIPLY_AI_MODEL (default claude-haiku-5-5), TRIPLY_AI_PLAN_MODEL, TRIPLY_AI_PLAN_SEARCHES (8), TRIPLY_AI_TIMEZONE.
3. **POST /trips/:id/items/bulk** (items.js): up to 200 plans in one go, one chat post (`meta.event: 'bulk'`, shown by chat.js).
4. **Client**: screens/ai.js (new): "Add bookings for me" (upload / paste / flight number) and "Plan my trip with AI" (draft + rough cost,
   cheaper/fancier, packing list, sets the budget). Buttons on Itinerary, Bookings, the empty itinerary, and a banner in the type picker.
5. **Demo** (mock-api.js): sample answers for the AI routes and the bulk route.
6. Tests: test/fakes/ai.js (stand-in), one new API test (30/30). e2e: the type picker click uses exact=True.

# Free trip plans per person (added after)
- 2 "Plan my trip" uses per person, ever (cheaper/fancier count). Failed uses don't count (kind becomes `plan_failed`).
  Also at most 6 plans per internet address per day (limiter rule `aiPlan`). Plan reserve: 35¢ with Haiku, $1.20 with other models.
- Migration `006_ai_requests`: `ai_grants` (member_id, extra) and `ai_requests` (open/granted/declined).
- `POST /trips/:id/ai/request { message }` asks the site owner for more; status returns `left.myPlans` and `left.asked`.
- The Kalendaryo owner view (/owner) lists open asks with "Give 2 more" / "No thanks" (POST /api/owner/ai-request), writing into the triply schema.

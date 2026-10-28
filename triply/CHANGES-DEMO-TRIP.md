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

# KalRadio — third-party notices

Everything else in this folder (page, text, icons, code) was made for KalRadio (with AI help, by Claude).

| What | Source | License | Used for |
|---|---|---|---|
| Station list (live, not stored in this folder) | Radio Browser, api.radio-browser.info (community-run) | Free API; data may be used in free and non-free software | Finding stations by city. Each stream plays from the station's own website. |
| Land shapes | Natural Earth via `world-atlas` 2.0.2 (Mike Bostock) | Natural Earth: public domain. world-atlas: ISC | The 2D world map in `client/data.js` |
| City names and places | Natural Earth "populated places" (10m) | Public domain | City search and map pins in `client/data.js` |
| Map tools (build time only, not in the page) | `topojson-client` 3.1.0, `topojson-simplify` 3.0.3, `d3-geo` 3.1.2 | ISC | `tools/gen-map.js` |
| Fonts Figtree, Outfit (loaded from Google Fonts) | Erik Kennedy; Rodrigo Fuenzalida | SIL Open Font License 1.1 | Text and headings (same as Kalendaryo) |
| Visitor country lookup (server, live) | ipwho.is, then ipapi.co | Their free service terms | V2 country rules (same services the owner view uses) |
| Page background doodles and colors | Kalendaryo (`client/src/styles/base.css`, `dark.css`) | Ours | Same look as Kalendaryo |

Note for a lawyer before any public launch: linking to radio streams from other countries can need licenses in some
places (for example, a 2019 UK court ruling against the radio app TuneIn). Not decided here.

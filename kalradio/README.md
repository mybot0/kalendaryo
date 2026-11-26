# KalRadio — Version 2: Approved Stations Only

Live radio from the places your family calls home. (Tagline: to come.)
Version 1 (no restrictions, for personal use) is kept separately in `code/kalradio-v1-personal`.

## How it works now
- **Approved stations** (checked by the site owner) play inside Kalendaryo. The stream link comes from our approval record.
- **Pending stations** (everything else from Radio Browser) show a link that opens the station's own website.
- **Removed stations** are hidden. **Rejected** stations show only the website link.
- **Country rules:** each approved station has "countries it may play in" (`*` = everywhere). A global rule (in the owner view)
  says: listeners in these countries only hear stations from their own country. It starts with **GB** (the UK TuneIn ruling).
  If a visitor's country can't be found, nothing plays here (they get the website link).
- **"Station owner? Remove this station"**: a reason is required; the station is removed at once; the site owner gets a phone
  alert and can restore it. Up to 3 removals per visitor per day.
- **"Broadcaster? Ask to be added"**: a short form; the site owner gets an alert.
- **Inside a home**: only approved stations can be added to "Our stations". Old saved stations are kept and show the website link
  ("Waiting for approval") until approved.
- **Plays** are counted per station per day. Who listened is never saved.
- This lowers legal risk; it does **not** make it risk-free. Get a Canadian copyright lawyer's review before expanding.

## For the site owner
- **Owner view** (`/owner`) → **KalRadio** section: visitors, top stations, requests, removed stations (with reasons, Restore),
  approved stations (Edit, Remove), the country rule, and the history of every decision.
- **Review mode**: `kalendaryo.co/radio#review` (button "Find stations to approve" in the owner view). Search any station, tap
  **Review**, check the website and stream ("Test this stream"), fill in permission and countries, then **Approve**, **Reject**,
  **Remove now** (reason needed) or **Restore**. Uses the same owner key as the owner view.

## What's in the folder
| Path | What it is |
|---|---|
| `client/app.html` | The page. Settings block near the end: `pin` (false) and `sendPlayCounts` (true). |
| `client/data.js` | World map shape and ~7,300 city names (public-domain Natural Earth). |
| `build.js` | `node kalradio/build.js` makes `public/radio.html`. Add `preview` for a sample-only page for a Claude artifact. |
| `server/index.js` | Everything on the server: page, approvals, country check, removal, requests, play counts, owner API. |
| `server/owner-section.js` | The KalRadio section of the owner view. |
| `in-app.js` | Side menu → Radio, inside a home. |
| `tools/gen-map.js`, `package.json` | Only to remake `client/data.js`. |
| `INTEGRATION.md`, `THIRD_PARTY_NOTICES.md` | Touch points in Kalendaryo; credits. |

## Settings
- In `client/app.html`: `pin` (adult PIN on /radio, off), `sendPlayCounts` (tell Radio Browser about plays; their server sees the
  listener's address; set to `false` to stop). Run `node kalradio/build.js` after a change.
- Environment: `KALRADIO_GEO=0` turns off the country lookup (then nothing plays); `KALRADIO_COUNTRY_HEADER=cf-ipcountry` reads the
  country from a header instead (for example behind Cloudflare).
- The country lookup sends the visitor's address to ipwho.is (then ipapi.co), the same services the owner view already uses.
  Results are kept in memory for 12 hours, never saved.

## Tables (made on first use)
`kalradio_favs` (homes' stations), `kalradio_stations` (reviewed stations), `kalradio_log` (history), `kalradio_requests`,
`kalradio_plays` (per station per day), `kalradio_settings` (country rule).

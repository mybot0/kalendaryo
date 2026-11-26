# KalRadio inside Kalendaryo

Only these 7 places outside `kalradio/` were changed. Each one is marked in the code with `TOUCH POINT R`.

| # | File | What it does |
|---|---|---|
| R1 | `server/index.js` (before `const server = http.createServer`) | Loads `kalradio/server` (V2: page, approvals, removal, requests, owner API). Passes the owner guard, owner alerts, `ipOf` and `limit`. If the folder is missing, it does nothing. |
| R2 | `server/index.js` (in `page()`, next to the Triply line) | Adds `window.KAL_RADIO=true` to the app page, so the menu shows Radio. Only when R1 loaded. |
| R3 | `client/build.js` (after `gamesJs`) | Adds `kalradio/in-app.js` to the app page. Only if the file is there. |
| R4 | `client/src/js/config.js` (after Games) | The Radio menu item, hidden unless `window.KAL_RADIO`. |
| R5 | `client/src/js/util.js` (icons, before `game`) | The radio icon (our own drawing). |
| R6 | `server/index.js` (the `/owner` route) | Adds `/radio/owner-section.js` to the owner view, only when R1 loaded. |
| R7 | `public/owner.html` (in `draw()`) | A `kalradio-slot` and one line that shows the KalRadio section, only if the script is there. |

Nothing in Kalendaryo's own pages, data or security rules changed. `/radio` has its own page rules (it may reach the
station list and play https streams); every other page keeps Kalendaryo's stricter rules.

## Build and run
```
node kalradio/build.js        # makes kalradio/public/radio.html (and the one-file versions in kalradio/dist)
cd client && node build.js web # the app page (picks up kalradio/in-app.js)
npm start
```

## Take KalRadio out
- Quick: delete the `kalradio/` folder, then `cd client && node build.js web`. The menu item, `/radio`, the API and the owner-view section are gone.
  (Tested: the app works, Radio is not in the menu, `/radio` goes to the start page.) The 5 touch points stay but do nothing.
- Clean: also delete the 5 lines marked `TOUCH POINT R`.
- The `kalradio_*` tables stay in the database, unused. To remove them: `DROP TABLE kalradio_favs, kalradio_stations, kalradio_log, kalradio_requests, kalradio_plays, kalradio_settings;` (this deletes all KalRadio data).

## Copy KalRadio into another product
Copy the whole `kalradio/` folder. V2 needs a server (approvals live there). Version 1 (`kalradio-v1-personal`) is the one-file version with no restrictions.
For a server with homes/accounts, `server/index.js` shows the two calls it needs: read and save one list per home.

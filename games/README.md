# Kalendaryo Games

Every game lives in its own folder here. Each folder is one complete game you can copy to another website.

```
games/
  brain-train/     index.html (the game), tile-icon.svg, README.md
  paper-week/      index.html, paper-week-icon.svg / -192.png / -512.png, README.md
  tsinelas-toss/   index.html, tsinelas-toss-icon.svg / -192.png / -512.png, README.md
  pares-pares/     index.html, tile-icon.svg, README.md
  hangry-snake/    index.html, tile-icon.svg, README.md
  games.json       the list: name, blurb, icon, colour, folder, address (in tile order)
  server.js        serves every folder in games.json automatically
```

## How it works on kalendaryo.co

- `server.js` reads `games.json`. For each game it serves:
  - `/<route>` and `/<route>/index.html`: the folder's `index.html`, byte-for-byte (nothing added).
  - `/<route>/<name>.svg` or `.png`: the icon pictures in the folder.
- Game pages may be shown in a frame only by Kalendaryo itself (same site), and may use fonts embedded as `data:` URLs.
- The Games page (side menu, Wall mode → Games, kalendaryo.co/games) builds its tiles from `games.json`
  (`client/build.js`, TOUCH POINT G2). Tapping a tile opens the game's page full screen in a frame,
  with Kalendaryo's "← Games" bar on top.
- Kalendaryo mounts this folder with one line in `server/index.js` (TOUCH POINT G1).
- Scores and settings stay in the browser (localStorage). Nothing is sent anywhere.

## Add a new game

1. Make a new folder, for example `games/my-game/`, with:
   - `index.html`: the whole game in one page (no other files it must load, or only files in the same folder).
   - an icon for the tile: an `.svg` (or `.png`) picture, about square.
   - `README.md`: what it is, its version, and its licences.
2. Add one entry to `games.json`, where you want its tile:

   ```json
   {
     "id": "mygame", "type": "page", "title": "My Game",
     "folder": "my-game", "route": "/my-game",
     "colour": "#3d8bff",
     "blurb": "<b>One short line!</b> What you do in the game.",
     "icon": { "img": "my-game-icon.svg" },
     "oneRow": true
   }
   ```

   - `icon`: `{ "img": "file.svg" }` shows the picture; `{ "inline": "file.svg" }` puts the drawing itself in the tile.
   - `oneRow`: on phones, "← Games" and the title share one row (more room for the game).
   - `fontData`: add `"fontData": true` only if the game's fonts are inside its page as data: URLs (Paper Week and Tsinelas Toss). Other games keep the strict rule.
   - The game's page can show its own score in Kalendaryo's bar by sending
     `parent.postMessage({ type: 'kg:score', text: '…' }, location.origin)` (see pares-pares).
3. Build (`cd client && node build.js web`), run the tests, and push. Nothing in `server/index.js` changes.

## Move a game to another website

1. Copy the game's folder (for example `games/paper-week/`) to the other site.
2. Open its `index.html`. It works on its own: no Kalendaryo server needed.
   - The games that save scores use localStorage, so scores start fresh on the new site.
   - Pares-Pares and Hangry Snake show their own "← Games" bar when opened directly; change its link if you like.
3. If the other site has strict security rules (CSP), allow `data:` fonts and `https://fonts.googleapis.com` /
   `https://fonts.gstatic.com` where the game uses them.

## Rules

- A game's `index.html` is sent byte-for-byte. Paper Week, Tsinelas Toss and Brain Train are locked: never edit,
  reformat or minify them here; take a new version from the game's own project instead.
- Never delete an old version: keep a copy with a new name.

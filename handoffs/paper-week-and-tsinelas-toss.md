# Handoff: add Paper Week and Tsinelas Toss to Games

Both games were built and tested in the "Interactive Games for Kids" project. Their final files are already in this branch (`games/paper-week-tsinelas-toss`). Your job is to wire them in the same way Brain Train is wired. Each game file must stay **byte-for-byte identical**: do not edit, reformat, minify or rebuild it.

## What is already in this branch

### `public/paper-week/`
- `index.html` (Paper Week v2.2), 136,049 bytes. SHA-256 `a79634a9a64c0398996bf4ef8cb96b686516dd6761994783bb13de25dcb1cf6c`
- Icon files: `paper-week-icon.svg`, `paper-week-icon-512.png`, `paper-week-icon-192.png` (a paper plane in a sunset sky)

### `public/tsinelas-toss/`
- `index.html` (Tsinelas Toss v1, a 3D Tumbang Preso game, three.js inlined), 724,659 bytes. SHA-256 `37d77a92c01b06cc8a239acd9c760cccc41f91f7d667aeac8315b61131ef3a85`
- Icon files: `tsinelas-toss-icon.svg`, `tsinelas-toss-icon-512.png`, `tsinelas-toss-icon-192.png` (a slipper and a can)

### `.gitattributes`
Both `index.html` files are marked `-text`, like Brain Train, so git never changes their line endings.

### About both game files
- Each is one complete page. There are no network requests.
- Fonts (Outfit and Figtree, OFL) and icons are embedded as `data:` URLs. The licence texts are inside each file.
- Each saves only to localStorage: Paper Week uses the prefix `dayglider:`, Tsinelas Toss uses `tsinelas:`. Neither touches family data and neither needs a login.

## Step 0: Look first
Read how Brain Train is wired:
- `server/index.js`, around the `BRAIN_TRAIN` route
- `client/games/games.js`, the `GAMES` list and `makeFrame`

Tell the founder your plan in 3 lines, then wait for "go".

## Step 1: Server routes (copy the Brain Train pattern)
- Add `/paper-week` and `/tsinelas-toss`, each also at `/<name>/index.html`. Send the file byte-for-byte, with no `/hi.js` added, `Content-Type: text/html; charset=utf-8` and `Cache-Control: no-cache`. Use the same `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` change as Brain Train.
- **Important (CSP):** the site CSP has `font-src https://fonts.gstatic.com` only. Both games embed their fonts as `data:` URLs, so on these two routes only, add `data:` to `font-src`. Otherwise the fonts silently fall back. (Check whether Brain Train needs the same fix.)
- Serve the icon files (PNG and SVG) from those folders, or copy them to wherever the games page loads its icons from.

## Step 2: Games page tiles
Add 2 tiles to `GAMES` in `client/games/games.js`, after Brain Train, using `makeFrame` like Brain Train:

- **Paper Week**
  - Blurb: `<b>Fly a paper plane through the week!</b> Tap to glide past the pages. English or Tagalog.`
  - Icon: the paper-week icon
  - Colour: the same family as the other tiles
- **Tsinelas Toss**
  - Blurb: `<b>Tumbang preso in 3D!</b> Knock the can with your slipper, then run home before the taya tags you. English or Tagalog.`
  - Icon: the tsinelas-toss icon

Keep the games page design exactly as it is: same tile style and layout. Only the 2 tiles are new. If the visual test (`test/visual`) has approved photos of the games page, they will change because of the 2 new tiles. Show the founder the before and after and get an OK before updating them.

## Step 3: Check
1. Locally, and after deploy, run `curl -s <site>/paper-week | sha256sum` and `curl -s <site>/tsinelas-toss | sha256sum`. Both must match the hashes above.
2. Both games load in the games-page frame and directly, at phone and desktop width, with no console errors (watch for CSP errors) and the right fonts.
3. Tsinelas Toss: drag up to throw, the can falls, RUN works, and the sound plays after the first tap.
4. Paper Week: tap to fly. The days and weeks count, and pause shows a countdown.
5. Nothing else on Kalendaryo looks or behaves differently.

## Final report to the founder
Tell the founder:
- every file you changed
- the CSP change
- the live SHA-256 values
- anything that is not 1-to-1, and why

Merge to `main` only after the founder says so.

## Notes
- Before a public launch, a lawyer should do a trademark check on "Paper Week" and "Tsinelas Toss".
- The full notes for both games are in the claude.ai project docs `day-glider/plan.md` and `tsinelas-toss/plan.md`.

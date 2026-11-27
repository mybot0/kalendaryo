# Pares-Pares

A memory game: flip two cards and find every pair. 10 levels (levels 8–10 use look-alike pictures, level 10 is Champion).

- Made by us (from our own Keybop). Until Nov 26, 2026 it was inside `client/games/games.js`; the game code here is the same code, copied as it was.
- `index.html`: the whole game, one page (its CSS is Kalendaryo's theme + the Games CSS, copied in). Served at kalendaryo.co/pares-pares.
- `tile-icon.svg`: two cards, drawn for the Games page tile (put inline in the tile).
- Inside Kalendaryo (Games → Pares-Pares) the page is in a frame: it sends its score and confetti to Kalendaryo's bar and
  screen (`postMessage` kg:score / kg:confetti), takes Kalendaryo's text size, dark mode and reduced motion, and lets
  Kalendaryo's background show through. Opened directly, it shows its own "← Games" bar (link to /games).
- Fonts: Lilita One, Nunito, Figtree and Outfit from Google Fonts (SIL Open Font License). Card pictures are emoji (the device's own).
- Saves only in this browser (localStorage "kal.games:", best moves per level and the sound setting). No login.

To use it on another website: copy this folder, open `index.html`, and change the "← Games" link if you like.

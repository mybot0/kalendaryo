# Hangry Snake

So hungry, it's ANGRY! A snake game: eat the fruit and grow longer. Walls wrap around, so nobody crashes.
Speed 1–3 and Mode 1–3 (one apple, lots of fruit, fruit that disappears). Arrow keys / WASD, swipe, or the big arrows on touch screens.

- Made by us (from our own Keybop). Until Nov 26, 2026 it was inside `client/games/games.js`; the game code here is the same code, copied as it was.
- `index.html`: the whole game, one page (its CSS is Kalendaryo's theme + the Games CSS, copied in). Served at kalendaryo.co/hangry-snake.
- `tile-icon.svg`: the Hangry Snake drawing for the Games page tile and the title logo (put inline).
- Inside Kalendaryo (Games → Hangry Snake) the page is in a frame: it sends its score and confetti to Kalendaryo's bar and
  screen, gets the arrow keys pressed while Kalendaryo has the focus ("keys": true in games.json), and takes Kalendaryo's
  text size, dark mode and reduced motion. Opened directly, it shows its own "← Games" bar (link to /games).
- Fonts: Lilita One, Nunito, Figtree and Outfit from Google Fonts (SIL Open Font License). Fruit are emoji (the device's own).
- Saves only in this browser (localStorage "kal.games:", best score per mode, speed, mode and the sound setting). No login.

To use it on another website: copy this folder, open `index.html`, and change the "← Games" link if you like.

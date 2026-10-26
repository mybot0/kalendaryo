# Kalendaryo (web version)

A family hub on your own website. Each family gets its own private link. Owners invite people with a role.

- **Start page:** "Create my family" gives you a personal link like `https://your-site.onrender.com/c/…`.
- **Inside:** calendar, chores and stars, routines, meals and Shop, lists, photos, countdowns, weather, wall mode.
- **Invites (Family section):** pick Viewer, Editor or Owner, then send the link. Each link works once and expires in 7 days.
- **Roles:** Viewer can look. Editor can add and change. Owner can also invite, change roles, remove people and delete the family. There is always at least one owner.
- **AI (optional):** Shop ingredients and dinner ideas use your Anthropic API key, with a daily limit per family.

There are no accounts. Each person's link is their key. If a link is shared, the new person gets in as that person, and an owner can remove them.

---

## Put it on Render (about 10 minutes)

1. **Put this folder on GitHub.** Make a new private repository and upload everything in this folder (not `node_modules`).
2. In Render, go to **New → Blueprint** and pick the repository. Render reads `render.yaml` and creates:
   - the web service `kalendaryo`
   - the Postgres database `kalendaryo-db`
3. Render asks for **ANTHROPIC_API_KEY**.
   - To turn AI on: paste your key from console.anthropic.com (API Keys). Usage is billed to your Anthropic account.
   - To keep AI off: leave it empty. Everything else still works.
4. Press **Apply** and wait for the deploy to finish. Open the site address Render shows, then press **Create my family**.
5. **Bookmark your link.** It is your key to the family.

**About the free plans:** free Render web services go to sleep when nobody uses them, so the first visit can take up to a minute to wake up. Free databases have had time and size limits. Check Render's current limits, and pick a paid database plan for real family use so nothing is lost.

## Settings (Render → kalendaryo → Environment)

| Name | What it does | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection (set by the Blueprint) | required |
| `ANTHROPIC_API_KEY` | Turns on AI ideas | empty = off |
| `ANTHROPIC_MODEL` | Which Claude model | `claude-haiku-5-5` |
| `AI_DAILY_LIMIT` | AI requests per family per day | `20` |
| `INVITE_DAYS` | Days before an invite link expires | `7` |

## Changing the app

- The screens are in `client/src` (shared with the version that runs inside Claude). The web-only parts are in `client/web`: the start page, invites, and the server connector.
- After a change, run `node client/build.js web`. This rebuilds `public/index.html`. Commit it, and Render redeploys.
- The server is in `server/`. It uses only Node and the `pg` package.

## Run it on your own computer

```
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/kalendaryo npm start
```
Then open http://localhost:3000.

The full browser test (needs Python Playwright and a local Postgres) is `python3 test/e2e.py`.

## Privacy and safety

- Links are long random keys. The server stores only a fingerprint (hash) of each one.
- Pages tell the browser never to pass the link on to other websites.
- Families cannot see each other's data or photos.
- Photos are shrunk on the phone before upload and stored in the database.

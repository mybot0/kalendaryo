# Changes made to Triply inside the Kalendaryo repo

Paste this note into the Triply chat so its copy stays the same as this one.

---

Please update Triply with these changes, made in the Kalendaryo chat:

1. **Travel doodle background** (`client/src/styles/base.css`)
   - Right after the `body { ... }` rule there is a new `body` rule.
   - It adds a warm peach, light sky blue and soft yellow glow, plus a repeating 680px tile of faded terracotta (#B8583A, 12% opacity) travel line drawings.
   - The drawings are a suitcase, plane, passport, camera, map pin, palm tree, ticket, compass, mountains, boat, globe, sun, sunglasses and a map.
   - It uses `background-attachment: fixed`.
   - The cards and the side rail stay plain.
2. **Bug fix: "null" text on My Trips** (`client/src/js/screens/trips.js`)
   - Both `root.replaceChildren(head, error ? ... : null, ...)` calls now spread a filtered array, `replaceChildren(...[...].filter(Boolean))`.
   - Before this, the word "null" showed under the My Trips title when there was no error.

Two things noticed on a phone (390px wide), not fixed yet:
- **Overview:** a long trip name breaks in the middle of words ("Boraca / y barkad / a trip"), because the title shares its row with the search, bell and Edit buttons.
- **My Trips:** the title, "Open a link" and "New trip" crowd each other in the header.

The updated files are in the Kalendaryo repo, branch `add-triply`, folder `triply/`.

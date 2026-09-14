# Progress

Running log for the room-layout visualizer. Update this as work happens —
check items off, add new ones, don't let it drift from reality.

## Done

- [x] Project scaffolding: static HTML/CSS/JS app, no build step
- [x] `CLAUDE.md` with project conventions and data model
- [x] Room data model: floor plan (wall-segment polygon) + separate wall
      elevation views, for one room
- [x] Canvas floor-plan renderer to scale, with grid and wall dimension labels
- [x] Furniture toolbox (pt-BR catalog: sofá, cama, mesa, guarda-roupa, etc.
      + item personalizado)
- [x] Drag to move furniture; rotate/resize/remove via a simple action bar
      (buttons, not drag-handles — friendlier on a phone)
- [x] Layout persistence via `localStorage`
- [x] Read-only wall elevation views (2 tabs)
- [x] PWA setup: manifest + service worker, installable on a phone, works
      offline
- [x] Resolved sketch label meanings with the user: `C` = cozinha, `T/D` was
      an abandoned power-socket note, `SW`/`45` don't encode anything worth
      modeling. Room renamed to `Cozinha`; wall-view tabs renamed to
      `Parede 1` / `Parede 2` (dropped the misleading "SW").

## Next

- [ ] **Get the real measurements for the kitchen from the user** and
      replace the placeholder rectangle in `room-data.js`:
  - The actual wall-segment breakdown — the room has notches/jogs, not a
    plain rectangle
  - Ceiling height and door/window positions + sizes for the two wall views
  - Measurements are hand-taped and not 100% consistent wall-to-wall —
    average out discrepancies rather than picking one reading arbitrarily
- [ ] Add door/window openings to the floor plan (data model already
      supports `openings`, none populated yet)
- [ ] More rooms are coming — the user has additional rooms to measure and
      hand over. Don't restructure `room-data.js` into a multi-room list
      preemptively; wait until there's a second room's data in hand (the
      seam for that is described in CLAUDE.md's "Path to a sellable
      version")
- [ ] Test the installed PWA on an actual phone (Add to Home Screen) — check
      touch drag feels right, canvas sizing on small screens
- [ ] Walk through the app with the family member once the real house data
      is loaded

## Ideas for later (not started, not committed to)

- Power-socket (tomada) tracking per wall — the user's original sketch tried
  to note this (`T/D`) and gave up by hand; an app-assisted version (tap a
  point on a wall, mark it as a socket, optionally count per wall) is a
  natural fit once the core layout tool is solid
- Multiple rooms for the same house
- Multiple projects/houses (only worth it if this turns into a sellable
  product — see "Path to a sellable version" in `CLAUDE.md`)
- Undo/redo for furniture placement
- Export/share the layout (image or link) so family can see it without the app

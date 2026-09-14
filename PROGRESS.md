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
- [x] Got the full house room map + measurement sketches for all six rooms.
      Resolved inconsistent room labels across sketches: `BAR`→`BR`
      (banheiro), `BPR`→`BER1` (quarto 1) — see CLAUDE.md.
- [x] Kitchen floor plan is real data now: 3.84 x 1.83 outer footprint, plus
      a `fixedFurniture` list (pia, tanque, armário de cozinha,
      guarda-roupa, a pillar/duct) with reconstructed positions. Added
      fixed-furniture rendering to `FloorPlanView` (dashed border + 🔒,
      not draggable/deletable).
- [x] First visual-review round from the user: fixed a wall-outline z-order
      bug (fixed items flush against a wall were painting over the wall
      line — outline now drawn last, on top), added real wall-opening
      rendering (`floorPlan.openings`, types `'open'`/`'glass'`), restyled
      the pillar as a solid wall block instead of locked furniture, and
      moved the unidentified 1.11x0.35 piece out of `fixedFurniture` into a
      new `defaultItems` concept (pre-placed but freely movable/removable,
      seeded only when there's no saved layout yet) — it's a loose
      countertop board ("Bancada"), not fixed to the house.

## Next

- [ ] **Another visual review round** — this round's biggest guess: the
      opening beside the pillar (`wall: 1, offset: 0.61, width: 1.22,
      type: 'open'` in `room-data.js`) leading to the entrance/geladeira
      space. The width (1.22m = remaining wall length after the 0.61m
      pillar stub) is inferred, not directly measured — confirm it looks
      right, or correct it.
  - Also worth a glance: whether the two glass dividers (`type: 'glass'`,
    dashed blue lines) should actually be full openings (`type: 'open'`)
    instead — the user's wording leaned toward "open space" for both.
- [ ] Kitchen wall elevations (`wallViews` in `room-data.js`) are still
      placeholder — deferred at the user's request until the floor plan
      is confirmed solid. Come back to these (heights, door/window
      positions) once the above is confirmed.
- [ ] Get floor-plan measurements encoded for the other five rooms: Sala
      (LR), Varanda (BAL), Quarto 1 (BER1), Quarto 2 (BER2), Banheiro (BR).
      Some of this data has already been provided by the user (sketches
      exist) but isn't transcribed into code yet.
- [ ] Once a second room's data is ready to add, do the multi-room
      restructure described in CLAUDE.md's "Path to a sellable version" —
      don't do it before then.
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

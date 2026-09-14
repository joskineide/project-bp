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

## Next

- [ ] **Confirm real measurements with the user against the original sketch**
      (photo of the notebook). Specifically need:
  - What `C` and `T/D` mean on the floor-plan sketch (room label? corner
    reference?)
  - What `SW`/`45` and the compass-looking number on the third sketch mean
    (wall orientation?)
  - The actual wall-segment breakdown — the room has notches/jogs, not a
    plain rectangle; current `room-data.js` is a placeholder rectangle
  - Ceiling height and door/window positions + sizes for the two wall views
- [ ] Replace placeholder `room-data.js` with confirmed geometry
- [ ] Add door/window openings to the floor plan (data model already
      supports `openings`, none populated yet)
- [ ] Test the installed PWA on an actual phone (Add to Home Screen) — check
      touch drag feels right, canvas sizing on small screens
- [ ] Walk through the app with the family member once the real house data
      is loaded

## Ideas for later (not started, not committed to)

- Multiple rooms for the same house
- Multiple projects/houses (only worth it if this turns into a sellable
  product — see "Path to a sellable version" in `CLAUDE.md`)
- Undo/redo for furniture placement
- Export/share the layout (image or link) so family can see it without the app

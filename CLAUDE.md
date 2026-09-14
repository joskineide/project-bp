# CLAUDE.md

Guidance for Claude Code (and future sessions) working in this repository.

## Project

A room-layout visualizer: a small, no-backend web app that draws a real room
to scale (from hand-measured dimensions) and lets you drag scaled shapes
(furniture) around it to test how things would fit before a move.

Built for a specific family member's new place first. The house/room is
hardcoded as the app's default data — there is no "create a new project" flow
yet. If this ever grows into a general tool, that's a deliberate later step
(see "Path to a sellable version" below), not something to build preemptively.

## Non-negotiables

- **UI language is Brazilian Portuguese (pt-BR).** Every user-facing string
  (labels, buttons, furniture names, hints, alerts) must be in Portuguese.
  Code identifiers and comments are in English, as usual.
- **No build step.** Plain HTML/CSS/JS with native ES modules
  (`<script type="module">`). No bundler, no framework, no npm dependencies.
  Keep it that way unless the user explicitly asks to change it — the whole
  point is that this stays simple enough for one person to maintain and for
  the app to be opened by just serving static files.
- **No backend.** All persistence is `localStorage`. The app must work fully
  offline once installed (see PWA below).
- **Mobile-first.** The primary device is a phone (installed as a PWA), not
  a desktop browser. Test interactions with touch in mind (drag, tap), not
  just mouse.

## Architecture

```
index.html              App shell, tabs (Planta Baixa / Parede SW / Parede 2)
manifest.json, sw.js     PWA install + offline cache
css/style.css            All styling
js/room-data.js          The hardcoded room: floor plan geometry + wall elevations
js/furniture-catalog.js  Default furniture pieces (pt-BR labels, sizes in meters)
js/geometry.js           Pure helpers: polygon from wall segments, hit-testing
js/storage.js            localStorage load/save for the placed-furniture layout
js/floor-plan.js         FloorPlanView: interactive canvas (drag/rotate/scale/delete)
js/wall-view.js          Read-only canvas renderer for a wall elevation
js/app.js                Wires tabs, toolbox, action bar, edit panel, export/import
tests/                   node:test suite (zero dependencies) — see "Testing" below
```

### Data model

`room-data.js` describes **one room** two ways, stored separately as the user
requested (the original notebook sketch has a floor plan and two separate
wall elevation drawings of that same room):

- `floorPlan`: the top-down outline, as a sequence of wall segments walked
  clockwise from a start point (`{ length, turn }` pairs — `turn` is the
  heading change in degrees after that wall). This can represent an
  irregular/notched room, not just a rectangle, by adding more segments.
- `wallViews`: a list of wall elevations (front-on view of a single wall,
  with width/height and door/window openings), independent of the floor
  plan data.

Furniture placed by the user is *not* in `room-data.js` — it's runtime state
in `FloorPlanView`, persisted to `localStorage` per room id via `storage.js`.

`room-data.js` can also list `fixedFurniture`: pieces that came with the
house (sinks, built-in cabinets, a pillar/duct) with fully-specified
position — not draggable, deletable, or part of hit-testing. `FloorPlanView`
renders them (`_drawFixedItems`) from `room.fixedFurniture` directly, kept
separate from `this.items` (the user's movable layout). Use `type: 'wall'`
for a structural element (pillar, partition) and `type: 'furniture'` for a
fixed appliance/cabinet — both render the same way today (dashed border +
lock glyph), the type is just documentation for now.

## Current status of the room measurements

The house has (at least) six rooms: `Cozinha` (K), `Sala` (LR), `Varanda`
(BAL), `Quarto 1` / `Quarto 2` (BER1/BER2), and `Banheiro` (BR) — the user's
labels were inconsistent across sketches while they were still figuring out
a naming convention (a room-map sketch labeled the bathroom `BAR` and the
first bedroom `BPR` at one point); by the last round of clarification the
mapping above is confirmed. Only the kitchen is modeled in `room-data.js` so
far — the app is still single-room (see "Path to a sellable version" below
for the intended seam once a second room's data is ready to add).

The kitchen's outer footprint (3.84 x 1.83) and its fixed furniture
(`fixedFurniture` in `room-data.js`) are reconstructed from the user's hand
measurements and are a solid v1, not placeholders — reconstructed by
converting each wall's "rectangle + spacing" description into an x-position
along that wall, treating the user's "glass wall/door" mention as occupying
one of the gaps rather than adding extra length (both walls' totals land
within ~1cm of 3.84m either way, which is within the hand-measurement
tolerance the user warned about). One fixed element (a 1.11 x 0.35 piece
near the bottom-right corner) is still unidentified — see `PROGRESS.md`.
Wall elevations/heights (`wallViews`) are still placeholders: the user
explicitly asked to defer those until the floor plan is solid.

## Editing furniture precisely

Dragging is the primary interaction, but every selected movable item also
gets a numeric edit panel (X/Y/width-or-radius/height/rotation/label —
`js/app.js`, wired to `FloorPlanView.updateSelectedItem`/`getSelectedItem`).
X/Y are meters from the room's left/top. This exists specifically so
measurements can be typed in exactly rather than eyeballed via drag — keep
it in sync with any new draggable field you add to item objects.

The floor-plan layout also has explicit "Exportar/Importar layout (.json)"
buttons (`FloorPlanView.replaceItems`) on top of the automatic
`localStorage` save — a deliberate backup/restore path, since `localStorage`
alone is invisible and per-browser.

## Testing

`tests/*.test.mjs`, run with `node --test` (Node's built-in runner — zero
npm dependencies, no package.json needed; `.mjs` makes Node treat the files
as ES modules regardless of any package.json `type` field, and the default
`.test.mjs` naming is auto-discovered). Covers:

- `geometry.test.mjs` — the pure helpers (`segmentsToPolygon`,
  `polygonBounds`, `pointInRotatedRect`, `pointInCircle`,
  `wallSubSegments`), including the wall-opening edge cases (openings at
  the very start/end of a wall, covering the whole wall, extending past
  it, out-of-order input, non-axis-aligned walls).
- `storage.test.mjs` — `loadLayout`/`saveLayout` against a stubbed
  `localStorage` (Node has no DOM), including corrupted-JSON handling.
- `room-data.test.mjs` — data-integrity checks on `ROOM` itself: the
  outline actually closes, every opening references a real wall and stays
  within its length, openings on the same wall don't overlap, every fixed/
  default item's footprint stays inside the room bounds, ids are unique.
  This is a regression guard for the exact class of mistakes that came up
  while transcribing hand measurements (an item placed outside the room, a
  wall's outline silently not closing) — extend it whenever a new room is
  added to `room-data.js`.

`FloorPlanView` and `wall-view.js` itself aren't unit tested — they're
canvas/DOM-bound, and pulling in a DOM shim (jsdom or similar) would break
the zero-npm-dependency rule. Changes there are checked visually (a local
`python3 -m http.server` + a screenshot, or by hand in a browser) rather
than automated; keep the logic they depend on (hit-testing, polygon math,
opening rendering) in `geometry.js` so it stays covered.

## Path to a sellable version (later, not now)

If this grows beyond one family member's room, the shape of the change is:
add a `projects`/`rooms` list wrapping today's single hardcoded `ROOM`
object, and a picker UI in front of the tabs. The rendering engine
(`geometry.js`, `floor-plan.js`, `wall-view.js`) is already written
data-driven and shouldn't need to change for that. Don't build this now —
it's just the intended seam.

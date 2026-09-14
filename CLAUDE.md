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
js/app.js                Wires tabs, toolbox, action bar; bootstraps everything
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

## Current status of the room measurements

The room is the kitchen (`Cozinha`). The dimensions in `room-data.js` are
still **placeholders** — a rough rectangle, not the real wall-by-wall
geometry from the hand-drawn sketch (the actual room has notches/jogs). The
user hand-measured everything with a tape measure, so the numbers may have
small inconsistencies wall-to-wall; average those out rather than treating
any single reading as gospel. Update `room-data.js` once the user provides
the confirmed values — see `PROGRESS.md` for what's still open, including
data for a few more rooms the user plans to add later.

The sketch labels that looked like data turned out not to matter for this
app: `C` = "cozinha", and `T/D` was the user's abandoned attempt to note
door/power-socket (`tomada`) info per wall — never finished, but see "Ideas
for later" in `PROGRESS.md`. Likewise `SW`/`45` on the wall-elevation
sketches don't encode a compass direction or anything else worth modeling;
the wall views are just labeled `Parede 1` / `Parede 2`.

## Path to a sellable version (later, not now)

If this grows beyond one family member's room, the shape of the change is:
add a `projects`/`rooms` list wrapping today's single hardcoded `ROOM`
object, and a picker UI in front of the tabs. The rendering engine
(`geometry.js`, `floor-plan.js`, `wall-view.js`) is already written
data-driven and shouldn't need to change for that. Don't build this now —
it's just the intended seam.

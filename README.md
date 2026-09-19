# Planta da Casa — room layout visualizer

A small, static, no-backend web app for testing whether furniture fits before a move. You describe your rooms from hand-measured dimensions, and then drag scaled furniture around the floor plan and around each wall's elevation to see what fits.

It was built for one family's new house, for someone who isn't technical: she opens a link on her phone, drops a "new furniture" block, types its real measurements, and drags it around. Nothing is sent anywhere. Everything she places is saved in her phone's `localStorage`.

The user interface is in Brazilian Portuguese (pt-BR). The code and comments are in English.

## What it does

**Planta Baixa (floor plan)**
- Every room of the house is drawn to scale in one shared, zoomable canvas.
- Drag, rotate and resize furniture. Pieces snap edge to edge to walls and to each other, and snapping can be turned off.
- Rectangles, circles and L-shaped pieces. Each piece has a name, exact size and colour.
- A distance measurer, and an option to show each piece's dimensions.
- Pinch-zoom, two-finger pan, floating undo / redo / zoom buttons, and Ctrl+Z / Ctrl+Y on a computer.

**Paredes (wall elevations)**
- Front-on views of individual walls, to scale, with the real heights of the fixed pieces (counters, cabinets, wardrobes) and stretches with no back wall.
- Drop your own objects on a wall (for example, "will this microwave fit under that cabinet?"). They snap to nearby edges and get a red outline if they collide with something.
- A height ruler, a distance measurer, and per-wall undo / redo.

**Admin tools** (open the page with `?admin` at the end of the address, e.g. `index.html?admin`)
- Draw a room's outline wall by wall, typing each length and direction.
- Drag corners, split walls, add glass panels and openings, and move a whole room.
- Add and edit the fixed pieces of the house and of each wall.
- Export every room and wall as JSON, so the numbers can be copied into the data file.

Ordinary visitors never see the admin tools, and nothing about admin mode is remembered.

## Tech

Vanilla JavaScript (native ES modules) and a 2D canvas. There is **no build step, no framework and no npm dependencies**. Persistence is `localStorage` only. All you need to serve it is any static file server.

## The house data is not in this repository

The floor plans of the rooms live in `js/room-data.js`, which is deliberately git-ignored (it describes a real home). To run the app you have to write your own. Without that file the app won't start, and `tests/room-data.test.mjs` fails.

Create `js/room-data.js`. This minimal file is a complete, working example, a 4 × 3 m room with a sink and one wall view:

```js
export const ROOMS = [
  {
    id: 'sala',
    name: 'Sala',
    // Where this room sits in the shared house canvas (meters).
    houseOffset: { x: 0, y: 0 },
    floorPlan: {
      startPoint: { x: 0, y: 0 },
      // The outline, walked wall by wall. It starts heading east (x to the
      // right, y DOWN); `turn` is the change of direction after each wall,
      // -90 = a left turn, +90 = a right turn. The last wall must close the
      // shape back at the start point.
      segments: [
        { length: 4, turn: -90 },
        { length: 3, turn: -90 },
        { length: 4, turn: -90 },
        { length: 3, turn: -90 },
      ],
      // Gaps / glass in a wall: which wall (index into `segments`), how far
      // along it, how wide. type is 'open' or 'glass'.
      openings: [{ wall: 1, offset: 1, width: 0.9, type: 'open' }],
    },
    // Pieces that came with the house. x/y are the piece's CENTER in this
    // room's own coordinates. type: 'furniture' | 'wall' | 'glass'.
    // An 'L' shape adds shape: 'L', notchWidth and notchHeight.
    fixedFurniture: [
      { id: 'pia', label: 'Pia', type: 'furniture', x: 0.6, y: -0.3, width: 1.2, height: 0.6, rotation: 0, color: '#abbac4' },
    ],
    defaultItems: [],
    // Wall elevations (optional). `offset` is metres from the wall's left edge
    // as seen from inside the room, `bottom` is metres above the floor.
    wallViews: [
      {
        id: 'sala-sul',
        label: 'Sala (parede sul)',
        width: 4,
        height: 2.5,
        caption: 'Vista de dentro da sala, de frente para a parede. Esquerda → direita.',
        furniture: [
          { label: 'Pia', offset: 0, width: 1.2, bottom: 0.2, height: 0.7, color: '#abbac4' },
          { label: 'Armário', offset: 0, width: 1.2, bottom: 1.6, height: 0.6, color: '#8f9ba3' },
        ],
        openings: [],
        openSpans: [], // stretches with no back wall: [{ offset, width, label }]
      },
    ],
  },
];

// The order the walls appear in the "Paredes" dropdown.
export const WALL_VIEW_ORDER = ['sala-sul'];
```

A room is placed in the shared canvas by its `houseOffset`. Each room is written in its own local coordinates, and rooms line up once their offsets are right. Room outlines in local coordinates always start heading east, so pick each room's origin at a corner where a wall runs due east.

### Easier way to get your own data

You don't have to write the numbers by hand. Start with a minimal `room-data.js` like the one above, open the app with `?admin`, and use "Desenhar paredes" to draw each room by typing its wall lengths and directions. Place your fixed pieces, then use "Exportar TODAS as salas (.json)". That file has every room's outline, openings and pieces, and you can transcribe it into `room-data.js`. Wall-view data has its own export, "Exportar TODAS as paredes (.json)". Edits made in admin mode are saved in your browser and take priority over `room-data.js`, so if you later change the data file and the page still shows the old shape, use "Restaurar padrão da sala" (admin) or clear the site data. Your `room-data.js` stays the source of truth.

## Running it locally

Any static file server works, because the app is plain files with ES modules (opening `index.html` straight from the disk doesn't work, since browsers block module imports from `file://`).

```
python -m http.server 8000
```

Then open <http://localhost:8000/index.html>. Add `?admin` to the address to get the editing tools.

## Tests

The tests use Node's built-in runner, so there's nothing to install (Node 18+):

```
node --test
```

They cover the geometry helpers, the storage layer, and data-integrity checks on `room-data.js`: every outline closes, every opening sits on a real wall, and every piece stays inside its room, accounting for rotation. `FloorPlanView` and the wall view are canvas-bound and are checked by hand in a browser.

## Deploying

The app is only static files. To publish it:

```
node make-deploy.mjs
```

This copies just the website files (`index.html`, `manifest.json`, `css/`, `js/`, `icons/`) into `deploy/`, ready to drag onto Netlify's manual deploy, or to upload to any static host. Do not publish the whole repository folder, since it also holds tests and, locally, your private layout data.

There is intentionally no service worker and no PWA installation flow: the goal was the simplest thing that works for a non-technical person. The consequence to know about is that the saved layout lives in that browser only, so clearing site data erases it, and iOS Safari can clear a plain website's storage if it goes unused for a long time. Adding the page to the home screen protects it.

## Project layout

```
index.html               App shell and tabs
css/style.css            Styling
js/room-data.js          YOUR rooms (git-ignored, you create it)
js/geometry.js           Pure helpers: wall polygons, hit-testing, snapping
js/floor-plan.js         Floor plan canvas: drag, rotate, snap, measure, admin tools
js/wall-view.js          Wall elevation canvas: objects, fixed pieces, measure
js/furniture-catalog.js  The two "new furniture" starting points
js/storage.js            localStorage keys and load/save helpers
js/app.js                Wires tabs, panels, buttons and admin mode
tests/                   node:test suite
make-deploy.mjs          Builds deploy/ for hosting
```

## Status

The project is finished for its original purpose. It has no license file yet.

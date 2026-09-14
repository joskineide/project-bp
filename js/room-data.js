// Data for the one room this app currently visualizes: the kitchen (Cozinha).
//
// Outer footprint (3.84 x 1.83) and fixed furniture below are reconstructed
// from the user's hand measurements + clarification. Coordinates: x runs
// along the 3.84m wall (0 = left end), y along the 1.83m depth (0 = the
// wall holding the sink/utility nook, 1.83 = the wall holding the wardrobe
// /cabinets). See PROGRESS.md for what's still open (one unidentified
// element, wall elevations/heights deferred until the floor plan is solid).

export const ROOM = {
  id: 'cozinha',
  name: 'Cozinha',

  // Top-down outline as wall segments walked clockwise from (0,0), heading
  // east initially. `turn` = heading change in degrees after that wall.
  // Simplified as a plain rectangle — the two small real wall elements
  // (pilar + partition, see fixedFurniture below, type: 'wall') aren't
  // folded into this outline yet, just drawn on top of it.
  floorPlan: {
    startPoint: { x: 0, y: 0 },
    segments: [
      { length: 3.84, turn: 90 }, // parede do tanque/pia
      { length: 1.83, turn: 90 }, // parede direita
      { length: 3.84, turn: 90 }, // parede do guarda-roupa/armário
      { length: 1.83, turn: 90 }, // parede esquerda (fecha o polígono)
    ],
    // Doors/windows along a wall: { wall: <segment index>, offset, width, type }.
    // Deferred along with wall elevations — see PROGRESS.md.
    openings: [],
  },

  // Fixed pieces that came with the house — not draggable, can't be moved
  // or deleted from the app, just shown so the user can plan movable
  // furniture around them. Reconstructed by walking each wall's rectangle
  // list the user described, converting "spacing" gaps and treating each
  // wall's glass-door mention as occupying one gap rather than adding
  // extra length (the totals land within ~1cm of 3.84m either way, well
  // inside hand-measurement tolerance).
  fixedFurniture: [
    {
      id: 'pia-cozinha',
      label: 'Pia',
      type: 'furniture',
      x: 2.355, y: 0.30,
      width: 1.15, height: 0.60,
      rotation: 0,
      color: '#8fb3c9',
    },
    {
      id: 'tanque',
      label: 'Tanque',
      type: 'furniture',
      x: 0.30, y: 0.315,
      width: 0.60, height: 0.63,
      rotation: 0,
      color: '#8fb3c9',
    },
    {
      id: 'armario-cozinha',
      label: 'Armário de cozinha',
      type: 'furniture',
      x: 2.04, y: 1.53,
      width: 1.32, height: 0.60, // dois módulos (0,67 + 0,63) + friso de 0,02
      rotation: 0,
      color: '#a9886b',
    },
    {
      id: 'guarda-roupa',
      label: 'Guarda-roupa',
      type: 'furniture',
      x: 0.305, y: 1.555,
      width: 0.61, height: 0.55,
      rotation: 0,
      color: '#a9886b',
    },
    {
      id: 'pilar-topo',
      label: 'Pilar / duto',
      type: 'wall',
      x: 3.74, y: 0.305,
      width: 0.12, height: 0.61,
      rotation: 0,
      color: '#555555',
    },
    {
      // TODO: unidentified — ask the user what this is when reviewing the
      // rendered plan. Position derived from the bottom-wall measurements;
      // width/depth are solid (1.11 x 0.35), just missing a label.
      id: 'elemento-nao-identificado',
      label: '? (a confirmar)',
      type: 'unknown',
      x: 3.285, y: 1.655,
      width: 1.11, height: 0.35,
      rotation: 0,
      color: '#e0a458',
    },
  ],

  // Wall elevations, drawn separately from the floor plan in the original
  // sketch. Deferred at the user's request until the floor plan is solid —
  // see PROGRESS.md.
  wallViews: [
    {
      id: 'parede-1',
      label: 'Parede da pia', // vista da parede da pia/tanque
      width: 3.84, // TODO: placeholder — real elevation deferred
      height: 2.60, // TODO: placeholder ceiling height
      openings: [],
    },
    {
      id: 'parede-2',
      label: 'Parede dos armários', // vista da parede dos armários/guarda-roupa
      width: 3.84, // TODO: placeholder — real elevation deferred
      height: 2.60, // TODO: placeholder ceiling height
      openings: [],
    },
  ],
};

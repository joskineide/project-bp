// Data for the one room this app currently visualizes: the kitchen (Cozinha).
//
// Outer footprint (3.84 x 1.83) and fixed furniture below are reconstructed
// from the user's hand measurements + clarification. Coordinates: x runs
// along the 3.84m wall (0 = left end), y along the 1.83m depth (0 = the
// wall holding the sink/utility nook, 1.83 = the wall holding the wardrobe
// /cabinets).

export const ROOM = {
  id: 'cozinha',
  name: 'Cozinha',

  // Top-down outline as wall segments walked clockwise from (0,0), heading
  // east initially (segment 0 = top/pia wall, 1 = right wall, 2 = bottom
  // /armários wall, 3 = left wall — matches the `wall` index used below in
  // `openings`). `turn` = heading change in degrees after that wall.
  floorPlan: {
    startPoint: { x: 0, y: 0 },
    segments: [
      { length: 3.84, turn: 90 }, // parede do tanque/pia
      { length: 1.83, turn: 90 }, // parede direita
      { length: 3.84, turn: 90 }, // parede do guarda-roupa/armário
      { length: 1.83, turn: 90 }, // parede esquerda (fecha o polígono)
    ],
    // { wall: <segment index>, offset, width, type } — offset/width in
    // meters measured along that wall from its start point (in the
    // direction the outline is walked, i.e. clockwise). type 'open' = no
    // wall at all (a real gap); 'glass' = a glass panel, drawn distinct
    // from solid wall.
    openings: [
      // Entre o tanque e a pia (parede 0): painel de vidro (não é porta de
      // batente, como o usuário esclareceu).
      { wall: 0, offset: 1.18, width: 0.60, type: 'glass' },
      // Ao lado do pilar/duto (parede direita, 1): o pilar cobre só os
      // primeiros 0,61m a partir do canto; o resto da parede é aberto —
      // acesso à entrada / vão para a geladeira. TODO: confirmar com o
      // usuário se a largura exata (1,22m) está certa ao revisar o
      // desenho renderizado.
      { wall: 1, offset: 0.61, width: 1.22, type: 'open' },
      // Entre o guarda-roupa e os armários (parede 2): "espaço aberto",
      // conforme o usuário descreveu explicitamente duas vezes.
      { wall: 2, offset: 2.46, width: 0.77, type: 'glass' },
    ],
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
      // A stub of the right wall (not furniture) separating the kitchen
      // from the entrance — the rest of that wall is open, see `openings`
      // (wall: 1) above.
      id: 'pilar-topo',
      label: 'Pilar / duto',
      type: 'wall',
      x: 3.74, y: 0.305,
      width: 0.12, height: 0.61,
      rotation: 0,
      color: '#555555',
    },
  ],

  // Pre-placed but movable/removable — unlike fixedFurniture, the user can
  // drag or delete these like any other furniture; only seeded when there's
  // no saved layout yet (see FloorPlanView constructor).
  defaultItems: [
    {
      // Two loose wood boards resting against the armário — a small
      // worktop, not attached to the house.
      id: 'bancada-cozinha',
      catalogId: 'bancada-cozinha',
      label: 'Bancada',
      shape: 'rect',
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

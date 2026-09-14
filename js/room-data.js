// Data for the one room this app currently visualizes: the kitchen (Cozinha).
//
// PLACEHOLDER DATA — see PROGRESS.md "Next" section. These numbers are a
// rough rectangular stand-in, not the real measurements from the hand
// sketch (the real room has notches/jogs). Do not treat as final; the user
// will provide the confirmed wall-by-wall values later, plus data for a few
// more rooms.

export const ROOM = {
  id: 'cozinha',
  name: 'Cozinha',

  // Top-down outline as wall segments walked clockwise from (0,0), heading
  // east initially. `turn` = heading change in degrees after that wall.
  floorPlan: {
    startPoint: { x: 0, y: 0 },
    segments: [
      { length: 2.50, turn: 90 }, // parede superior (TODO: real values pending — sketch shows notches along this wall)
      { length: 2.94, turn: 90 }, // parede direita
      { length: 2.50, turn: 90 }, // parede inferior
      { length: 2.94, turn: 90 }, // parede esquerda (fecha o polígono)
    ],
    // Doors/windows along a wall: { wall: <segment index>, offset, width, type }.
    // None placed yet — fill in once real measurements are provided.
    openings: [],
  },

  // Wall elevations, drawn separately from the floor plan in the original
  // sketch (front-on view of one wall each).
  wallViews: [
    {
      id: 'parede-1',
      label: 'Parede 1',
      width: 1.80, // TODO: placeholder
      height: 2.60, // TODO: placeholder ceiling height
      openings: [],
    },
    {
      id: 'parede-2',
      label: 'Parede 2',
      width: 1.78, // TODO: placeholder
      height: 2.60, // TODO: placeholder ceiling height
      openings: [],
    },
  ],
};

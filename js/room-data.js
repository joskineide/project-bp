// Data for the one room this app currently visualizes.
//
// PLACEHOLDER DATA — see PROGRESS.md "Next" section. These numbers are a
// rough rectangular stand-in, not the real measurements from the hand
// sketch (the real room has notches/jogs). Do not treat as final; replace
// once the sketch is confirmed with the user.

export const ROOM = {
  id: 'ambiente-1',
  name: 'Ambiente', // TODO: confirm room name/use ("C" / "T/D" on the sketch)

  // Top-down outline as wall segments walked clockwise from (0,0), heading
  // east initially. `turn` = heading change in degrees after that wall.
  floorPlan: {
    startPoint: { x: 0, y: 0 },
    segments: [
      { length: 2.50, turn: 90 }, // parede superior (TODO: confirm — sketch shows notches along this wall)
      { length: 2.94, turn: 90 }, // parede direita
      { length: 2.50, turn: 90 }, // parede inferior
      { length: 2.94, turn: 90 }, // parede esquerda (fecha o polígono)
    ],
    // Doors/windows along a wall: { wall: <segment index>, offset, width, type }.
    // None placed yet — fill in once confirmed with the user.
    openings: [],
  },

  // Wall elevations, drawn separately from the floor plan in the original
  // sketch. Labeled "SW"/"45" and a similar number on the third sketch —
  // meaning unconfirmed (compass orientation? something else?).
  wallViews: [
    {
      id: 'parede-sw',
      label: 'Parede SW',
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

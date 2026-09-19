// Starting points for new furniture. There are deliberately no named
// presets (sofa, bed, ...): the plan is for the user to measure the real
// furniture in her own house and type those sizes in, so every piece
// starts as a generic default and gets edited right after being dropped.
//
// `shape: 'L'` items are a `width` x `height` rectangle with a
// `notchWidth` x `notchHeight` rectangle cut out of the top-right corner
// (in the item's own unrotated frame) — one rectangle plus one removed,
// the same idea as a room's own notches. To face the notch a different
// direction, rotate the whole piece with the normal rotate buttons;
// there's no separate "which corner" setting. See "Furniture shapes" in
// CLAUDE.md.
export const FURNITURE_CATALOG = [
  { id: 'movel', label: 'Móvel', shape: 'rect', width: 1.0, height: 0.6, color: '#7c9885' },
  {
    id: 'movel-l',
    label: 'Móvel em L',
    shape: 'L',
    width: 1.2,
    height: 1.2,
    notchWidth: 0.6,
    notchHeight: 0.6,
    color: '#7c9885',
  },
];

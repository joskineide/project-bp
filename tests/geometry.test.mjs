import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  itemHalfExtents,
  snapInterval,
  piecesOverlap,
  segmentsToPolygon,
  polygonBounds,
  pointInRotatedRect,
  pointInCircle,
  wallSubSegments,
  closePolygon,
  insertWallVertex,
  removeWallVertex,
  distanceToSegment,
  wallBandQuad,
  pointInPolygon,
  walkAbsoluteSegments,
  lShapeLocalPoints,
  pointInLShape,
  clampViewOffset,
} from '../js/geometry.js';

test('clampViewOffset leaves an already-fine offset alone', () => {
  // content 0..10m at 50px/m = 500px wide, centered in a 600px viewport
  assert.equal(clampViewOffset(50, 0, 10, 50, 600), 50);
});

test('clampViewOffset stops the content sliding past the viewport midpoint (left edge)', () => {
  // content's left edge (offset px) may reach at most the midpoint (300)
  assert.equal(clampViewOffset(900, 0, 10, 50, 600), 300);
});

test('clampViewOffset stops the content sliding past the viewport midpoint (right edge)', () => {
  // content's right edge (10*50 + offset) may fall to at most the midpoint: offset >= 300 - 500
  assert.equal(clampViewOffset(-900, 0, 10, 50, 600), -200);
});

test('clampViewOffset accounts for content that does not start at world 0', () => {
  // world span 20..30 at 10px/m in a 400px viewport: offset range is [200-300, 200-200]
  assert.equal(clampViewOffset(500, 20, 30, 10, 400), 0);
  assert.equal(clampViewOffset(-500, 20, 30, 10, 400), -100);
});

test('segmentsToPolygon walks a closed rectangle back to its start point', () => {
  const points = segmentsToPolygon(
    { x: 0, y: 0 },
    [
      { length: 4, turn: 90 },
      { length: 2, turn: 90 },
      { length: 4, turn: 90 },
      { length: 2, turn: 90 },
    ]
  );
  assert.equal(points.length, 5);
  assert.deepEqual(points[0], { x: 0, y: 0 });
  // corners of a 4x2 rectangle walked clockwise (heading 0 = east, y+ = south)
  assert.ok(Math.abs(points[1].x - 4) < 1e-9 && Math.abs(points[1].y - 0) < 1e-9);
  assert.ok(Math.abs(points[2].x - 4) < 1e-9 && Math.abs(points[2].y - 2) < 1e-9);
  assert.ok(Math.abs(points[3].x - 0) < 1e-9 && Math.abs(points[3].y - 2) < 1e-9);
  // closes back to the start
  assert.ok(Math.abs(points[4].x - 0) < 1e-9 && Math.abs(points[4].y - 0) < 1e-9);
});

test('polygonBounds finds the bounding box of a point set', () => {
  const bounds = polygonBounds([
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: -1, y: 5 },
  ]);
  assert.deepEqual(bounds, { minX: -1, maxX: 4, minY: 0, maxY: 5 });
});

test('pointInRotatedRect: unrotated rectangle', () => {
  const rect = { x: 1, y: 1, width: 2, height: 1, rotation: 0 };
  assert.ok(pointInRotatedRect(1, 1, rect), 'center is inside');
  assert.ok(pointInRotatedRect(1.9, 1.4, rect), 'near a corner but inside');
  assert.ok(!pointInRotatedRect(2.5, 1, rect), 'outside on x');
  assert.ok(!pointInRotatedRect(1, 2, rect), 'outside on y');
});

test('pointInRotatedRect: rotation is taken into account', () => {
  // 2 (wide) x 0.5 (tall) rect rotated 90deg becomes 0.5 wide x 2 tall in world space
  const rect = { x: 0, y: 0, width: 2, height: 0.5, rotation: 90 };
  assert.ok(pointInRotatedRect(0, 0.9, rect), 'inside once rotated (tall axis)');
  assert.ok(!pointInRotatedRect(0.9, 0, rect), 'outside once rotated (was inside pre-rotation)');
});

test('pointInCircle', () => {
  const circle = { x: 5, y: 5, radius: 1 };
  assert.ok(pointInCircle(5, 5, circle));
  assert.ok(pointInCircle(5.9, 5, circle), 'inside near the edge');
  assert.ok(pointInCircle(6, 5, circle), 'exactly on the edge counts as inside');
  assert.ok(!pointInCircle(6.1, 5, circle));
});

test('wallSubSegments: no openings returns one solid segment spanning the whole wall', () => {
  const parts = wallSubSegments({ x: 0, y: 0 }, { x: 10, y: 0 }, []);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, 'solid');
  assert.deepEqual(parts[0].from, { x: 0, y: 0 });
  assert.deepEqual(parts[0].to, { x: 10, y: 0 });
});

test('wallSubSegments: one opening in the middle splits into solid/opening/solid', () => {
  const parts = wallSubSegments({ x: 0, y: 0 }, { x: 10, y: 0 }, [
    { offset: 4, width: 2, type: 'open' },
  ]);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].type, 'solid');
  assert.equal(parts[0].to.x, 4);
  assert.equal(parts[1].type, 'open');
  assert.equal(parts[1].from.x, 4);
  assert.equal(parts[1].to.x, 6);
  assert.equal(parts[2].type, 'solid');
  assert.equal(parts[2].from.x, 6);
  assert.equal(parts[2].to.x, 10);
});

test('wallSubSegments: opening flush against the start has no leading solid part', () => {
  const parts = wallSubSegments({ x: 0, y: 0 }, { x: 10, y: 0 }, [
    { offset: 0, width: 3, type: 'glass' },
  ]);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].type, 'glass');
  assert.equal(parts[1].type, 'solid');
});

test('wallSubSegments: opening covering the entire wall returns just the opening', () => {
  const parts = wallSubSegments({ x: 0, y: 0 }, { x: 5, y: 0 }, [
    { offset: 0, width: 5, type: 'open' },
  ]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, 'open');
});

test('wallSubSegments: opening extending past the wall end is clamped, not skipped', () => {
  const parts = wallSubSegments({ x: 0, y: 0 }, { x: 5, y: 0 }, [
    { offset: 4, width: 10, type: 'open' },
  ]);
  assert.equal(parts.length, 2);
  assert.equal(parts[1].type, 'open');
  assert.equal(parts[1].to.x, 5, 'clamped to the wall end, not 14');
});

test('wallSubSegments: multiple openings are handled out of input order', () => {
  const parts = wallSubSegments({ x: 0, y: 0 }, { x: 10, y: 0 }, [
    { offset: 7, width: 1, type: 'glass' },
    { offset: 1, width: 1, type: 'open' },
  ]);
  assert.equal(parts.length, 5);
  assert.deepEqual(
    parts.map((p) => p.type),
    ['solid', 'open', 'solid', 'glass', 'solid']
  );
});

test('wallSubSegments: works on a non-axis-aligned (vertical) wall too', () => {
  const parts = wallSubSegments({ x: 3, y: 0 }, { x: 3, y: 4 }, [
    { offset: 1, width: 2, type: 'open' },
  ]);
  assert.equal(parts.length, 3);
  assert.equal(parts[1].from.y, 1);
  assert.equal(parts[1].to.y, 3);
  parts.forEach((p) => {
    assert.equal(p.from.x, 3);
    assert.equal(p.to.x, 3);
  });
});

test('closePolygon repeats the first vertex at the end', () => {
  const vertices = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }];
  const ring = closePolygon(vertices);
  assert.equal(ring.length, 4);
  assert.deepEqual(ring[3], ring[0]);
});

test('closePolygon on an empty list returns an empty list', () => {
  assert.deepEqual(closePolygon([]), []);
});

test('insertWallVertex adds a midpoint and shifts later opening indices', () => {
  const vertices = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }];
  const openings = [
    { wall: 0, offset: 1, width: 1, type: 'open' }, // on the wall being split — dropped
    { wall: 2, offset: 0.5, width: 0.5, type: 'glass' }, // later wall — shifts to 3
  ];
  const result = insertWallVertex(vertices, openings, 0);
  assert.equal(result.vertices.length, 5);
  assert.deepEqual(result.vertices[1], { x: 2, y: 0 });
  assert.equal(result.newVertexIndex, 1);
  assert.equal(result.openings.length, 1);
  assert.equal(result.openings[0].wall, 3);
});

test('removeWallVertex merges two walls and drops their openings', () => {
  const vertices = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }];
  const openings = [
    { wall: 0, offset: 0.5, width: 0.5, type: 'open' }, // meets the removed vertex — dropped
    { wall: 1, offset: 0.5, width: 0.5, type: 'open' }, // meets the removed vertex — dropped
    { wall: 3, offset: 0.2, width: 0.2, type: 'glass' }, // untouched wall after — shifts to 2
  ];
  const result = removeWallVertex(vertices, openings, 1);
  assert.equal(result.vertices.length, 4);
  assert.deepEqual(result.vertices, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }]);
  assert.equal(result.openings.length, 1);
  assert.equal(result.openings[0].wall, 2);
});

test('removeWallVertex refuses to go below a 3-sided room', () => {
  const vertices = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 2 }];
  assert.equal(removeWallVertex(vertices, [], 0), null);
});

test('distanceToSegment: zero for a point on the line', () => {
  assert.equal(distanceToSegment(5, 0, { x: 0, y: 0 }, { x: 10, y: 0 }), 0);
});

test('distanceToSegment: perpendicular distance for a point off the line', () => {
  assert.equal(distanceToSegment(5, 3, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
});

test('distanceToSegment: clamps to the nearest endpoint past either end', () => {
  assert.equal(distanceToSegment(-4, 0, { x: 0, y: 0 }, { x: 10, y: 0 }), 4);
  assert.equal(distanceToSegment(14, 0, { x: 0, y: 0 }, { x: 10, y: 0 }), 4);
});

test('distanceToSegment: degenerate (zero-length) segment falls back to point distance', () => {
  assert.equal(distanceToSegment(3, 4, { x: 0, y: 0 }, { x: 0, y: 0 }), 5);
});

test('wallBandQuad offsets inward (to the right of travel) by the given thickness', () => {
  // Heading east along a clockwise-walked polygon — interior is south (+y).
  const quad = wallBandQuad({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.17);
  assert.deepEqual(quad, [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 0.17 },
    { x: 0, y: 0.17 },
  ]);
});

test('wallBandQuad works on a non-axis-aligned wall', () => {
  // Heading south (down the right wall) — interior is west (-x).
  const quad = wallBandQuad({ x: 4, y: 0 }, { x: 4, y: 2 }, 0.12);
  assert.ok(Math.abs(quad[2].x - 3.88) < 1e-9 && Math.abs(quad[2].y - 2) < 1e-9);
  assert.ok(Math.abs(quad[3].x - 3.88) < 1e-9 && Math.abs(quad[3].y - 0) < 1e-9);
});

test('wallBandQuad on a degenerate (zero-length) segment returns a,b,b,a', () => {
  const a = { x: 1, y: 1 };
  const b = { x: 1, y: 1 };
  assert.deepEqual(wallBandQuad(a, b, 0.1), [a, b, b, a]);
});

test('walkAbsoluteSegments walks each segment by its own absolute angle', () => {
  const points = walkAbsoluteSegments(
    { x: 0, y: 0 },
    [
      { length: 4, angle: 0 }, // east
      { length: 2, angle: 90 }, // south
      { length: 1, angle: 180 }, // west
    ]
  );
  assert.equal(points.length, 4);
  assert.deepEqual(points[0], { x: 0, y: 0 });
  assert.ok(Math.abs(points[1].x - 4) < 1e-9 && Math.abs(points[1].y - 0) < 1e-9);
  assert.ok(Math.abs(points[2].x - 4) < 1e-9 && Math.abs(points[2].y - 2) < 1e-9);
  assert.ok(Math.abs(points[3].x - 3) < 1e-9 && Math.abs(points[3].y - 2) < 1e-9);
});

test('walkAbsoluteSegments: changing one segment length only moves points from there on, angles unchanged', () => {
  const segments = [
    { length: 4, angle: 0 },
    { length: 2, angle: 90 },
    { length: 3, angle: 0 },
  ];
  const before = walkAbsoluteSegments({ x: 0, y: 0 }, segments);
  const after = walkAbsoluteSegments({ x: 0, y: 0 }, [
    { length: 6, angle: 0 }, // lengthen the first wall by 2
    segments[1],
    segments[2],
  ]);
  // The edited wall's own endpoint moves...
  assert.ok(Math.abs(after[1].x - 6) < 1e-9);
  // ...and every point after it slides along by the same delta, direction
  // (the vector between consecutive points) unchanged for every segment
  // after the edited one.
  for (let i = 1; i < before.length; i += 1) {
    assert.ok(Math.abs(after[i].x - before[i].x - 2) < 1e-9);
    assert.ok(Math.abs(after[i].y - before[i].y) < 1e-9);
  }
});

test('walkAbsoluteSegments with no segments returns just the start point', () => {
  const points = walkAbsoluteSegments({ x: 5, y: 5 }, []);
  assert.deepEqual(points, [{ x: 5, y: 5 }]);
});

test('pointInPolygon: point inside a square ring returns true', () => {
  const square = closePolygon([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]);
  assert.ok(pointInPolygon(2, 2, square));
});

test('pointInPolygon: point outside a square ring returns false', () => {
  const square = closePolygon([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]);
  assert.ok(!pointInPolygon(5, 2, square));
});

test('pointInPolygon: works on an L-shaped (notched) polygon', () => {
  // An L-shape: a 4x4 square missing its top-right 2x2 corner.
  const lShape = closePolygon([
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
    { x: 4, y: 2 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ]);
  assert.ok(pointInPolygon(1, 1, lShape), 'inside the notched-out area should be false, this point is in the solid part');
  assert.ok(!pointInPolygon(3, 1, lShape), 'inside the missing corner (notched out) should be false');
  assert.ok(pointInPolygon(1, 3, lShape), 'inside the remaining solid part should be true');
});

test('lShapeLocalPoints cuts a notch out of the top-right corner', () => {
  const points = lShapeLocalPoints(4, 4, 2, 2);
  // Centered on (0,0): a 4x4 square (corners at +/-2) missing the 2x2
  // square where x>0 and y<0 (top-right in the y-down convention).
  assert.deepEqual(points, [
    { x: -2, y: -2 },
    { x: 0, y: -2 },
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
    { x: -2, y: 2 },
  ]);
});

test('lShapeLocalPoints clamps an oversized notch to the item\'s own footprint', () => {
  const points = lShapeLocalPoints(4, 4, 10, 10);
  // A notch as big as (or bigger than) the whole item just eats the whole
  // top-right quadrant, not more — never a negative or inverted shape.
  points.forEach((p) => {
    assert.ok(p.x >= -2 && p.x <= 2);
    assert.ok(p.y >= -2 && p.y <= 2);
  });
});

test('pointInLShape: unrotated, a point in the notch is outside, a point in the remaining solid part is inside', () => {
  const item = { x: 0, y: 0, width: 4, height: 4, notchWidth: 2, notchHeight: 2, rotation: 0 };
  assert.ok(!pointInLShape(1, -1, item), 'top-right notch should be empty');
  assert.ok(pointInLShape(-1, -1, item), 'top-left is solid');
  assert.ok(pointInLShape(1, 1, item), 'bottom-right is solid');
});

test('pointInLShape: rotation carries the notch to a different corner', () => {
  // Rotated 180 degrees, the notch (originally top-right) ends up
  // bottom-left instead.
  const item = { x: 0, y: 0, width: 4, height: 4, notchWidth: 2, notchHeight: 2, rotation: 180 };
  assert.ok(!pointInLShape(-1, 1, item), 'bottom-left notch (after 180 degree rotation) should be empty');
  assert.ok(pointInLShape(1, -1, item), 'top-right is now solid after the rotation');
});

test('snapInterval pulls the closest end onto a nearby target, else does nothing', () => {
  assert.ok(Math.abs(snapInterval(1.02, 1.5, [1.0, 3], 0.05) - -0.02) < 1e-9);
  assert.ok(Math.abs(snapInterval(0.5, 0.98, [1.0], 0.05) - 0.02) < 1e-9);
  assert.equal(snapInterval(0.5, 0.9, [1.0], 0.05), 0);
  assert.ok(Math.abs(snapInterval(0.5, 0.99, [0.51, 1.0], 0.05) - 0.01) < 1e-9);
});

test('piecesOverlap: shared area overlaps, touching edges and gaps do not', () => {
  const a = { offset: 0, bottom: 0, width: 1, height: 1 };
  assert.equal(piecesOverlap(a, { offset: 0.5, bottom: 0.5, width: 1, height: 1 }), true);
  assert.equal(piecesOverlap(a, { offset: 1, bottom: 0, width: 1, height: 1 }), false);
  assert.equal(piecesOverlap(a, { offset: 0, bottom: 1, width: 1, height: 1 }), false);
  assert.equal(piecesOverlap(a, { offset: 2, bottom: 2, width: 1, height: 1 }), false);
});

test('itemHalfExtents is rotation-aware and handles circles', () => {
  const r = itemHalfExtents({ shape: 'rect', width: 2, height: 1, rotation: 90 });
  assert.ok(Math.abs(r.halfW - 0.5) < 1e-9 && Math.abs(r.halfH - 1) < 1e-9);
  assert.deepEqual(itemHalfExtents({ shape: 'circle', radius: 0.3 }), { halfW: 0.3, halfH: 0.3 });
  assert.deepEqual(itemHalfExtents({ width: 2, height: 1 }), { halfW: 1, halfH: 0.5 });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  segmentsToPolygon,
  polygonBounds,
  pointInRotatedRect,
  pointInCircle,
  wallSubSegments,
} from '../js/geometry.js';

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

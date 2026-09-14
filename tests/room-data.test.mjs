// Data-integrity checks for room-data.js — a regression guard for the exact
// class of mistakes that came up while transcribing hand measurements:
// fixed items placed outside the room, openings pointing at a wall that
// doesn't exist, duplicate ids, an outline that doesn't actually close.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentsToPolygon, polygonBounds } from '../js/geometry.js';
import { ROOM } from '../js/room-data.js';

const EPSILON = 1e-6;

test('floor plan outline closes back to its start point', () => {
  const points = segmentsToPolygon(ROOM.floorPlan.startPoint, ROOM.floorPlan.segments);
  const first = points[0];
  const last = points[points.length - 1];
  assert.ok(Math.abs(first.x - last.x) < EPSILON, 'x does not close');
  assert.ok(Math.abs(first.y - last.y) < EPSILON, 'y does not close');
});

test('every opening references a wall segment that actually exists', () => {
  const wallCount = ROOM.floorPlan.segments.length;
  (ROOM.floorPlan.openings || []).forEach((opening) => {
    assert.ok(
      opening.wall >= 0 && opening.wall < wallCount,
      `opening references wall ${opening.wall}, but there are only ${wallCount} walls`
    );
  });
});

test('no opening runs past the end of its wall', () => {
  (ROOM.floorPlan.openings || []).forEach((opening) => {
    const wallLength = ROOM.floorPlan.segments[opening.wall].length;
    assert.ok(
      opening.offset >= 0 && opening.offset + opening.width <= wallLength + EPSILON,
      `opening on wall ${opening.wall} (offset ${opening.offset}, width ${opening.width}) exceeds its wall length ${wallLength}`
    );
  });
});

test('openings on the same wall do not overlap each other', () => {
  const byWall = new Map();
  (ROOM.floorPlan.openings || []).forEach((opening) => {
    if (!byWall.has(opening.wall)) byWall.set(opening.wall, []);
    byWall.get(opening.wall).push(opening);
  });
  byWall.forEach((openings, wall) => {
    const sorted = [...openings].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < sorted.length; i += 1) {
      const prevEnd = sorted[i - 1].offset + sorted[i - 1].width;
      assert.ok(
        sorted[i].offset >= prevEnd - EPSILON,
        `openings overlap on wall ${wall}`
      );
    }
  });
});

test('every fixed-furniture item sits within the room bounds', () => {
  const points = segmentsToPolygon(ROOM.floorPlan.startPoint, ROOM.floorPlan.segments);
  const bounds = polygonBounds(points);
  (ROOM.fixedFurniture || []).forEach((item) => {
    const halfW = item.width / 2;
    const halfH = item.height / 2;
    assert.ok(
      item.x - halfW >= bounds.minX - EPSILON && item.x + halfW <= bounds.maxX + EPSILON,
      `${item.id} extends outside the room on x`
    );
    assert.ok(
      item.y - halfH >= bounds.minY - EPSILON && item.y + halfH <= bounds.maxY + EPSILON,
      `${item.id} extends outside the room on y`
    );
  });
});

test('every default (pre-placed movable) item sits within the room bounds', () => {
  const points = segmentsToPolygon(ROOM.floorPlan.startPoint, ROOM.floorPlan.segments);
  const bounds = polygonBounds(points);
  (ROOM.defaultItems || []).forEach((item) => {
    const halfW = item.width / 2;
    const halfH = item.height / 2;
    assert.ok(item.x - halfW >= bounds.minX - EPSILON && item.x + halfW <= bounds.maxX + EPSILON);
    assert.ok(item.y - halfH >= bounds.minY - EPSILON && item.y + halfH <= bounds.maxY + EPSILON);
  });
});

test('fixedFurniture and defaultItems ids are all unique', () => {
  const ids = [...(ROOM.fixedFurniture || []), ...(ROOM.defaultItems || [])].map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id found across fixedFurniture/defaultItems');
});

test('wallViews each have a positive width and height', () => {
  (ROOM.wallViews || []).forEach((wall) => {
    assert.ok(wall.width > 0, `${wall.id} has non-positive width`);
    assert.ok(wall.height > 0, `${wall.id} has non-positive height`);
  });
});

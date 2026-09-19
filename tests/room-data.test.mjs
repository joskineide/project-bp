// Data-integrity checks for room-data.js — a regression guard for the exact
// class of mistakes that came up while transcribing hand measurements:
// fixed items placed outside the room, openings pointing at a wall that
// doesn't exist, duplicate ids, an outline that doesn't actually close.
// Runs against every room in `ROOMS`, not just the kitchen, so a mistake in
// a newly-added room gets caught the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentsToPolygon, polygonBounds, itemHalfExtents } from '../js/geometry.js';
import { ROOMS } from '../js/room-data.js';

const EPSILON = 1e-6;

ROOMS.forEach((room) => {
  test(`[${room.id}] floor plan outline closes back to its start point`, () => {
    const points = segmentsToPolygon(room.floorPlan.startPoint, room.floorPlan.segments);
    const first = points[0];
    const last = points[points.length - 1];
    assert.ok(Math.abs(first.x - last.x) < EPSILON, 'x does not close');
    assert.ok(Math.abs(first.y - last.y) < EPSILON, 'y does not close');
  });

  test(`[${room.id}] every opening references a wall segment that actually exists`, () => {
    const wallCount = room.floorPlan.segments.length;
    (room.floorPlan.openings || []).forEach((opening) => {
      assert.ok(
        opening.wall >= 0 && opening.wall < wallCount,
        `opening references wall ${opening.wall}, but there are only ${wallCount} walls`
      );
    });
  });

  test(`[${room.id}] no opening runs past the end of its wall`, () => {
    (room.floorPlan.openings || []).forEach((opening) => {
      const wallLength = room.floorPlan.segments[opening.wall].length;
      assert.ok(
        opening.offset >= 0 && opening.offset + opening.width <= wallLength + EPSILON,
        `opening on wall ${opening.wall} (offset ${opening.offset}, width ${opening.width}) exceeds its wall length ${wallLength}`
      );
    });
  });

  test(`[${room.id}] openings on the same wall do not overlap each other`, () => {
    const byWall = new Map();
    (room.floorPlan.openings || []).forEach((opening) => {
      if (!byWall.has(opening.wall)) byWall.set(opening.wall, []);
      byWall.get(opening.wall).push(opening);
    });
    byWall.forEach((openings, wall) => {
      const sorted = [...openings].sort((a, b) => a.offset - b.offset);
      for (let i = 1; i < sorted.length; i += 1) {
        const prevEnd = sorted[i - 1].offset + sorted[i - 1].width;
        assert.ok(sorted[i].offset >= prevEnd - EPSILON, `openings overlap on wall ${wall}`);
      }
    });
  });

  test(`[${room.id}] every wall with a measured thickness stays within [0, wall length]`, () => {
    (room.floorPlan.wallThickness || []).forEach((thickness, i) => {
      if (thickness === undefined) return;
      assert.ok(thickness > 0, `wall ${i} has a non-positive thickness`);
      assert.ok(
        thickness <= room.floorPlan.segments[i].length,
        `wall ${i}'s thickness (${thickness}) exceeds its own length`
      );
    });
  });

  test(`[${room.id}] every fixed-furniture item sits within the room bounds`, () => {
    const points = segmentsToPolygon(room.floorPlan.startPoint, room.floorPlan.segments);
    const bounds = polygonBounds(points);
    (room.fixedFurniture || []).forEach((item) => {
      const { halfW, halfH } = itemHalfExtents(item);
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

  test(`[${room.id}] every default (pre-placed movable) item sits within the room bounds`, () => {
    const points = segmentsToPolygon(room.floorPlan.startPoint, room.floorPlan.segments);
    const bounds = polygonBounds(points);
    (room.defaultItems || []).forEach((item) => {
      const { halfW, halfH } = itemHalfExtents(item);
      assert.ok(item.x - halfW >= bounds.minX - EPSILON && item.x + halfW <= bounds.maxX + EPSILON);
      assert.ok(item.y - halfH >= bounds.minY - EPSILON && item.y + halfH <= bounds.maxY + EPSILON);
    });
  });

  test(`[${room.id}] fixedFurniture and defaultItems ids are all unique`, () => {
    const ids = [...(room.fixedFurniture || []), ...(room.defaultItems || [])].map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate id found across fixedFurniture/defaultItems');
  });

  test(`[${room.id}] wallViews each have a positive width and height`, () => {
    (room.wallViews || []).forEach((wall) => {
      assert.ok(wall.width > 0, `${wall.id} has non-positive width`);
      assert.ok(wall.height > 0, `${wall.id} has non-positive height`);
    });
  });

  test(`[${room.id}] has some position (houseOffset or provisionalHouseOffset) so it's reachable in the shared canvas`, () => {
    assert.ok(
      room.houseOffset || room.provisionalHouseOffset,
      `${room.id} has neither houseOffset nor provisionalHouseOffset — it would be invisible/unreachable`
    );
  });
});

test('every room id in ROOMS is unique', () => {
  const ids = ROOMS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate room id found in ROOMS');
});

ROOMS.forEach((room) => {
  (room.wallViews || []).forEach((wall) => {
    test(`[${room.id}] wall view "${wall.label}": every piece stays within the wall's width and ceiling`, () => {
      [...(wall.furniture || []), ...(wall.openings || []), ...(wall.openSpans || [])].forEach((piece) => {
        const name = piece.label || piece.type || 'piece';
        assert.ok(piece.offset >= -EPSILON, `${name}: starts before the wall's left edge`);
        assert.ok(piece.offset + piece.width <= wall.width + EPSILON, `${name}: extends past the wall's right edge`);
        if (piece.height !== undefined) {
          assert.ok((piece.bottom || 0) >= -EPSILON, `${name}: starts below the floor`);
          assert.ok((piece.bottom || 0) + piece.height <= wall.height + EPSILON, `${name}: extends above the ceiling`);
        }
      });
    });
  });
});

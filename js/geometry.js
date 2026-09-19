// Pure geometry helpers: turning wall segments into a polygon, and hit-testing.

// Walks a sequence of { length, turn } segments starting at startPoint,
// heading east (0 deg) initially. `turn` is the heading change (degrees,
// clockwise-positive) applied *after* drawing that segment.
export function segmentsToPolygon(startPoint, segments) {
  const points = [{ x: startPoint.x, y: startPoint.y }];
  let heading = 0;
  let current = { ...startPoint };

  segments.forEach((seg) => {
    const rad = (heading * Math.PI) / 180;
    current = {
      x: current.x + seg.length * Math.cos(rad),
      y: current.y + seg.length * Math.sin(rad),
    };
    points.push({ ...current });
    heading += seg.turn;
  });

  return points;
}

export function polygonBounds(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function pointInRotatedRect(px, py, rect) {
  const { x, y, width, height, rotation } = rect;
  const rad = (-rotation * Math.PI) / 180;
  const dx = px - x;
  const dy = py - y;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2;
}

export function pointInCircle(px, py, circle) {
  const dx = px - circle.x;
  const dy = py - circle.y;
  return Math.sqrt(dx * dx + dy * dy) <= circle.radius;
}

// Local (unrotated, centered on the item's own x/y) outline for an
// L-shaped item: a plain `width` x `height` rectangle with a
// `notchWidth` x `notchHeight` rectangle cut out of its top-right corner
// — the same "one rectangle, one piece removed" idea as a room's own
// notches, just for a single furniture piece instead of a whole room.
// Always cut from the top-right in this local frame; the user picks
// which real-world corner that ends up facing with the item's normal
// rotation, rather than picking a corner directly — one less thing to
// learn beyond the rotate buttons everything else already uses. Returns
// an open list of 6 corners (not closed — pair with closePolygon for a
// ring, as pointInLShape does).
export function lShapeLocalPoints(width, height, notchWidth, notchHeight) {
  const halfW = width / 2;
  const halfH = height / 2;
  const nw = Math.min(Math.max(notchWidth, 0), width);
  const nh = Math.min(Math.max(notchHeight, 0), height);
  return [
    { x: -halfW, y: -halfH },
    { x: halfW - nw, y: -halfH },
    { x: halfW - nw, y: -halfH + nh },
    { x: halfW, y: -halfH + nh },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];
}

// Point-in-L-shape hit test, rotation-aware — same rotate-into-local
// -frame step as pointInRotatedRect, then a plain point-in-polygon check
// against the L's own outline.
export function pointInLShape(px, py, item) {
  const { x, y, width, height, notchWidth, notchHeight, rotation } = item;
  const rad = (-rotation * Math.PI) / 180;
  const dx = px - x;
  const dy = py - y;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
  const ring = closePolygon(lShapeLocalPoints(width, height, notchWidth, notchHeight));
  return pointInPolygon(localX, localY, ring);
}

// Closes a list of distinct corner vertices into a polygon ring (repeats the
// first point at the end) so wall-walking code (openings, rendering) can
// treat every edge, including the one that closes the shape, uniformly.
export function closePolygon(vertices) {
  if (vertices.length === 0) return [];
  return [...vertices, vertices[0]];
}

// Splits the wall between vertices[wallIndex] and the next vertex (wrapping
// around) by inserting a new vertex at its midpoint — used by admin-mode
// "add a wall" editing. Any opening on the wall being split is dropped: its
// offset no longer maps unambiguously to either half. Openings on walls
// after the split point shift their `wall` index by one to stay attached to
// the same physical wall.
export function insertWallVertex(vertices, openings, wallIndex) {
  const a = vertices[wallIndex];
  const b = vertices[(wallIndex + 1) % vertices.length];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const nextVertices = [...vertices];
  nextVertices.splice(wallIndex + 1, 0, mid);
  const nextOpenings = openings
    .filter((o) => o.wall !== wallIndex)
    .map((o) => (o.wall > wallIndex ? { ...o, wall: o.wall + 1 } : o));
  return { vertices: nextVertices, openings: nextOpenings, newVertexIndex: wallIndex + 1 };
}

// Removes a corner vertex, merging the two walls that met there into one —
// used by admin-mode "remove a wall" editing. Refuses (returns null) below
// a 3-sided room. Openings on either merged wall are dropped for the same
// reason as insertWallVertex; openings further along shift their `wall`
// index down by one.
export function removeWallVertex(vertices, openings, vertexIndex) {
  if (vertices.length <= 3) return null;
  const n = vertices.length;
  const prevWall = (vertexIndex - 1 + n) % n;
  const nextVertices = vertices.filter((_, i) => i !== vertexIndex);
  const nextOpenings = openings
    .filter((o) => o.wall !== vertexIndex && o.wall !== prevWall)
    .map((o) => (o.wall > vertexIndex ? { ...o, wall: o.wall - 1 } : o));
  return { vertices: nextVertices, openings: nextOpenings };
}

// Shortest distance from point (px,py) to the line segment [a,b] — used to
// hit-test taps against a wall's actual line, not just its endpoints.
export function distanceToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(px - projX, py - projY);
}

// Returns the 4 corners (outer-a, outer-b, inner-b, inner-a) of the band a
// wall of real `thickness` occupies along segment [a,b] — used to draw a
// wall as an actual filled shape instead of a thin stroke. [a,b] is taken
// as the wall's *outer* face (the outline the room was measured to), and
// the band is offset "inward" (to the right of travel from a to b), which
// is the room's interior for a clockwise-walked polygon — the convention
// `segmentsToPolygon` and the rest of this app already use.
export function wallBandQuad(a, b, thickness) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [a, b, b, a];
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy; // +90° rotation of the travel direction = inward normal
  const ny = ux;
  const innerA = { x: a.x + nx * thickness, y: a.y + ny * thickness };
  const innerB = { x: b.x + nx * thickness, y: b.y + ny * thickness };
  return [a, b, innerB, innerA];
}

// Standard ray-casting point-in-polygon test. `polygon` is a closed ring
// (first point repeated at the end, as returned by closePolygon /
// segmentsToPolygon) — used in the whole-house combined view to figure out
// which room's area a background tap landed in, so that room becomes the
// focused one for editing.
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 2; i < polygon.length - 1; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Clamps one axis of the canvas's pan offset so the content span
// [min, max] (world meters, drawn at `scale` px/m and shifted by `offset`
// px) can never slide so far off that more than half the viewport is empty
// on either side — the "don't scroll into the void" rule. Equivalent to:
// the content's near edge never passes the viewport's midpoint, and its far
// edge never falls short of it. The valid range is never empty (max > min).
export function clampViewOffset(offset, min, max, scale, viewportSize) {
  const lo = viewportSize / 2 - max * scale;
  const hi = viewportSize / 2 - min * scale;
  return Math.min(hi, Math.max(lo, offset));
}

// Walks a sequence of { length, angle } segments — angle in degrees,
// *absolute* (0 = east, 90 = south, clockwise-positive, same convention as
// segmentsToPolygon's heading), not relative to the previous segment's
// direction — starting at startPoint. Used by the interactive wall-drawing
// tool (FloorPlanView's "Desenhar parede" mode, admin mode): the user picks
// each wall's own direction and length directly, so editing one segment's
// length only ever changes that segment's own endpoint; every following
// point is recomputed from scratch by re-walking the (unchanged) angles
// after it, which is what keeps every other wall's own direction exactly
// the same while shifting its position — the "everything downstream just
// slides along" behavior the tool is built around. Returns the open point
// list (length segments.length + 1, not closed back to the start).
export function walkAbsoluteSegments(startPoint, segments) {
  const points = [{ x: startPoint.x, y: startPoint.y }];
  let current = { x: startPoint.x, y: startPoint.y };
  segments.forEach((seg) => {
    const rad = (seg.angle * Math.PI) / 180;
    current = {
      x: current.x + seg.length * Math.cos(rad),
      y: current.y + seg.length * Math.sin(rad),
    };
    points.push({ ...current });
  });
  return points;
}

// Splits a wall segment [a,b] into solid/opening sub-segments given a list
// of { offset, width, type } openings measured in meters from a. type is
// 'open' (no wall — a real gap) or 'glass' (a glass panel, drawn distinct
// from solid wall); anything not covered by an opening is 'solid'.
export function wallSubSegments(a, b, openings) {
  const segLen = Math.hypot(b.x - a.x, b.y - a.y);
  if (segLen === 0) return [];
  const dir = { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen };
  const pointAt = (t) => ({ x: a.x + dir.x * t, y: a.y + dir.y * t });
  const sorted = [...openings].sort((o1, o2) => o1.offset - o2.offset);

  const parts = [];
  let cursor = 0;
  sorted.forEach((op) => {
    const start = Math.max(0, Math.min(op.offset, segLen));
    const end = Math.max(0, Math.min(op.offset + op.width, segLen));
    if (start > cursor) {
      parts.push({ from: pointAt(cursor), to: pointAt(start), type: 'solid' });
    }
    if (end > start) {
      parts.push({ from: pointAt(start), to: pointAt(end), type: op.type || 'open' });
    }
    cursor = Math.max(cursor, end);
  });
  if (cursor < segLen) {
    parts.push({ from: pointAt(cursor), to: pointAt(segLen), type: 'solid' });
  }
  return parts;
}

// Axis-aligned half-extents of an item's own footprint, rotation-aware — the
// standard rotated-rectangle AABB (a plain width/height swap at 90°/270°).
// Circles use their radius; an 'L' item's box is its full width x height.
export function itemHalfExtents(item) {
  if (item.shape === 'circle') return { halfW: item.radius, halfH: item.radius };
  const rad = ((item.rotation || 0) * Math.PI) / 180;
  const halfW = item.width / 2;
  const halfH = item.height / 2;
  return {
    halfW: Math.abs(halfW * Math.cos(rad)) + Math.abs(halfH * Math.sin(rad)),
    halfH: Math.abs(halfW * Math.sin(rad)) + Math.abs(halfH * Math.cos(rad)),
  };
}

// Wall-elevation helpers. A "piece" is { offset, bottom, width, height } in
// meters: offset from the wall's left edge, bottom above the floor.

// Nudge an interval [lo, hi] so one of its ends lands exactly on the closest
// target within `threshold`. Returns the amount to add (0 if nothing is close).
export function snapInterval(lo, hi, targets, threshold) {
  let best = 0;
  let bestAbs = Infinity;
  targets.forEach((t) => {
    [t - lo, t - hi].forEach((delta) => {
      if (Math.abs(delta) <= threshold && Math.abs(delta) < bestAbs) {
        best = delta;
        bestAbs = Math.abs(delta);
      }
    });
  });
  return best;
}

// True only when two pieces share actual area — touching edges don't count.
export function piecesOverlap(a, b, epsilon = 1e-6) {
  return (
    a.offset < b.offset + b.width - epsilon &&
    b.offset < a.offset + a.width - epsilon &&
    a.bottom < b.bottom + b.height - epsilon &&
    b.bottom < a.bottom + a.height - epsilon
  );
}

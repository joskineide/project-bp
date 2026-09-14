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

// Read-only elevation renderer for a wall: draws it to scale with any
// door/window openings marked. Not interactive (furniture placement only
// happens on the floor plan).
export function renderWallView(canvas, wall) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const padding = 32;
  const availW = rect.width - padding * 2;
  const availH = rect.height - padding * 2;
  const scale = Math.min(availW / wall.width, availH / wall.height);
  const w = wall.width * scale;
  const h = wall.height * scale;
  const x0 = (rect.width - w) / 2;
  const y0 = (rect.height - h) / 2;

  ctx.strokeStyle = '#2c2c2c';
  ctx.lineWidth = 4;
  ctx.strokeRect(x0, y0, w, h);

  (wall.openings || []).forEach((op) => {
    const ox = x0 + op.offset * scale;
    const oy = y0 + h - (op.bottom + op.height) * scale;
    const ow = op.width * scale;
    const oh = op.height * scale;
    ctx.fillStyle = op.type === 'window' ? '#a8d8ea' : '#e0c097';
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, ow, oh);
  });

  ctx.fillStyle = '#556';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${wall.width.toFixed(2)} m`, x0 + w / 2, y0 - 10);

  ctx.save();
  ctx.translate(x0 - 12, y0 + h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${wall.height.toFixed(2)} m`, 0, 0);
  ctx.restore();
}

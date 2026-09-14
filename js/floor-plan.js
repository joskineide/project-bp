import { segmentsToPolygon, polygonBounds, pointInRotatedRect, pointInCircle } from './geometry.js';
import { loadLayout, saveLayout } from './storage.js';

const GRID_STEP = 0.5; // meters
const PADDING_PX = 24;

// Interactive floor-plan canvas: draws the room to scale and lets the user
// add/drag/rotate/resize/remove furniture on top of it.
export class FloorPlanView {
  constructor(canvas, room) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.room = room;
    this.polygon = segmentsToPolygon(room.floorPlan.startPoint, room.floorPlan.segments);
    this.bounds = polygonBounds(this.polygon);
    this.items = loadLayout(room.id) || [];
    this.selectedId = null;
    this.dragging = null;
    this.onSelectionChange = null;

    this._resize = this._resize.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    window.addEventListener('resize', this._resize);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);

    this._resize();
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = this.bounds.maxX - this.bounds.minX;
    const h = this.bounds.maxY - this.bounds.minY;
    const availW = rect.width - PADDING_PX * 2;
    const availH = rect.height - PADDING_PX * 2;
    this.scale = Math.max(10, Math.min(availW / w, availH / h));
    this.offsetX = PADDING_PX + (availW - w * this.scale) / 2 - this.bounds.minX * this.scale;
    this.offsetY = PADDING_PX + (availH - h * this.scale) / 2 - this.bounds.minY * this.scale;

    this.render();
  }

  toScreen(x, y) {
    return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
  }

  toWorld(px, py) {
    return { x: (px - this.offsetX) / this.scale, y: (py - this.offsetY) / this.scale };
  }

  addItem(catalogItem, overrides = {}) {
    const center = {
      x: (this.bounds.minX + this.bounds.maxX) / 2,
      y: (this.bounds.minY + this.bounds.maxY) / 2,
    };
    const item = {
      id: `${catalogItem.id}-${Date.now()}`,
      catalogId: catalogItem.id,
      label: catalogItem.label,
      shape: catalogItem.shape,
      color: catalogItem.color,
      x: center.x,
      y: center.y,
      rotation: 0,
      width: catalogItem.width,
      height: catalogItem.height,
      radius: catalogItem.radius,
      ...overrides,
    };
    this.items.push(item);
    this._select(item.id);
    this._persist();
    this.render();
    return item;
  }

  removeSelected() {
    if (!this.selectedId) return;
    this.items = this.items.filter((i) => i.id !== this.selectedId);
    this._select(null);
    this._persist();
    this.render();
  }

  rotateSelected(delta) {
    const item = this._getSelected();
    if (!item) return;
    item.rotation = (item.rotation + delta + 360) % 360;
    this._persist();
    this.render();
  }

  scaleSelected(factor) {
    const item = this._getSelected();
    if (!item) return;
    if (item.shape === 'circle') {
      item.radius = Math.max(0.08, item.radius * factor);
    } else {
      item.width = Math.max(0.1, item.width * factor);
      item.height = Math.max(0.1, item.height * factor);
    }
    this._persist();
    this.render();
  }

  clearAll() {
    this.items = [];
    this._select(null);
    this._persist();
    this.render();
  }

  _getSelected() {
    return this.items.find((i) => i.id === this.selectedId) || null;
  }

  _select(id) {
    this.selectedId = id;
    if (this.onSelectionChange) this.onSelectionChange(this._getSelected());
  }

  _hitTest(worldX, worldY) {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      if (item.shape === 'circle') {
        if (pointInCircle(worldX, worldY, item)) return item;
      } else if (pointInRotatedRect(worldX, worldY, item)) {
        return item;
      }
    }
    return null;
  }

  _onPointerDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const world = this.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = this._hitTest(world.x, world.y);
    if (hit) {
      this._select(hit.id);
      this.dragging = { id: hit.id, offsetX: world.x - hit.x, offsetY: world.y - hit.y };
      this.canvas.setPointerCapture(e.pointerId);
    } else {
      this._select(null);
    }
    this.render();
  }

  _onPointerMove(e) {
    if (!this.dragging) return;
    const rect = this.canvas.getBoundingClientRect();
    const world = this.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const item = this.items.find((i) => i.id === this.dragging.id);
    if (!item) return;
    item.x = world.x - this.dragging.offsetX;
    item.y = world.y - this.dragging.offsetY;
    this.render();
  }

  _onPointerUp() {
    if (this.dragging) {
      this._persist();
      this.dragging = null;
    }
  }

  _persist() {
    saveLayout(this.room.id, this.items);
  }

  render() {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    ctx.clearRect(0, 0, cssW, cssH);

    this._drawGrid(cssW, cssH);
    this._drawWalls();
    this._drawItems();
  }

  _drawGrid(cssW, cssH) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = '#e4e4e0';
    ctx.lineWidth = 1;
    const startX = Math.floor(-this.offsetX / this.scale / GRID_STEP) * GRID_STEP;
    const endX = Math.ceil((cssW - this.offsetX) / this.scale / GRID_STEP) * GRID_STEP;
    for (let x = startX; x <= endX; x += GRID_STEP) {
      const sx = this.toScreen(x, 0).x;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, cssH);
      ctx.stroke();
    }
    const startY = Math.floor(-this.offsetY / this.scale / GRID_STEP) * GRID_STEP;
    const endY = Math.ceil((cssH - this.offsetY) / this.scale / GRID_STEP) * GRID_STEP;
    for (let y = startY; y <= endY; y += GRID_STEP) {
      const sy = this.toScreen(0, y).y;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(cssW, sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawWalls() {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.polygon.forEach((p, idx) => {
      const s = this.toScreen(p.x, p.y);
      if (idx === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#556';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < this.polygon.length - 1; i += 1) {
      const a = this.polygon[i];
      const b = this.polygon[i + 1];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = this.toScreen(mid.x, mid.y);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.fillText(`${len.toFixed(2)} m`, s.x, s.y - 6);
    }
    ctx.restore();
  }

  _drawItems() {
    const { ctx } = this;
    this.items.forEach((item) => {
      ctx.save();
      const s = this.toScreen(item.x, item.y);
      ctx.translate(s.x, s.y);
      ctx.rotate((item.rotation * Math.PI) / 180);
      ctx.fillStyle = item.color;
      ctx.strokeStyle = item.id === this.selectedId ? '#e63946' : '#333';
      ctx.lineWidth = item.id === this.selectedId ? 3 : 1.5;

      if (item.shape === 'circle') {
        const r = item.radius * this.scale;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const w = item.width * this.scale;
        const h = item.height * this.scale;
        ctx.beginPath();
        ctx.rect(-w / 2, -h / 2, w, h);
        ctx.fill();
        ctx.stroke();
      }

      ctx.rotate((-item.rotation * Math.PI) / 180);
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, 0, 0);
      ctx.restore();
    });
  }
}

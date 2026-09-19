// Interactive wall elevation: the wall drawn front-on and to scale (left to
// right as seen from inside the room), with fixed pieces that came with the
// house (locked, editable only in admin mode) and movable objects the user
// drops on it to test whether something fits (a microwave, a shelf, ...).
//
// wall = {
//   id, label, width, height, caption,   // meters
//   furniture: [{ label, offset, width, bottom, height, type, color }],
//                                        // offset = from the left edge, bottom = above the floor,
//                                        // type 'furniture' (default) or 'glass'
//   openings:  [{ offset, width, bottom, height, type }],   // doors/windows
//   openSpans: [{ offset, width, label }],                  // stretches with no back wall
// }
import { loadWallLayout, saveWallLayout } from './storage.js';
import { snapInterval, piecesOverlap, distanceToSegment } from './geometry.js';

const PADDING_X = 40;
const PADDING_Y = 36;
const MIN_SIZE = 0.01;
const SNAP_PX = 8;
const DRAG_START_PX = 3;
const MOVABLE_COLOR = '#e9b872';
const FIXED_COLOR = '#8f9ba3';

const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (meters) => meters.toFixed(2).replace('.', ',');

export class WallElevationView {
  constructor(canvas) {
    this.canvas = canvas;
    this.wall = null;
    this.fixed = [];
    this.items = [];
    this.fixedEdited = false;
    this.selected = null; // { kind: 'item' | 'fixed', id }
    this.adminMode = false;
    this.undoStack = [];
    this.redoStack = [];
    this.drag = null;
    this.layout = null;
    this.measurements = []; // free-standing distance notes: { id, x1, y1, x2, y2 } in wall meters (x from left, y above floor)
    this.measureMode = false;
    this.selectedMeasurementId = null;
    this.pendingMeasurement = null;
    this.onSelectionChange = null;
    this.onMeasurementSelectionChange = null;
    this.onChange = null;

    canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this._onPointerUp(e));
  }

  // --- State -------------------------------------------------------------

  setWall(wall) {
    this.wall = wall;
    const stored = loadWallLayout(wall.id);
    this.fixed = clone(stored && stored.fixed ? stored.fixed : wall.furniture || []);
    this.fixed.forEach((piece, i) => {
      if (!piece.id) piece.id = `fixo-${i}`;
    });
    this.fixedEdited = Boolean(stored && stored.fixed);
    this.items = clone((stored && stored.items) || []);
    this.measurements = clone((stored && stored.measurements) || []);
    this.undoStack = [];
    this.redoStack = [];
    this.selected = null;
    this.selectedMeasurementId = null;
    this.pendingMeasurement = null;
    this.drag = null;
    this._notifyMeasurementSelection();
    this._notifySelection();
    this._notifyChange();
    this.render();
  }

  setAdminMode(on) {
    this.adminMode = on;
    if (!on && this.selected && this.selected.kind === 'fixed') this.selected = null;
    this._notifySelection();
    this.render();
  }

  getSelected() {
    if (!this.selected) return null;
    return this._array(this.selected.kind).find((p) => p.id === this.selected.id) || null;
  }

  getSelectedKind() {
    return this.selected ? this.selected.kind : null;
  }

  _array(kind) {
    return kind === 'fixed' ? this.fixed : this.items;
  }

  _persist() {
    if (!this.wall) return;
    saveWallLayout(this.wall.id, {
      items: this.items,
      fixed: this.fixedEdited ? this.fixed : null,
      measurements: this.measurements,
    });
  }

  _state() {
    return JSON.stringify({
      fixed: this.fixed,
      items: this.items,
      fixedEdited: this.fixedEdited,
      measurements: this.measurements,
    });
  }

  // Called before every new change; a new change also empties the redo stack.
  _snapshot() {
    this.undoStack.push(this._state());
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this._notifyChange();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this._state());
    this._restore(this.undoStack.pop());
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this._state());
    this._restore(this.redoStack.pop());
  }

  _restore(json) {
    const state = JSON.parse(json);
    this.fixed = state.fixed;
    this.items = state.items;
    this.fixedEdited = state.fixedEdited;
    this.measurements = state.measurements || [];
    if (!this.getSelected()) this.selected = null;
    if (!this._getSelectedMeasurement()) this.selectedMeasurementId = null;
    this._persist();
    this._notifyMeasurementSelection();
    this._notifySelection();
    this._notifyChange();
    this.render();
  }

  _notifySelection() {
    if (this.onSelectionChange) this.onSelectionChange(this.getSelected(), this.getSelectedKind());
  }

  _notifyChange() {
    if (this.onChange) this.onChange();
  }

  // --- Distance measurements ---------------------------------------------

  _getSelectedMeasurement() {
    return this.measurements.find((m) => m.id === this.selectedMeasurementId) || null;
  }

  _notifyMeasurementSelection() {
    if (this.onMeasurementSelectionChange) this.onMeasurementSelectionChange(this._getSelectedMeasurement());
  }

  setMeasureMode(on) {
    this.measureMode = Boolean(on);
    this.canvas.classList.toggle('measuring', this.measureMode);
    if (this.measureMode && this.selected) {
      this.selected = null;
      this._notifySelection();
    }
    this.render();
  }

  _selectMeasurement(id) {
    this.selected = null;
    this.selectedMeasurementId = id;
    this._notifySelection();
    this._notifyMeasurementSelection();
    this.render();
  }

  removeSelectedMeasurement() {
    const m = this._getSelectedMeasurement();
    if (!m) return;
    this._snapshot();
    this.measurements.splice(this.measurements.indexOf(m), 1);
    this.selectedMeasurementId = null;
    this._persist();
    this._notifyMeasurementSelection();
    this._notifyChange();
    this.render();
  }

  // Canvas pixel -> wall meters (x from the left edge, y above the floor),
  // kept inside the wall.
  _wallPoint(p) {
    const { x0, floorY, scale } = this.layout;
    return {
      x: clamp((p.x - x0) / scale, 0, this.wall.width),
      y: clamp((floorY - p.y) / scale, 0, this.wall.height),
    };
  }

  // A measurement end snaps onto a nearby piece/wall corner; failing that, it
  // lines up horizontally/vertically with the start point, so widths and
  // heights read exactly.
  _snapPoint(pt, from) {
    const threshold = SNAP_PX / this.layout.scale;
    const { width, height } = this.wall;
    const corners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: height },
      { x: width, y: height },
    ];
    [...this.fixed, ...this.items].forEach((o) => {
      [o.offset, o.offset + o.width].forEach((x) => {
        [o.bottom, o.bottom + o.height].forEach((y) => corners.push({ x, y }));
      });
    });
    let best = null;
    let bestDist = threshold;
    corners.forEach((c) => {
      const d = Math.hypot(c.x - pt.x, c.y - pt.y);
      if (d <= bestDist) {
        best = c;
        bestDist = d;
      }
    });
    if (best) return { x: best.x, y: best.y };
    const out = { x: pt.x, y: pt.y };
    if (from) {
      if (Math.abs(out.x - from.x) <= threshold) out.x = from.x;
      if (Math.abs(out.y - from.y) <= threshold) out.y = from.y;
    }
    return out;
  }

  _measurementScreenPoints(m) {
    const { x0, floorY, scale } = this.layout;
    return [
      { x: x0 + m.x1 * scale, y: floorY - m.y1 * scale },
      { x: x0 + m.x2 * scale, y: floorY - m.y2 * scale },
    ];
  }

  _hitMeasurement(px, py) {
    for (let i = this.measurements.length - 1; i >= 0; i--) {
      const [a, b] = this._measurementScreenPoints(this.measurements[i]);
      if (distanceToSegment(px, py, a, b) <= 12) return this.measurements[i];
    }
    return null;
  }

  _clampPiece(piece) {
    const { width, height } = this.wall;
    piece.width = clamp(piece.width, MIN_SIZE, width);
    piece.height = clamp(piece.height, MIN_SIZE, height);
    piece.offset = clamp(piece.offset, 0, width - piece.width);
    piece.bottom = clamp(piece.bottom, 0, height - piece.height);
  }

  // --- Editing -----------------------------------------------------------

  addItem() {
    return this._add('item', { label: 'Novo objeto', width: 0.5, height: 0.4, color: MOVABLE_COLOR });
  }

  addFixed() {
    return this._add('fixed', { label: 'Item fixo', width: 0.5, height: 0.4, color: FIXED_COLOR, type: 'furniture' });
  }

  _add(kind, base) {
    if (!this.wall) return null;
    this._snapshot();
    const piece = {
      id: `${kind === 'fixed' ? 'fixo' : 'obj'}-${Date.now()}`,
      offset: (this.wall.width - base.width) / 2,
      bottom: Math.min(1, this.wall.height - base.height),
      ...base,
    };
    this._clampPiece(piece);
    this._array(kind).push(piece);
    if (kind === 'fixed') this.fixedEdited = true;
    this.selected = { kind, id: piece.id };
    this._afterEdit();
    return piece;
  }

  updateSelected(fields) {
    const piece = this.getSelected();
    if (!piece) return;
    this._snapshot();
    Object.assign(piece, fields);
    this._clampPiece(piece);
    if (this.selected.kind === 'fixed') this.fixedEdited = true;
    this._afterEdit();
  }

  removeSelected() {
    const piece = this.getSelected();
    if (!piece) return;
    this._snapshot();
    const arr = this._array(this.selected.kind);
    arr.splice(arr.indexOf(piece), 1);
    if (this.selected.kind === 'fixed') this.fixedEdited = true;
    this.selected = null;
    this._afterEdit();
  }

  clearItems() {
    if (!this.items.length) return;
    this._snapshot();
    this.items = [];
    if (this.selected && this.selected.kind === 'item') this.selected = null;
    this._afterEdit();
  }

  resetFixed() {
    if (!this.wall) return;
    this._snapshot();
    this.fixed = clone(this.wall.furniture || []);
    this.fixed.forEach((piece, i) => {
      if (!piece.id) piece.id = `fixo-${i}`;
    });
    this.fixedEdited = false;
    if (this.selected && this.selected.kind === 'fixed') this.selected = null;
    this._afterEdit();
  }

  _afterEdit() {
    this._persist();
    this._notifySelection();
    this._notifyChange();
    this.render();
  }

  // --- Pointer handling --------------------------------------------------

  _canvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _pieceRect(piece) {
    const { x0, floorY, scale } = this.layout;
    return {
      x: x0 + piece.offset * scale,
      y: floorY - (piece.bottom + piece.height) * scale,
      w: piece.width * scale,
      h: piece.height * scale,
    };
  }

  _hit(px, py) {
    const inside = (piece) => {
      const r = this._pieceRect(piece);
      return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    };
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (inside(this.items[i])) return { kind: 'item', piece: this.items[i] };
    }
    if (this.adminMode) {
      for (let i = this.fixed.length - 1; i >= 0; i--) {
        if (inside(this.fixed[i])) return { kind: 'fixed', piece: this.fixed[i] };
      }
    }
    return null;
  }

  _onPointerDown(e) {
    if (!this.wall || !this.layout) return;
    const p = this._canvasPoint(e);

    if (this.measureMode) {
      const existing = this._hitMeasurement(p.x, p.y);
      if (existing) {
        this._selectMeasurement(existing.id);
        return;
      }
      const start = this._snapPoint(this._wallPoint(p), null);
      this.drag = { kind: 'measure', x1: start.x, y1: start.y, moved: false };
      this.pendingMeasurement = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
      if (this.selectedMeasurementId) {
        this.selectedMeasurementId = null;
        this._notifyMeasurementSelection();
      }
      if (this.canvas.setPointerCapture) this.canvas.setPointerCapture(e.pointerId);
      this.render();
      return;
    }

    const hit = this._hit(p.x, p.y);
    if (!hit) {
      const existing = this._hitMeasurement(p.x, p.y);
      if (existing) {
        this._selectMeasurement(existing.id);
        return;
      }
      if (this.selected || this.selectedMeasurementId) {
        this.selected = null;
        this.selectedMeasurementId = null;
        this._notifySelection();
        this._notifyMeasurementSelection();
        this.render();
      }
      return;
    }
    if (this.selectedMeasurementId) {
      this.selectedMeasurementId = null;
      this._notifyMeasurementSelection();
    }
    this.selected = { kind: hit.kind, id: hit.piece.id };
    this.drag = {
      kind: hit.kind,
      piece: hit.piece,
      startX: p.x,
      startY: p.y,
      origOffset: hit.piece.offset,
      origBottom: hit.piece.bottom,
      moved: false,
    };
    if (this.canvas.setPointerCapture) this.canvas.setPointerCapture(e.pointerId);
    this._notifySelection();
    this.render();
  }

  _onPointerMove(e) {
    const d = this.drag;
    if (!d) return;
    const p = this._canvasPoint(e);
    const { scale } = this.layout;
    if (d.kind === 'measure') {
      const q = this._snapPoint(this._wallPoint(p), { x: d.x1, y: d.y1 });
      this.pendingMeasurement = { x1: d.x1, y1: d.y1, x2: q.x, y2: q.y };
      d.moved = true;
      this.render();
      return;
    }
    if (!d.moved) {
      if (Math.abs(p.x - d.startX) + Math.abs(p.y - d.startY) < DRAG_START_PX) return;
      d.moved = true;
      this._snapshot();
    }
    const piece = d.piece;
    piece.offset = d.origOffset + (p.x - d.startX) / scale;
    piece.bottom = d.origBottom - (p.y - d.startY) / scale;

    const threshold = SNAP_PX / scale;
    const others = [...this.items, ...this.fixed].filter((o) => o !== piece);
    const xTargets = [0, this.wall.width];
    const yTargets = [0, this.wall.height];
    others.forEach((o) => {
      xTargets.push(o.offset, o.offset + o.width);
      yTargets.push(o.bottom, o.bottom + o.height);
    });
    piece.offset += snapInterval(piece.offset, piece.offset + piece.width, xTargets, threshold);
    piece.bottom += snapInterval(piece.bottom, piece.bottom + piece.height, yTargets, threshold);
    this._clampPiece(piece);
    if (d.kind === 'fixed') this.fixedEdited = true;
    this._notifySelection();
    this.render();
  }

  _onPointerUp(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (this.canvas.releasePointerCapture) {
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch (err) {
        // capture may already be gone (pointercancel)
      }
    }
    if (d.kind === 'measure') {
      const pm = this.pendingMeasurement;
      this.pendingMeasurement = null;
      if (pm && Math.hypot(pm.x2 - pm.x1, pm.y2 - pm.y1) >= 0.02) {
        this._snapshot();
        const m = { id: `med-${Date.now()}`, ...pm };
        this.measurements.push(m);
        this.selectedMeasurementId = m.id;
        this._persist();
        this._notifyMeasurementSelection();
        this._notifyChange();
      }
      this.render();
      return;
    }
    if (d.moved) this._persist();
    this.render();
  }

  // --- Rendering ---------------------------------------------------------

  render() {
    const canvas = this.canvas;
    if (!this.wall) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const wall = this.wall;
    const scale = Math.min((rect.width - PADDING_X * 2) / wall.width, (rect.height - PADDING_Y * 2) / wall.height);
    const w = wall.width * scale;
    const h = wall.height * scale;
    const x0 = (rect.width - w) / 2;
    const y0 = (rect.height - h) / 2;
    const floorY = y0 + h;
    this.layout = { x0, y0, w, h, floorY, scale };

    ctx.fillStyle = '#f6f3ee';
    ctx.fillRect(x0, y0, w, h);

    (wall.openSpans || []).forEach((span) => {
      this._drawOpenSpan(ctx, x0 + span.offset * scale, y0, span.width * scale, h, span);
    });

    (wall.openings || []).forEach((op) => {
      const ox = x0 + op.offset * scale;
      const oy = floorY - (op.bottom + op.height) * scale;
      ctx.fillStyle = op.type === 'window' ? '#a8d8ea' : '#e0c097';
      ctx.fillRect(ox, oy, op.width * scale, op.height * scale);
      ctx.strokeStyle = '#2c2c2c';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox, oy, op.width * scale, op.height * scale);
    });

    const all = [...this.fixed, ...this.items];
    this.fixed.forEach((piece) => this._drawPiece(ctx, piece, 'fixed'));
    this.items.forEach((piece) => this._drawPiece(ctx, piece, 'item'));

    // Movable objects that collide with something solid get a red outline.
    this.items.forEach((piece) => {
      const collides = all.some((o) => o !== piece && o.type !== 'glass' && piecesOverlap(piece, o));
      if (!collides) return;
      const r = this._pieceRect(piece);
      ctx.strokeStyle = '#e63946';
      ctx.lineWidth = 3;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    });

    all.forEach((piece) => this._drawLabel(ctx, piece));

    const selected = this.getSelected();
    if (selected) {
      const r = this._pieceRect(selected);
      ctx.strokeStyle = '#1d6fd8';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    }

    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 4;
    ctx.strokeRect(x0, y0, w, h);

    this._drawMeasurements(ctx);
    this._drawRuler(ctx, all);

    ctx.fillStyle = '#556';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${fmt(wall.width)} m`, x0 + w / 2, y0 - 10);
  }

  _drawMeasurements(ctx) {
    const list = this.measurements.map((m) => ({ m, selected: m.id === this.selectedMeasurementId }));
    if (this.pendingMeasurement) list.push({ m: this.pendingMeasurement, selected: true });
    list.forEach(({ m, selected }) => {
      const [a, b] = this._measurementScreenPoints(m);
      ctx.strokeStyle = selected ? '#7a0f6a' : '#b5179e';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = selected ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      [a, b].forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      const text = `${fmt(Math.hypot(m.x2 - m.x1, m.y2 - m.y1))} m`;
      ctx.font = 'bold 11px sans-serif';
      const tw = ctx.measureText(text).width + 8;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillRect(cx - tw / 2, cy - 9, tw, 18);
      ctx.strokeStyle = '#b5179e';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - tw / 2, cy - 9, tw, 18);
      ctx.fillStyle = '#7a0f6a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);
      ctx.textBaseline = 'alphabetic';
    });
  }

  _drawPiece(ctx, piece, kind) {
    const r = this._pieceRect(piece);
    if (piece.type === 'glass') {
      ctx.fillStyle = 'rgba(126, 200, 227, 0.35)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = '#2b8fb3';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([]);
      return;
    }
    ctx.fillStyle = piece.color || (kind === 'fixed' ? FIXED_COLOR : MOVABLE_COLOR);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 1.5;
    if (kind === 'fixed') ctx.setLineDash([]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  _drawLabel(ctx, piece) {
    if (!piece.label || piece.type === 'glass') return;
    const r = this._pieceRect(piece);
    // Try the name on one line, then split at its last space onto two, at
    // 11px and then 9px; skip the label if nothing fits inside the box.
    const words = piece.label.split(' ');
    const twoLines = words.length > 1 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : null;
    for (const size of [11, 9]) {
      ctx.font = `${size}px sans-serif`;
      for (const lines of [[piece.label], twoLines]) {
        if (!lines) continue;
        const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const textH = lines.length * (size + 2);
        if (textW > r.w - 4 || textH > r.h - 2) continue;
        ctx.fillStyle = '#1b1b1b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        lines.forEach((line, i) => {
          ctx.fillText(line, r.x + r.w / 2, r.y + r.h / 2 + (i - (lines.length - 1) / 2) * (size + 2));
        });
        ctx.textBaseline = 'alphabetic';
        return;
      }
    }
  }

  _drawOpenSpan(ctx, x, y, w, h, span) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#fbfbfb';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 1;
    for (let d = -h; d < w; d += 10) {
      ctx.beginPath();
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#7a7a7a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.font = 'italic 11px sans-serif';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.fillText(span.label || 'sem parede', x + w / 2, y + 14);
  }

  // Height ruler on the right: every distinct edge height, skipping labels
  // that would overlap the previous one. The selected piece's edges always
  // get a label so its exact height off the floor is readable.
  _drawRuler(ctx, all) {
    const { x0, w, floorY, scale } = this.layout;
    const round = (v) => Math.round(v * 1000) / 1000;
    const heights = new Set([0, this.wall.height]);
    all.forEach((piece) => {
      heights.add(round(piece.bottom));
      heights.add(round(piece.bottom + piece.height));
    });
    const selected = this.getSelected();
    const priority = new Set(selected ? [round(selected.bottom), round(selected.bottom + selected.height)] : []);
    const sorted = [...heights].sort((a, b) => a - b);
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    let lastY = Infinity;
    sorted.forEach((height) => {
      const y = floorY - height * scale;
      const important = priority.has(height) || height === this.wall.height || height === 0;
      if (lastY - y < 11 && !important) return;
      ctx.strokeStyle = priority.has(height) ? '#1d6fd8' : '#99a';
      ctx.fillStyle = priority.has(height) ? '#1d6fd8' : '#556';
      ctx.beginPath();
      ctx.moveTo(x0 + w + 2, y);
      ctx.lineTo(x0 + w + 8, y);
      ctx.stroke();
      ctx.fillText(fmt(height), x0 + w + 10, y);
      lastY = y;
    });
    ctx.textBaseline = 'alphabetic';
  }
}

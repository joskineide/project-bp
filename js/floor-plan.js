import {
  segmentsToPolygon,
  polygonBounds,
  pointInRotatedRect,
  pointInCircle,
  pointInLShape,
  lShapeLocalPoints,
  clampViewOffset,
  snapInterval,
  itemHalfExtents,
  pointInPolygon,
  wallSubSegments,
  closePolygon,
  insertWallVertex,
  removeWallVertex,
  distanceToSegment,
  wallBandQuad,
  walkAbsoluteSegments,
} from './geometry.js';
import {
  loadLayout,
  saveLayout,
  loadRoomLayout,
  saveRoomLayout,
  loadHouseMeasurements,
  saveHouseMeasurements,
} from './storage.js';

// Converts a #rrggbb color (as stored on items/fixed items) to an rgba()
// string at the given alpha — used to derive a glass fixed item's
// translucent fill from its own editable `color`, instead of a hardcoded
// tint. Falls back to the default glass tint if `hex` isn't a valid
// 6-digit hex color.
function hexToRgba(hex, alpha) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!match) return `rgba(126, 200, 227, ${alpha})`;
  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const GRID_STEP = 0.5; // meters
const PADDING_PX = 24;
const VERTEX_HIT_RADIUS_PX = 16;
const WALL_LINE_HIT_RADIUS_PX = 14;
const MEASUREMENT_HIT_RADIUS_PX = 14;
const MAX_UNDO_STEPS = 50;
const MIN_WALL_LENGTH = 0.1; // meters
const MIN_OPENING_WIDTH = 0.05; // meters
// Floor for a movable/fixed item's own width/height/radius — just enough
// to keep it a real, visible, non-degenerate shape, not a guess at how
// small real furniture gets. The house has fixed dividers as thin as
// 0.02m (see room-data.js's armario-divisor pieces), so this needs to
// stay below that.
const MIN_ITEM_SIZE = 0.01; // meters
const SNAP_PX = 8; // how close (on screen) an edge must get before it snaps
// Below this, the wall-drawing tool's auto-computed closing wall gets
// merged into the last drawn wall instead of added as its own tiny wall —
// see finishWallDraw.
const CLOSING_WALL_MERGE_THRESHOLD = 0.03; // meters

// Interactive whole-house canvas: draws every room together in one shared
// frame (world coordinates = a room's own local coordinates + its
// houseOffset/provisionalHouseOffset — see room-data.js), and lets the
// user add/drag/rotate/scale/delete furniture, and in admin mode edit any
// room's own walls/fixed items. There's no more "one room at a time"
// picker — whichever room you tap becomes the *focused* room, and that's
// the one structural edits (admin mode) and new furniture apply to; see
// "Multi-room" in CLAUDE.md.
export class FloorPlanView {
  // `rooms` is the full ROOMS list from room-data.js; every room must have
  // a `houseOffset` or `provisionalHouseOffset` (see room-data.js) to be
  // positioned in this shared canvas.
  constructor(canvas, rooms) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.adminMode = false;

    this.roomStates = rooms.map((room) => this._loadRoomState(room));
    this.focusedRoomId = this.roomStates.length ? this.roomStates[0].room.id : null;
    this._recomputeBounds();

    this.measurements = loadHouseMeasurements() || [];
    this.measuringMode = false;
    this.pendingMeasurement = null; // { x1, y1, x2, y2 } while dragging a new one
    this.showItemDimensions = false;
    this.snapEnabled = true;
    this.selectedId = null;
    this.selectedKind = null; // 'item' | 'fixed'
    this.selectedVertexIndex = null;
    this.selectedWallIndex = null;
    this.selectedMeasurementId = null;
    this.dragging = null;
    // Fingers currently touching the canvas (pointerId -> canvas-relative
    // position), and the active two-finger pinch, if any — see _startPinch.
    this._pointers = new Map();
    this._pinch = null;
    // Wall-drawing tool (admin mode): building a brand-new outline for the
    // focused room, wall by wall, each with its own typed length/absolute
    // direction/type, instead of dragging corners freehand or eyeballing a
    // drag-to-length edit — see "Wall-drawing tool" in CLAUDE.md.
    this.wallDrawMode = false;
    this.wallDraw = null; // { roomId, startPoint: {x,y}, segments: [{length, angle, type}] }
    this.onWallDrawChange = null; // fired whenever wallDraw changes, for the app.js panel to re-render
    // "Move whole room" tool (admin mode): drag anywhere to translate the
    // focused room's entire outline + fixed items + movable items together
    // by the same delta — for roughly placing a room, then sliding it into
    // its real position against a neighbor once that's known, without
    // dragging every corner individually. See "Wall-drawing tool" in
    // CLAUDE.md (documented alongside it, same admin-mode family).
    this.roomMoveMode = false;
    // Becomes true the first time the user manually zooms or pans — see
    // the comment in _resize() for why this matters.
    this._viewIsCustom = false;
    this.undoStack = [];
    this.redoStack = [];
    this.onSelectionChange = null;
    this.onVertexSelectionChange = null;
    this.onWallSelectionChange = null;
    this.onMeasurementSelectionChange = null;
    // Fired whenever the focused room changes (tapping a different room's
    // area), so callers can show which room new furniture/admin edits
    // would apply to.
    this.onFocusedRoomChange = null;
    // Fired after anything that pushes/pops the undo stack, so callers can
    // e.g. enable/disable a "Desfazer" button without polling.
    this.onChange = null;

    this._resize = this._resize.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);

    // Watches the canvas's own container rather than the window, so the
    // view re-fits whenever the container's actual size changes for any
    // reason — a real window resize, but just as importantly a sibling
    // panel (the edit panel, the admin wall-edit panel with its variable
    // number of opening rows, ...) showing/hiding and changing how much
    // vertical space is left for the canvas in this flex layout.
    this._resizeObserver = new ResizeObserver(this._resize);
    this._resizeObserver.observe(canvas.parentElement);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    // iOS Safari fires its own page-zoom gesture events for a pinch even
    // with touch-action: none on some versions; swallow them so only our
    // own pinch handling (see _startPinch) reacts.
    this._onGesture = (e) => e.preventDefault();
    canvas.addEventListener('gesturestart', this._onGesture);
    canvas.addEventListener('gesturechange', this._onGesture);

    this._resize();
  }

  // Detaches everything this instance attached to the shared canvas/window.
  destroy() {
    this._resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointercancel', this._onPointerUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('gesturestart', this._onGesture);
    this.canvas.removeEventListener('gesturechange', this._onGesture);
  }

  // --- Per-room state: loaded once into *world* coordinates (local +
  // offset) so every other method in this class never has to think about
  // offsets again — only persistence (_persistItems/_persistRoomState)
  // and export/import subtract them back out, since room-data.js and
  // localStorage both store each room in its own local frame. -----------

  _loadRoomState(room) {
    const offset = room.houseOffset || room.provisionalHouseOffset;
    const confirmed = Boolean(room.houseOffset);
    const defaultVertices = segmentsToPolygon(room.floorPlan.startPoint, room.floorPlan.segments).slice(0, -1);
    const savedRoom = loadRoomLayout(room.id);
    const localVertices = savedRoom ? savedRoom.vertices : defaultVertices;
    const localOpenings = savedRoom ? savedRoom.openings : room.floorPlan.openings || [];
    const localFixed = savedRoom ? savedRoom.fixedFurniture : room.fixedFurniture || [];
    const savedLayout = loadLayout(room.id);
    const localItems = savedLayout || (room.defaultItems || []);

    const state = {
      room,
      offset,
      confirmed,
      vertices: localVertices.map((v) => ({ x: v.x + offset.x, y: v.y + offset.y })),
      openings: localOpenings.map((o) => ({ ...o })),
      fixedItems: localFixed.map((f) => ({ ...f, x: f.x + offset.x, y: f.y + offset.y })),
      items: localItems.map((i) => ({ ...i, x: i.x + offset.x, y: i.y + offset.y })),
      polygon: null,
      bounds: null,
    };
    this._recomputeRoomPolygon(state);
    return state;
  }

  _recomputeRoomPolygon(state) {
    state.polygon = closePolygon(state.vertices);
    state.bounds = polygonBounds(state.polygon);
  }

  // One room ending up with non-finite bounds (NaN/Infinity — bad
  // imported JSON, a degenerate drawn shape that slipped past
  // finishWallDraw's own check, etc.) used to poison the combined bounds
  // for the *whole* shared canvas, since Math.min/max with NaN always
  // returns NaN: one broken room made every other room's zoom/scale
  // break too, with no way to fix it except editing localStorage by hand.
  // Skipping that room here instead means only its own area fails to
  // render sensibly — everything else stays usable, including admin mode
  // to select and fix (or reset) the broken room itself.
  _recomputeBounds() {
    const validStates = this.roomStates.filter((s) => {
      const b = s.bounds;
      return (
        Number.isFinite(b.minX) && Number.isFinite(b.maxX) && Number.isFinite(b.minY) && Number.isFinite(b.maxY)
      );
    });
    if (validStates.length === 0) {
      this.bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
      return;
    }
    let bounds = { ...validStates[0].bounds };
    validStates.forEach((s) => {
      bounds = {
        minX: Math.min(bounds.minX, s.bounds.minX),
        maxX: Math.max(bounds.maxX, s.bounds.maxX),
        minY: Math.min(bounds.minY, s.bounds.minY),
        maxY: Math.max(bounds.maxY, s.bounds.maxY),
      };
    });
    this.bounds = bounds;
  }

  getFocusedRoomState() {
    return this.roomStates.find((s) => s.room.id === this.focusedRoomId) || null;
  }

  getFocusedRoomId() {
    return this.focusedRoomId;
  }

  // Public wrapper so a room picker (e.g. the wall-drawing tool's panel)
  // can change focus directly, without relying on tapping that room's own
  // area on the canvas — necessary while a mode like wall-drawing
  // intercepts taps for its own purpose (setting a start point) and would
  // otherwise leave no way to switch which room a from-scratch redraw
  // targets.
  setFocusedRoom(roomId) {
    this._setFocusedRoom(roomId);
  }

  _setFocusedRoom(roomId) {
    if (this.focusedRoomId === roomId) return;
    this.focusedRoomId = roomId;
    if (this.onFocusedRoomChange) this.onFocusedRoomChange(roomId);
  }

  _persistItems(state) {
    saveLayout(
      state.room.id,
      state.items.map((i) => ({ ...i, x: i.x - state.offset.x, y: i.y - state.offset.y }))
    );
  }

  _persistRoomState(state) {
    saveRoomLayout(state.room.id, {
      vertices: state.vertices.map((v) => ({ x: v.x - state.offset.x, y: v.y - state.offset.y })),
      openings: state.openings,
      fixedFurniture: state.fixedItems.map((f) => ({ ...f, x: f.x - state.offset.x, y: f.y - state.offset.y })),
    });
  }

  _persistMeasurements() {
    saveHouseMeasurements(this.measurements);
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;

    // Only bother preserving the view across this resize if the user has
    // actually zoomed or panned — otherwise (first load, a plain container
    // resize before any interaction, or an admin-mode wall edit that moves
    // a room's bounds) always re-fit from scratch. Trying to "preserve" an
    // untouched view here is what used to send the house off-screen: the
    // canvas can shrink a lot (e.g. an admin panel opening), and
    // re-anchoring an untouched view on a very differently-sized canvas
    // doesn't land anywhere sensible.
    const worldAtCenter = this._viewIsCustom ? this.toWorld(rect.width / 2, rect.height / 2) : null;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = this.bounds.maxX - this.bounds.minX;
    const h = this.bounds.maxY - this.bounds.minY;
    const availW = rect.width - PADDING_PX * 2;
    const availH = rect.height - PADDING_PX * 2;
    // w or h can be 0 for a single-room house with a degenerate (zero
    // width/height) shape — availW/0 is Infinity, which would otherwise
    // become the *minimum* zoom level forever (stuck fully zoomed in,
    // nothing visible, no way to zoom back out). Falling back to a plain
    // default scale keeps the view usable instead.
    let fitScale = Math.max(10, Math.min(availW / w, availH / h));
    if (!Number.isFinite(fitScale) || fitScale <= 0) fitScale = 40;
    const fitOffsetX = PADDING_PX + (availW - w * fitScale) / 2 - this.bounds.minX * fitScale;
    const fitOffsetY = PADDING_PX + (availH - h * fitScale) / 2 - this.bounds.minY * fitScale;
    // Fit-to-screen is also the minimum zoom level — can't zoom out
    // further than "see the whole house".
    this.minScale = fitScale;

    if (worldAtCenter === null) {
      this.scale = fitScale;
      this.offsetX = fitOffsetX;
      this.offsetY = fitOffsetY;
    } else {
      const zoomRatio = this.scale / this._lastFitScale;
      this.scale = Math.max(this.minScale, fitScale * zoomRatio);
      this.offsetX = rect.width / 2 - worldAtCenter.x * this.scale;
      this.offsetY = rect.height / 2 - worldAtCenter.y * this.scale;
      this._clampView();
    }
    this._lastFitScale = fitScale;

    this.render();
  }

  // The "don't scroll into the void" rule: after any pan/zoom, slide the
  // view back just enough that the house always covers at least half of
  // the canvas in each direction (see clampViewOffset in geometry.js).
  _clampView() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.width / dpr;
    const cssH = this.canvas.height / dpr;
    this.offsetX = clampViewOffset(this.offsetX, this.bounds.minX, this.bounds.maxX, this.scale, cssW);
    this.offsetY = clampViewOffset(this.offsetY, this.bounds.minY, this.bounds.maxY, this.scale, cssH);
  }

  // Zooms by `factor` keeping the world point under (screenX, screenY)
  // fixed on screen. Shared by the mouse wheel, the +/- buttons, and pinch.
  _zoomAt(screenX, screenY, factor) {
    const worldBefore = this.toWorld(screenX, screenY);
    const maxScale = this.minScale * 8;
    this.scale = Math.max(this.minScale, Math.min(maxScale, this.scale * factor));
    this.offsetX = screenX - worldBefore.x * this.scale;
    this.offsetY = screenY - worldBefore.y * this.scale;
    this._viewIsCustom = true;
    this._clampView();
    this.render();
  }

  // For the on-screen +/- buttons: zoom around the middle of the canvas.
  zoomBy(factor) {
    const dpr = window.devicePixelRatio || 1;
    this._zoomAt(this.canvas.width / dpr / 2, this.canvas.height / dpr / 2, factor);
  }

  toScreen(x, y) {
    return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
  }

  toWorld(px, py) {
    return { x: (px - this.offsetX) / this.scale, y: (py - this.offsetY) / this.scale };
  }

  // Mouse-wheel zoom, anchored on the cursor position so the point under
  // the pointer stays fixed on screen as the scale changes.
  _onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this._zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.001));
  }

  // --- Admin mode -----------------------------------------------------

  setAdminMode(on) {
    this.adminMode = Boolean(on);
    if (!this.adminMode) {
      this._select(null);
      this.setWallDrawMode(false);
      this.setRoomMoveMode(false);
    }
    this.render();
  }

  // Dragging anywhere while this is on translates the *focused* room's
  // entire vertices + fixed items + movable items by the same delta —
  // mutually exclusive with wall-drawing (both want the drag gesture for
  // themselves).
  setRoomMoveMode(on) {
    this.roomMoveMode = Boolean(on);
    if (this.roomMoveMode) {
      this.setWallDrawMode(false);
      this._select(null);
    }
    this.canvas.classList.toggle('moving-room', this.roomMoveMode);
    this.render();
  }

  // --- Wall-drawing tool (admin mode) -------------------------------------
  // Builds a brand-new outline for the focused room from scratch, one wall
  // at a time: each wall is entered as its own length + absolute direction
  // (degrees, 0 = east/right, 90 = south/down, clockwise-positive — same
  // convention used everywhere else in this file) + type (normal/glass),
  // not by dragging. Because every wall's position is recomputed by
  // re-walking the full list of (length, angle) pairs from the start point
  // every time anything changes, editing one wall's length only ever moves
  // *that* wall's own far endpoint — every wall after it keeps its exact
  // direction and length, just shifted along with it (see
  // `walkAbsoluteSegments` in geometry.js). "Finishing" appends one more
  // wall back to the start point to close the shape, whatever length/angle
  // that takes — this is the one wall that absorbs any imprecision in the
  // others, exactly like every hand-measured room in this app already does
  // (see the tolerance write-ups in room-data.js).

  // Turning this on immediately starts a draw at (0,0) for whichever room
  // is focused, rather than waiting for a canvas tap — it used to require
  // that tap to land before "Adicionar parede" (or typing a start X/Y)
  // did anything, which was easy to miss (nothing visibly happens if the
  // tap doesn't register, e.g. it's swallowed by a scroll/other gesture,
  // or the user just clicks straight into the panel's own fields without
  // touching the canvas first) and left the tool looking totally
  // unresponsive with no feedback as to why. A canvas tap still works
  // afterward to move that start point wherever's actually wanted.
  setWallDrawMode(on) {
    this.wallDrawMode = Boolean(on);
    if (!this.wallDrawMode) {
      this.wallDraw = null;
      if (this.onWallDrawChange) this.onWallDrawChange(null);
      this.render();
    } else {
      this._select(null);
      this.setRoomMoveMode(false);
      this.startWallDraw({ x: 0, y: 0 }); // fires onWallDrawChange + render itself
    }
  }

  // Begins a brand-new outline for the focused room, starting at `point`
  // (world coordinates) — discards any outline already drawn (not yet
  // applied to the room, that only happens on finishWallDraw).
  startWallDraw(point) {
    if (!this.focusedRoomId) return;
    this.wallDraw = { roomId: this.focusedRoomId, startPoint: { x: point.x, y: point.y }, segments: [] };
    if (this.onWallDrawChange) this.onWallDrawChange(this.getWallDrawState());
    this.render();
  }

  setWallDrawStartPoint(x, y) {
    if (!this.wallDraw) return;
    this.wallDraw.startPoint = { x, y };
    if (this.onWallDrawChange) this.onWallDrawChange(this.getWallDrawState());
    this.render();
  }

  // `type` is 'normal' or 'glass'. New segments default to continuing
  // straight on from the previous one (or due east for the first wall) —
  // the caller (app.js) only needs to override what the user actually
  // changes.
  addWallDrawSegment({ length, angle, type } = {}) {
    if (!this.wallDraw) return;
    const prev = this.wallDraw.segments[this.wallDraw.segments.length - 1];
    this.wallDraw.segments.push({
      length: Math.max(MIN_WALL_LENGTH, length ?? 1),
      angle: ((angle ?? (prev ? prev.angle : 0)) + 360) % 360,
      type: type === 'glass' ? 'glass' : 'normal',
    });
    if (this.onWallDrawChange) this.onWallDrawChange(this.getWallDrawState());
    this.render();
  }

  updateWallDrawSegment(index, patch) {
    if (!this.wallDraw || !this.wallDraw.segments[index]) return;
    const seg = this.wallDraw.segments[index];
    if (patch.length !== undefined) seg.length = Math.max(MIN_WALL_LENGTH, patch.length);
    if (patch.angle !== undefined) seg.angle = ((patch.angle % 360) + 360) % 360;
    if (patch.type !== undefined) seg.type = patch.type === 'glass' ? 'glass' : 'normal';
    if (this.onWallDrawChange) this.onWallDrawChange(this.getWallDrawState());
    this.render();
  }

  removeWallDrawSegment(index) {
    if (!this.wallDraw) return;
    this.wallDraw.segments.splice(index, 1);
    if (this.onWallDrawChange) this.onWallDrawChange(this.getWallDrawState());
    this.render();
  }

  cancelWallDraw() {
    this.wallDraw = null;
    if (this.onWallDrawChange) this.onWallDrawChange(this.getWallDrawState());
    this.render();
  }

  // Current in-progress state for the UI panel: the walked points so far,
  // and — once there are at least 2 walls — a preview of the closing wall
  // that finishing would add right now, so the user can sanity-check it
  // (a wildly-off closing length/angle is the same "something doesn't
  // add up" signal this app has surfaced by hand throughout room-data.js).
  getWallDrawState() {
    if (!this.wallDraw) return null;
    const points = walkAbsoluteSegments(this.wallDraw.startPoint, this.wallDraw.segments);
    let closingPreview = null;
    if (this.wallDraw.segments.length >= 2) {
      const last = points[points.length - 1];
      const start = points[0];
      const dx = start.x - last.x;
      const dy = start.y - last.y;
      closingPreview = {
        length: Math.hypot(dx, dy),
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      };
    }
    return {
      roomId: this.wallDraw.roomId,
      startPoint: this.wallDraw.startPoint,
      segments: this.wallDraw.segments,
      points,
      closingPreview,
    };
  }

  // Applies the drawn outline to its room, replacing that room's walls and
  // openings entirely — this is a from-scratch redraw, not a patch, so
  // callers should confirm with the user before calling it. Requires at
  // least 2 walls drawn (plus the auto-added closing wall, that's a
  // minimum 3-sided room — unless the closing wall gets merged away, see
  // below, in which case 2 drawn walls alone would leave a degenerate
  // 2-sided room; MIN_WALL_LENGTH-scale drawings are edge cases the user
  // isn't going to hit in practice). Glass walls become a full-length
  // 'glass' opening on their own wall index — reuses the existing
  // opening-rendering path instead of inventing a separate "wall type"
  // field.
  finishWallDraw() {
    if (!this.wallDraw || this.wallDraw.segments.length < 2) return null;
    const state = this.roomStates.find((s) => s.room.id === this.wallDraw.roomId);
    if (!state) return null;

    const drawn = this.wallDraw.segments;
    const points = walkAbsoluteSegments(this.wallDraw.startPoint, drawn);
    const start = points[0];
    const last = points[points.length - 1];
    const dx = start.x - last.x;
    const dy = start.y - last.y;
    const closingLength = Math.hypot(dx, dy);
    // A gap this small is rounding in the user's own typed lengths, not a
    // real wall — closing directly onto the start point (dropping the
    // last walked point instead of adding a new one) snaps the last drawn
    // wall's far end onto the start, the same way `setSelectedWallLength`
    // lets one wall silently absorb this kind of slack elsewhere. Without
    // this, finishing would leave a near-invisible sliver wall that the
    // user has to notice and delete by hand every time (see PROGRESS.md).
    const merged = closingLength < CLOSING_WALL_MERGE_THRESHOLD;
    const closingSegment = merged
      ? null
      : { length: closingLength, angle: (Math.atan2(dy, dx) * 180) / Math.PI, type: 'normal' };
    const allSegments = merged ? drawn : [...drawn, closingSegment];
    const finalPoints = walkAbsoluteSegments(this.wallDraw.startPoint, allSegments).slice(0, -1);

    // Refuse to apply a result that isn't a real, finite, non-degenerate
    // polygon — a bad value slipping in here would otherwise get baked
    // into the room's actual saved shape (not just this in-progress draw),
    // which is a much harder mess to recover from than just trying again.
    const bounds = polygonBounds(finalPoints);
    const isFinitePoint = (p) => Number.isFinite(p.x) && Number.isFinite(p.y);
    const degenerate =
      !finalPoints.every(isFinitePoint) ||
      !Number.isFinite(bounds.maxX - bounds.minX) ||
      !Number.isFinite(bounds.maxY - bounds.minY) ||
      // Either dimension near-zero means either every point collapsed to
      // one spot, or every wall ended up collinear (a "flat" room, e.g.
      // from an angle typo) — neither is a real room, even though the
      // flat case alone wouldn't have caused the Infinity-zoom bug above.
      bounds.maxX - bounds.minX < MIN_WALL_LENGTH ||
      bounds.maxY - bounds.minY < MIN_WALL_LENGTH;
    if (degenerate) {
      return { error: 'degenerate' };
    }

    this._pushUndo();
    state.vertices = finalPoints;
    state.openings = allSegments
      .map((seg, i) => (seg.type === 'glass' ? { wall: i, offset: 0, width: seg.length, type: 'glass' } : null))
      .filter(Boolean);
    this._recomputeRoomPolygon(state);
    this._recomputeBounds();
    this._select(null);
    this._selectVertex(null);
    this._persistRoomState(state);
    this._resize();
    // Immediately ready for another wall (or another room, via the
    // panel's dropdown) instead of leaving the tool in a blank "no draw
    // active" state — without this, "Adicionar parede" would silently do
    // nothing again right after finishing, the same trap as before a
    // start point was ever placed.
    this.startWallDraw({ x: 0, y: 0 });
    return { closingSegment, merged };
  }

  // `shape` is 'rect' (default) or 'L' — an L-shaped locked space is the
  // same one-rectangle-minus-a-corner idea as the movable L furniture
  // (see "Furniture shapes" in CLAUDE.md), just as a fixed/locked item
  // instead of something the family member can drag around.
  addFixedItem(type = 'furniture', shape = 'rect') {
    const state = this.getFocusedRoomState();
    if (!state) return null;
    this._pushUndo();
    const center = {
      x: (state.bounds.minX + state.bounds.maxX) / 2,
      y: (state.bounds.minY + state.bounds.maxY) / 2,
    };
    const labels = { wall: 'Elemento de parede', glass: 'Divisor de vidro', furniture: 'Espaço travado' };
    const colors = { wall: '#555555', glass: '#7ec8e3', furniture: '#8fb3c9' };
    const item = {
      id: `fixo-${Date.now()}`,
      label: shape === 'L' ? `${labels[type] || labels.furniture} (L)` : labels[type] || labels.furniture,
      type,
      shape,
      x: center.x,
      y: center.y,
      width: shape === 'L' ? 1.2 : 0.6,
      height: shape === 'L' ? 1.2 : 0.6,
      rotation: 0,
      color: colors[type] || colors.furniture,
    };
    if (shape === 'L') {
      item.notchWidth = 0.6;
      item.notchHeight = 0.6;
    }
    state.fixedItems.push(item);
    this._select(item.id, 'fixed');
    this._persistRoomState(state);
    this.render();
    return item;
  }

  removeSelectedVertex() {
    const state = this.getFocusedRoomState();
    if (!state || this.selectedVertexIndex === null) return;
    const result = removeWallVertex(state.vertices, state.openings, this.selectedVertexIndex);
    if (!result) {
      window.alert('Um ambiente precisa de pelo menos 3 paredes.');
      return;
    }
    this._pushUndo();
    state.vertices = result.vertices;
    state.openings = result.openings;
    this._recomputeRoomPolygon(state);
    this._recomputeBounds();
    this._selectVertex(null);
    this._persistRoomState(state);
    this._resize();
  }

  // --- Selected-wall editing (length + openings), on the focused room ----

  _wallVertices(state, wallIndex) {
    return [state.vertices[wallIndex], state.vertices[(wallIndex + 1) % state.vertices.length]];
  }

  _wallLength(state, wallIndex) {
    const [a, b] = this._wallVertices(state, wallIndex);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  getSelectedWallInfo() {
    const state = this.getFocusedRoomState();
    if (!state || this.selectedWallIndex === null) return null;
    return { index: this.selectedWallIndex, length: this._wallLength(state, this.selectedWallIndex) };
  }

  getSelectedWallOpenings() {
    const state = this.getFocusedRoomState();
    if (!state || this.selectedWallIndex === null) return [];
    return state.openings.filter((o) => o.wall === this.selectedWallIndex);
  }

  // Typing a new length keeps wall `i`'s own direction fixed (as before),
  // but now also slides every vertex *after* it (all the way around, up to
  // but not including this wall's own start point) by the same delta —
  // instead of just moving the one shared corner, which used to distort
  // every wall downstream (each keeping its old far endpoint fixed while
  // its near endpoint moved out from under it, changing its own length
  // *and* direction along the way). Now only one wall changes besides the
  // edited one: the wall that closes the loop back into this one's start
  // point, which necessarily absorbs whatever length this edit added or
  // removed — same "one wall absorbs the difference" tolerance the user's
  // own hand measurements use elsewhere (see room-data.js).
  setSelectedWallLength(newLength) {
    const state = this.getFocusedRoomState();
    if (!state || this.selectedWallIndex === null) return;
    const i = this.selectedWallIndex;
    const [a] = this._wallVertices(state, i);
    const currentLength = this._wallLength(state, i);
    if (currentLength === 0) return;
    const bIndex = (i + 1) % state.vertices.length;
    const b = state.vertices[bIndex];
    const ux = (b.x - a.x) / currentLength;
    const uy = (b.y - a.y) / currentLength;
    const length = Math.max(MIN_WALL_LENGTH, newLength);
    const newB = { x: a.x + ux * length, y: a.y + uy * length };
    const dx = newB.x - b.x;
    const dy = newB.y - b.y;

    this._pushUndo();
    state.vertices.forEach((v, idx) => {
      if (idx === i) return; // this wall's own start point stays put
      v.x += dx;
      v.y += dy;
    });
    state.openings.forEach((o) => {
      if (o.wall !== i) return;
      o.offset = Math.max(0, Math.min(o.offset, length));
      o.width = Math.max(MIN_OPENING_WIDTH, Math.min(o.width, length - o.offset));
    });
    this._recomputeRoomPolygon(state);
    this._recomputeBounds();
    this._persistRoomState(state);
    this._resize();
  }

  insertVertexOnSelectedWall() {
    const state = this.getFocusedRoomState();
    if (!state || this.selectedWallIndex === null) return;
    this._pushUndo();
    const result = insertWallVertex(state.vertices, state.openings, this.selectedWallIndex);
    state.vertices = result.vertices;
    state.openings = result.openings;
    this._recomputeRoomPolygon(state);
    this._recomputeBounds();
    this._selectVertex(result.newVertexIndex);
    this._persistRoomState(state);
    this._resize();
  }

  addOpeningToSelectedWall(type = 'open') {
    const state = this.getFocusedRoomState();
    if (!state || this.selectedWallIndex === null) return;
    this._pushUndo();
    const wallLength = this._wallLength(state, this.selectedWallIndex);
    const width = Math.max(MIN_OPENING_WIDTH, Math.min(0.8, wallLength));
    state.openings.push({ wall: this.selectedWallIndex, offset: 0, width, type });
    this._persistRoomState(state);
    this.render();
  }

  updateOpening(opening, patch) {
    const state = this.getFocusedRoomState();
    if (!state) return;
    const idx = state.openings.indexOf(opening);
    if (idx === -1) return;
    this._pushUndo();
    Object.assign(state.openings[idx], patch);
    const wallLength = this._wallLength(state, state.openings[idx].wall);
    state.openings[idx].offset = Math.max(0, Math.min(state.openings[idx].offset, wallLength));
    state.openings[idx].width = Math.max(
      MIN_OPENING_WIDTH,
      Math.min(state.openings[idx].width, wallLength - state.openings[idx].offset)
    );
    this._persistRoomState(state);
    this.render();
  }

  removeOpening(opening) {
    const state = this.getFocusedRoomState();
    if (!state) return;
    const idx = state.openings.indexOf(opening);
    if (idx === -1) return;
    this._pushUndo();
    state.openings.splice(idx, 1);
    this._persistRoomState(state);
    this.render();
  }

  // --- Room export/import/reset (focused room, local coordinates) -------

  exportFocusedRoom() {
    const state = this.getFocusedRoomState();
    if (!state) return null;
    return {
      roomId: state.room.id,
      vertices: state.vertices.map((v) => ({ x: v.x - state.offset.x, y: v.y - state.offset.y })),
      openings: state.openings.map((o) => ({ ...o })),
      fixedFurniture: state.fixedItems.map((f) => ({ ...f, x: f.x - state.offset.x, y: f.y - state.offset.y })),
    };
  }

  // `data` is the shape produced by exportFocusedRoom (local coordinates).
  // Applies to the room named by `data.roomId`, falling back to the
  // focused room if that id isn't found (e.g. an older export).
  replaceRoom(data) {
    const state = this.roomStates.find((s) => s.room.id === data.roomId) || this.getFocusedRoomState();
    if (!state) return;
    this._pushUndo();
    state.vertices = data.vertices.map((v) => ({ x: v.x + state.offset.x, y: v.y + state.offset.y }));
    state.openings = data.openings.map((o) => ({ ...o }));
    state.fixedItems = data.fixedFurniture.map((f) => ({ ...f, x: f.x + state.offset.x, y: f.y + state.offset.y }));
    this._recomputeRoomPolygon(state);
    this._recomputeBounds();
    this._select(null);
    this._selectVertex(null);
    this._persistRoomState(state);
    this._resize();
  }

  // Every room's full state (walls/openings/fixed furniture *and*
  // movable items) in one file, each room in its own local coordinates —
  // for handing the whole house's data over at once instead of clicking
  // "Exportar sala"/"Exportar layout" separately for every room. This is
  // the export to use for transcribing everything into `room-data.js` in
  // one go.
  exportAllRooms() {
    return {
      rooms: this.roomStates.map((state) => ({
        roomId: state.room.id,
        vertices: state.vertices.map((v) => ({ x: v.x - state.offset.x, y: v.y - state.offset.y })),
        openings: state.openings.map((o) => ({ ...o })),
        fixedFurniture: state.fixedItems.map((f) => ({ ...f, x: f.x - state.offset.x, y: f.y - state.offset.y })),
        items: state.items.map((i) => ({ ...i, x: i.x - state.offset.x, y: i.y - state.offset.y })),
      })),
    };
  }

  // `data` is the shape produced by exportAllRooms. Applies each entry to
  // the room matching its `roomId`, skipping any id that isn't in `ROOMS`
  // (e.g. a room renamed/removed since the export was made) rather than
  // failing the whole import.
  replaceAllRooms(data) {
    if (!data || !Array.isArray(data.rooms)) return;
    this._pushUndo();
    data.rooms.forEach((roomData) => {
      const state = this.roomStates.find((s) => s.room.id === roomData.roomId);
      if (!state) return;
      state.vertices = roomData.vertices.map((v) => ({ x: v.x + state.offset.x, y: v.y + state.offset.y }));
      state.openings = roomData.openings.map((o) => ({ ...o }));
      state.fixedItems = roomData.fixedFurniture.map((f) => ({ ...f, x: f.x + state.offset.x, y: f.y + state.offset.y }));
      state.items = roomData.items.map((i) => ({ ...i, x: i.x + state.offset.x, y: i.y + state.offset.y }));
      this._recomputeRoomPolygon(state);
      this._persistRoomState(state);
      this._persistItems(state);
    });
    this._recomputeBounds();
    this._select(null);
    this._selectVertex(null);
    this._resize();
  }

  // Discards any saved admin-mode override for the focused room and
  // reloads its walls/openings/fixed items straight from room-data.js —
  // a saved override always wins over fresh data-file edits (see
  // _loadRoomState), so after correcting room-data.js this is the way to
  // actually see that correction without manually clearing localStorage.
  resetFocusedRoomToDefault() {
    const state = this.getFocusedRoomState();
    if (!state) return;
    const defaultVertices = segmentsToPolygon(state.room.floorPlan.startPoint, state.room.floorPlan.segments).slice(
      0,
      -1
    );
    this.replaceRoom({
      roomId: state.room.id,
      vertices: defaultVertices,
      openings: state.room.floorPlan.openings || [],
      fixedFurniture: state.room.fixedFurniture || [],
    });
  }

  // --- Undo ---------------------------------------------------------------

  _snapshot() {
    return JSON.stringify({
      rooms: this.roomStates.map((s) => ({
        id: s.room.id,
        vertices: s.vertices,
        openings: s.openings,
        fixedItems: s.fixedItems,
        items: s.items,
      })),
      measurements: this.measurements,
    });
  }

  // Called before every new change; a new change makes whatever was undone
  // unreachable, so it also empties the redo stack.
  _pushUndo() {
    this.undoStack.push(this._snapshot());
    if (this.undoStack.length > MAX_UNDO_STEPS) this.undoStack.shift();
    this.redoStack = [];
    if (this.onChange) this.onChange();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return;
    this.redoStack.push(this._snapshot());
    this._restoreSnapshot(snapshot);
  }

  redo() {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return;
    this.undoStack.push(this._snapshot());
    this._restoreSnapshot(snapshot);
  }

  _restoreSnapshot(snapshot) {
    const saved = JSON.parse(snapshot);
    saved.rooms.forEach((r) => {
      const state = this.roomStates.find((s) => s.room.id === r.id);
      if (!state) return;
      state.vertices = r.vertices;
      state.openings = r.openings;
      state.fixedItems = r.fixedItems;
      state.items = r.items;
      this._recomputeRoomPolygon(state);
      this._persistRoomState(state);
      this._persistItems(state);
    });
    this.measurements = saved.measurements || [];
    this._persistMeasurements();
    this._recomputeBounds();
    this._select(null);
    this._selectVertex(null);
    this._resize();
    if (this.onChange) this.onChange();
  }

  // --- Movable/fixed item editing (shared), on the focused room ----------

  addItem(catalogItem, overrides = {}) {
    const state = this.getFocusedRoomState();
    if (!state) return null;
    this._pushUndo();
    const center = {
      x: (state.bounds.minX + state.bounds.maxX) / 2,
      y: (state.bounds.minY + state.bounds.maxY) / 2,
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
      notchWidth: catalogItem.notchWidth,
      notchHeight: catalogItem.notchHeight,
      ...overrides,
    };
    state.items.push(item);
    this._select(item.id, 'item');
    this._persistItems(state);
    this.render();
    return item;
  }

  removeSelected() {
    const state = this.getFocusedRoomState();
    if (!state || !this.selectedId) return;
    this._pushUndo();
    if (this.selectedKind === 'fixed') {
      state.fixedItems = state.fixedItems.filter((i) => i.id !== this.selectedId);
      this._persistRoomState(state);
    } else {
      state.items = state.items.filter((i) => i.id !== this.selectedId);
      this._persistItems(state);
    }
    this._select(null);
    this.render();
  }

  rotateSelected(delta) {
    const item = this._getSelected();
    if (!item) return;
    this._pushUndo();
    item.rotation = (item.rotation + delta + 360) % 360;
    this._afterMutateSelected();
  }

  scaleSelected(factor) {
    const item = this._getSelected();
    if (!item) return;
    this._pushUndo();
    if (item.shape === 'circle') {
      item.radius = Math.max(MIN_ITEM_SIZE, item.radius * factor);
    } else {
      item.width = Math.max(MIN_ITEM_SIZE, item.width * factor);
      item.height = Math.max(MIN_ITEM_SIZE, item.height * factor);
      // Scale the notch right along with the rest of an L-shape, so the
      // +/- buttons keep its proportions instead of the notch staying a
      // fixed size while the rest of the piece grows/shrinks around it.
      if (item.shape === 'L') {
        item.notchWidth = Math.max(0, item.notchWidth * factor);
        item.notchHeight = Math.max(0, item.notchHeight * factor);
      }
    }
    this._afterMutateSelected();
  }

  clearAll() {
    const state = this.getFocusedRoomState();
    if (!state) return;
    this._pushUndo();
    state.items = [];
    this._select(null);
    this._persistItems(state);
    this.render();
  }

  // Public accessor so callers (e.g. the numeric edit panel in app.js) can
  // read the selected item without reaching into "private" state.
  getSelectedItem() {
    return this._getSelected();
  }

  getSelectedKind() {
    return this.selectedKind;
  }

  updateSelectedItem(patch) {
    const item = this._getSelected();
    if (!item) return;
    this._pushUndo();
    Object.assign(item, patch);
    this._afterMutateSelected();
  }

  _afterMutateSelected() {
    const state = this.getFocusedRoomState();
    if (!state) return;
    if (this.selectedKind === 'fixed') this._persistRoomState(state);
    else this._persistItems(state);
    this.render();
  }

  _selectedArray() {
    const state = this.getFocusedRoomState();
    if (!state) return [];
    return this.selectedKind === 'fixed' ? state.fixedItems : state.items;
  }

  _getSelected() {
    if (!this.selectedId) return null;
    return this._selectedArray().find((i) => i.id === this.selectedId) || null;
  }

  _select(id, kind = 'item') {
    this.selectedId = id;
    this.selectedKind = id ? kind : null;
    this.selectedVertexIndex = null;
    this.selectedWallIndex = null;
    this.selectedMeasurementId = null;
    if (this.onSelectionChange) this.onSelectionChange(this._getSelected(), this.selectedKind);
    if (this.onVertexSelectionChange) this.onVertexSelectionChange(null);
    if (this.onWallSelectionChange) this.onWallSelectionChange(null);
    if (this.onMeasurementSelectionChange) this.onMeasurementSelectionChange(null);
  }

  _selectVertex(index) {
    this.selectedVertexIndex = index;
    this.selectedWallIndex = null;
    this.selectedMeasurementId = null;
    this.selectedId = null;
    this.selectedKind = null;
    if (this.onSelectionChange) this.onSelectionChange(null, null);
    if (this.onVertexSelectionChange) this.onVertexSelectionChange(index);
    if (this.onWallSelectionChange) this.onWallSelectionChange(null);
    if (this.onMeasurementSelectionChange) this.onMeasurementSelectionChange(null);
  }

  _selectWall(index) {
    this.selectedWallIndex = index;
    this.selectedVertexIndex = null;
    this.selectedMeasurementId = null;
    this.selectedId = null;
    this.selectedKind = null;
    if (this.onSelectionChange) this.onSelectionChange(null, null);
    if (this.onVertexSelectionChange) this.onVertexSelectionChange(null);
    if (this.onWallSelectionChange) this.onWallSelectionChange(index);
    if (this.onMeasurementSelectionChange) this.onMeasurementSelectionChange(null);
  }

  _selectMeasurement(id) {
    this.selectedMeasurementId = id;
    this.selectedVertexIndex = null;
    this.selectedWallIndex = null;
    this.selectedId = null;
    this.selectedKind = null;
    if (this.onSelectionChange) this.onSelectionChange(null, null);
    if (this.onVertexSelectionChange) this.onVertexSelectionChange(null);
    if (this.onWallSelectionChange) this.onWallSelectionChange(null);
    if (this.onMeasurementSelectionChange) this.onMeasurementSelectionChange(id);
  }

  // --- Measurements (free-standing dimension notes, global) --------------

  setMeasuringMode(on) {
    this.measuringMode = Boolean(on);
    this.pendingMeasurement = null;
    if (this.measuringMode) this._select(null);
    this.canvas.classList.toggle('measuring', this.measuringMode);
    this.render();
  }

  setSnapEnabled(on) {
    this.snapEnabled = Boolean(on);
  }

  // Nudges a dragged item so its bounding-box edges land exactly on a nearby
  // wall line (any room's corner x/y) or another item's edge — makes "flush
  // against the wall / against the sofa" a drag away instead of nudging by
  // hand. Only used while dragging, so typed X/Y are never altered.
  _snapItem(item) {
    const { halfW, halfH } = itemHalfExtents(item);
    const xs = [];
    const ys = [];
    this.roomStates.forEach((state) => {
      state.vertices.forEach((v) => {
        xs.push(v.x);
        ys.push(v.y);
      });
      [...state.fixedItems, ...state.items].forEach((other) => {
        if (other === item) return;
        const half = itemHalfExtents(other);
        xs.push(other.x - half.halfW, other.x + half.halfW);
        ys.push(other.y - half.halfH, other.y + half.halfH);
      });
    });
    const threshold = SNAP_PX / this.scale;
    item.x += snapInterval(item.x - halfW, item.x + halfW, xs, threshold);
    item.y += snapInterval(item.y - halfH, item.y + halfH, ys, threshold);
  }

  setShowItemDimensions(on) {
    this.showItemDimensions = Boolean(on);
    this.render();
  }

  getSelectedMeasurement() {
    if (!this.selectedMeasurementId) return null;
    return this.measurements.find((m) => m.id === this.selectedMeasurementId) || null;
  }

  updateSelectedMeasurement(patch) {
    const m = this.getSelectedMeasurement();
    if (!m) return;
    this._pushUndo();
    Object.assign(m, patch);
    this._persistMeasurements();
    this.render();
  }

  removeSelectedMeasurement() {
    const m = this.getSelectedMeasurement();
    if (!m) return;
    this._pushUndo();
    this.measurements = this.measurements.filter((x) => x.id !== m.id);
    this._selectMeasurement(null);
    this._persistMeasurements();
    this.render();
  }

  _hitTestMeasurement(screenX, screenY) {
    for (let i = this.measurements.length - 1; i >= 0; i -= 1) {
      const m = this.measurements[i];
      const a = this.toScreen(m.x1, m.y1);
      const b = this.toScreen(m.x2, m.y2);
      if (distanceToSegment(screenX, screenY, a, b) <= MEASUREMENT_HIT_RADIUS_PX) return m;
    }
    return null;
  }

  // --- Hit-testing (per room state) ---------------------------------------

  _hitTest(state, worldX, worldY) {
    for (let i = state.items.length - 1; i >= 0; i -= 1) {
      const item = state.items[i];
      if (item.shape === 'circle') {
        if (pointInCircle(worldX, worldY, item)) return item;
      } else if (item.shape === 'L') {
        if (pointInLShape(worldX, worldY, item)) return item;
      } else if (pointInRotatedRect(worldX, worldY, item)) {
        return item;
      }
    }
    return null;
  }

  _hitTestFixed(state, worldX, worldY) {
    for (let i = state.fixedItems.length - 1; i >= 0; i -= 1) {
      const item = state.fixedItems[i];
      if (item.shape === 'L') {
        if (pointInLShape(worldX, worldY, item)) return item;
      } else if (pointInRotatedRect(worldX, worldY, item)) {
        return item;
      }
    }
    return null;
  }

  _hitTestVertex(state, screenX, screenY) {
    for (let i = 0; i < state.vertices.length; i += 1) {
      const s = this.toScreen(state.vertices[i].x, state.vertices[i].y);
      if (Math.hypot(s.x - screenX, s.y - screenY) <= VERTEX_HIT_RADIUS_PX) return i;
    }
    return null;
  }

  // Returns the wall index whose line was tapped (for selecting it to edit
  // its exact length and openings), or null.
  _hitTestWallLine(state, screenX, screenY) {
    for (let i = 0; i < state.vertices.length; i += 1) {
      const a = this.toScreen(state.vertices[i].x, state.vertices[i].y);
      const bVertex = state.vertices[(i + 1) % state.vertices.length];
      const b = this.toScreen(bVertex.x, bVertex.y);
      if (distanceToSegment(screenX, screenY, a, b) <= WALL_LINE_HIT_RADIUS_PX) return i;
    }
    return null;
  }

  // --- Pointer handling ----------------------------------------------------

  _onPointerDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Track every finger on the canvas; a second one turns this gesture
    // into a pinch (see _startPinch) instead of whatever the first started.
    // Touch only: a mouse can't pinch, and a mouse released outside the
    // canvas (no pointerup here) would otherwise leave a stale entry that
    // makes the next click look like a two-finger gesture.
    if (e.pointerType === 'touch') {
      this._pointers.set(e.pointerId, { x: screenX, y: screenY });
      if (this._pointers.size >= 2) {
        this._startPinch();
        return;
      }
    }
    const world = this.toWorld(screenX, screenY);

    if (this.measuringMode) {
      this.dragging = { kind: 'measuring', x1: world.x, y1: world.y };
      this.pendingMeasurement = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
      this.canvas.setPointerCapture(e.pointerId);
      this.render();
      return;
    }

    // A tap only ever sets/moves the *start* point — once at least one wall
    // is drawn, further walls come from the panel's typed length/direction
    // fields, not more taps (that would just reintroduce the "click where
    // you think the corner is" imprecision this tool exists to avoid).
    if (this.wallDrawMode) {
      if (!this.wallDraw) this.startWallDraw(world);
      else if (this.wallDraw.segments.length === 0) this.setWallDrawStartPoint(world.x, world.y);
      return;
    }

    // Drag anywhere (not just on the room itself) to slide the *focused*
    // room's whole outline + fixed items + movable items together — the
    // whole point is a rough draw-then-nudge-into-place workflow, so it
    // shouldn't matter exactly where the drag starts.
    if (this.roomMoveMode) {
      const state = this.getFocusedRoomState();
      if (!state) return;
      this.dragging = {
        kind: 'room',
        roomId: state.room.id,
        startWorld: world,
        startVertices: state.vertices.map((v) => ({ x: v.x, y: v.y })),
        startFixed: state.fixedItems.map((f) => ({ x: f.x, y: f.y })),
        startItems: state.items.map((it) => ({ x: it.x, y: it.y })),
        pushed: false,
      };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (this.adminMode) {
      for (const state of this.roomStates) {
        const vertexIndex = this._hitTestVertex(state, screenX, screenY);
        if (vertexIndex !== null) {
          this._setFocusedRoom(state.room.id);
          this._selectVertex(vertexIndex);
          this.dragging = { kind: 'vertex', roomId: state.room.id, index: vertexIndex, pushed: false };
          this.canvas.setPointerCapture(e.pointerId);
          this.render();
          return;
        }
      }
      for (const state of this.roomStates) {
        const wallIndex = this._hitTestWallLine(state, screenX, screenY);
        if (wallIndex !== null) {
          this._setFocusedRoom(state.room.id);
          this._selectWall(wallIndex);
          this.render();
          return;
        }
      }
      for (const state of this.roomStates) {
        const fixedHit = this._hitTestFixed(state, world.x, world.y);
        if (fixedHit) {
          this._setFocusedRoom(state.room.id);
          this._select(fixedHit.id, 'fixed');
          this.dragging = {
            kind: 'entity',
            roomId: state.room.id,
            id: fixedHit.id,
            offsetX: world.x - fixedHit.x,
            offsetY: world.y - fixedHit.y,
            pushed: false,
          };
          this.canvas.setPointerCapture(e.pointerId);
          this.render();
          return;
        }
      }
    }

    for (const state of this.roomStates) {
      const hit = this._hitTest(state, world.x, world.y);
      if (hit) {
        this._setFocusedRoom(state.room.id);
        this._select(hit.id, 'item');
        this.dragging = {
          kind: 'entity',
          roomId: state.room.id,
          id: hit.id,
          offsetX: world.x - hit.x,
          offsetY: world.y - hit.y,
          pushed: false,
        };
        this.canvas.setPointerCapture(e.pointerId);
        this.render();
        return;
      }
    }

    const measurementHit = this._hitTestMeasurement(screenX, screenY);
    if (measurementHit) {
      this._selectMeasurement(measurementHit.id);
      this.render();
      return;
    }

    // Nothing hit — if the tap landed inside some room's own area, make
    // that the focused room (so "add furniture"/admin actions target it)
    // without selecting anything in it. Either way, grab the background
    // and pan the whole view, like physically sliding the paper around.
    const insideRoom = this.roomStates.find((s) => pointInPolygon(world.x, world.y, s.polygon));
    if (insideRoom) this._setFocusedRoom(insideRoom.room.id);
    this._select(null);
    this.dragging = {
      kind: 'pan',
      startScreenX: screenX,
      startScreenY: screenY,
      startOffsetX: this.offsetX,
      startOffsetY: this.offsetY,
    };
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.classList.add('panning');
    this.render();
  }

  _onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    if (this._pointers.has(e.pointerId)) {
      this._pointers.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (this._pinch) {
      if (this._pointers.size >= 2) this._updatePinch();
      return;
    }
    if (!this.dragging) return;

    if (this.dragging.kind === 'pan') {
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      this.offsetX = this.dragging.startOffsetX + (screenX - this.dragging.startScreenX);
      this.offsetY = this.dragging.startOffsetY + (screenY - this.dragging.startScreenY);
      this._viewIsCustom = true;
      this._clampView();
      this.render();
      return;
    }

    if (this.dragging.kind === 'measuring') {
      const world = this.toWorld(e.clientX - rect.left, e.clientY - rect.top);
      this.pendingMeasurement = { x1: this.dragging.x1, y1: this.dragging.y1, x2: world.x, y2: world.y };
      this.render();
      return;
    }

    if (!this.dragging.pushed) {
      this._pushUndo();
      this.dragging.pushed = true;
    }
    const world = this.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const state = this.roomStates.find((s) => s.room.id === this.dragging.roomId);
    if (!state) return;

    if (this.dragging.kind === 'vertex') {
      const v = state.vertices[this.dragging.index];
      v.x = world.x;
      v.y = world.y;
      this._recomputeRoomPolygon(state);
      this._recomputeBounds();
      this._resize();
      return;
    }

    if (this.dragging.kind === 'room') {
      const dx = world.x - this.dragging.startWorld.x;
      const dy = world.y - this.dragging.startWorld.y;
      state.vertices.forEach((v, i) => {
        v.x = this.dragging.startVertices[i].x + dx;
        v.y = this.dragging.startVertices[i].y + dy;
      });
      state.fixedItems.forEach((f, i) => {
        f.x = this.dragging.startFixed[i].x + dx;
        f.y = this.dragging.startFixed[i].y + dy;
      });
      state.items.forEach((it, i) => {
        it.x = this.dragging.startItems[i].x + dx;
        it.y = this.dragging.startItems[i].y + dy;
      });
      this._recomputeRoomPolygon(state);
      this._recomputeBounds();
      this._resize();
      return;
    }

    const array = this.selectedKind === 'fixed' ? state.fixedItems : state.items;
    const item = array.find((i) => i.id === this.dragging.id);
    if (!item) return;
    item.x = world.x - this.dragging.offsetX;
    item.y = world.y - this.dragging.offsetY;
    if (this.snapEnabled) this._snapItem(item);
    this.render();
  }

  _onPointerUp(e) {
    this._pointers.delete(e.pointerId);
    if (this._pinch) {
      // Whichever finger lifts first ends the pinch; the remaining finger
      // does nothing until it lifts too (no `dragging` is active), so a
      // pinch never turns into an accidental one-finger pan/drag.
      if (this._pointers.size < 2) this._pinch = null;
      return;
    }
    this._endDrag(true);
  }

  // Two fingers down: cancel whatever the first finger had started (a
  // furniture drag, a pan, a half-drawn measurement) and switch to
  // pinch-zoom + two-finger-pan. Zoom is anchored on the point between the
  // fingers, and that same point follows the fingers' midpoint, so pinching
  // and dragging both fingers at once zooms and pans together.
  _startPinch() {
    this._endDrag(false);
    const [a, b] = [...this._pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this._pinch = {
      startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      startScale: this.scale,
      worldMid: this.toWorld(mid.x, mid.y),
    };
  }

  _updatePinch() {
    const [a, b] = [...this._pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const maxScale = this.minScale * 8;
    this.scale = Math.max(this.minScale, Math.min(maxScale, (this._pinch.startScale * dist) / this._pinch.startDist));
    this.offsetX = mid.x - this._pinch.worldMid.x * this.scale;
    this.offsetY = mid.y - this._pinch.worldMid.y * this.scale;
    this._viewIsCustom = true;
    this._clampView();
    this.render();
  }

  // Finishes (or, for a pinch takeover, abandons) the current one-finger
  // drag: persists whatever it changed, and only commits a pending
  // measurement when `commitMeasurement` is true.
  _endDrag(commitMeasurement) {
    if (this.dragging) {
      if (this.dragging.kind === 'pan') {
        this.canvas.classList.remove('panning');
      } else if (this.dragging.kind === 'measuring') {
        const m = this.pendingMeasurement;
        this.pendingMeasurement = null;
        if (commitMeasurement && m && Math.hypot(m.x2 - m.x1, m.y2 - m.y1) >= 0.05) {
          this._pushUndo();
          this.measurements.push({ id: `medida-${Date.now()}`, ...m });
          this._persistMeasurements();
        }
        this.render();
      } else if (this.dragging.pushed) {
        const state = this.roomStates.find((s) => s.room.id === this.dragging.roomId);
        if (state) {
          if (this.dragging.kind === 'room') {
            // Moved everything at once — both halves of the room's state
            // changed, so both need saving (unlike a single vertex/item
            // drag, which only ever touches one).
            this._persistRoomState(state);
            this._persistItems(state);
          } else if (this.dragging.kind === 'vertex' || this.selectedKind === 'fixed') {
            this._persistRoomState(state);
          } else {
            this._persistItems(state);
          }
        }
      }
      this.dragging = null;
    }
  }

  // --- Rendering -----------------------------------------------------------

  render() {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    ctx.clearRect(0, 0, cssW, cssH);

    this._drawGrid(cssW, cssH);
    this.roomStates.forEach((state) => this._drawWallDimensions(state));
    this.roomStates.forEach((state) => this._drawFixedItems(state));
    this.roomStates.forEach((state) => this._drawItems(state));
    if (this.showItemDimensions) this.roomStates.forEach((state) => this._drawItemDimensions(state));
    // Outline drawn after fixed/movable items so it stays crisp even where
    // they sit flush against a wall (their fill would otherwise paint
    // over it).
    this.roomStates.forEach((state) => this._drawWallOutline(state));
    this.roomStates.forEach((state) => this._drawRoomLabel(state));
    if (this.adminMode) this.roomStates.forEach((state) => this._drawAdminHandles(state));
    this._drawMeasurements();
    if (this.wallDraw) this._drawWallDraw();
  }

  // In-progress preview for the wall-drawing tool: solid/dashed-cyan lines
  // for walls already added (matching the real normal/glass wall styles),
  // a green dot at the start point, and — once there's enough to compute
  // one — a faint dashed preview of the closing wall finishing would add.
  _drawWallDraw() {
    const { ctx } = this;
    const state = this.getWallDrawState();
    ctx.save();
    const startS = this.toScreen(state.startPoint.x, state.startPoint.y);
    ctx.beginPath();
    ctx.arc(startS.x, startS.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#2c6e49';
    ctx.fill();

    for (let i = 0; i < state.points.length - 1; i += 1) {
      const a = this.toScreen(state.points[i].x, state.points[i].y);
      const b = this.toScreen(state.points[i + 1].x, state.points[i + 1].y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (state.segments[i].type === 'glass') {
        ctx.strokeStyle = '#7ec8e3';
        ctx.lineWidth = 4;
        ctx.setLineDash([6, 4]);
      } else {
        ctx.strokeStyle = '#2c6e49';
        ctx.lineWidth = 4;
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#2c6e49';
      ctx.setLineDash([]);
      ctx.fill();
    }

    if (state.closingPreview) {
      const last = state.points[state.points.length - 1];
      const lastS = this.toScreen(last.x, last.y);
      ctx.beginPath();
      ctx.moveTo(lastS.x, lastS.y);
      ctx.lineTo(startS.x, startS.y);
      ctx.strokeStyle = '#f2a541';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
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

  _drawWallDimensions(state) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = '#556';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < state.polygon.length - 1; i += 1) {
      const a = state.polygon[i];
      const b = state.polygon[i + 1];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = this.toScreen(mid.x, mid.y);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.fillText(`${len.toFixed(2)} m`, s.x, s.y - 6);
    }
    ctx.restore();
  }

  // Draws each wall as solid, except where an opening marks a gap: 'open'
  // skips the line entirely (no wall), 'glass' draws a thin colored line
  // instead of the solid black wall stroke. A solid stretch on a wall with
  // a real measured thickness (`room.floorPlan.wallThickness[i]`) is drawn
  // as an actual filled band inset into the room, to scale, instead of a
  // fixed-width stroke.
  _drawWallOutline(state) {
    const { ctx } = this;
    const wallThickness = state.room.floorPlan.wallThickness || [];
    ctx.save();
    ctx.lineJoin = 'round';
    for (let i = 0; i < state.polygon.length - 1; i += 1) {
      const a = state.polygon[i];
      const b = state.polygon[i + 1];
      const thickness = wallThickness[i];
      const wallOpenings = state.openings.filter((o) => o.wall === i);
      const parts = wallSubSegments(a, b, wallOpenings);
      parts.forEach((part) => {
        if (part.type === 'open') return; // no wall here — a real gap

        if (part.type === 'solid' && thickness) {
          const quad = wallBandQuad(part.from, part.to, thickness).map((p) => this.toScreen(p.x, p.y));
          ctx.beginPath();
          ctx.moveTo(quad[0].x, quad[0].y);
          quad.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
          ctx.closePath();
          ctx.fillStyle = '#2c2c2c';
          ctx.fill();
          return;
        }

        const from = this.toScreen(part.from.x, part.from.y);
        const to = this.toScreen(part.to.x, part.to.y);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        if (part.type === 'glass') {
          ctx.strokeStyle = '#7ec8e3';
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 4]);
        } else {
          ctx.strokeStyle = '#2c2c2c';
          ctx.lineWidth = 4;
          ctx.setLineDash([]);
        }
        ctx.stroke();
      });
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Room name label above its bounding box — provisional (not-yet-placed)
  // rooms get a muted color and a "(posição provisória)" suffix so they're
  // never mistaken for a confirmed connection.
  _drawRoomLabel(state) {
    const { ctx } = this;
    const labelPos = this.toScreen((state.bounds.minX + state.bounds.maxX) / 2, state.bounds.minY);
    ctx.save();
    ctx.fillStyle = state.confirmed ? '#333' : '#999';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    const suffix = state.confirmed ? '' : ' (provisório)';
    ctx.fillText(state.room.name + suffix, labelPos.x, labelPos.y - 8);
    ctx.restore();
  }

  // Draggable admin handles for one room: a highlight over its selected
  // wall's full line (tap any wall to select it — see _hitTestWallLine)
  // and a small circle at each corner (drag to reshape freely). The
  // selection highlight only shows for the focused room, since
  // selectedWallIndex/selectedVertexIndex are scoped to it.
  _drawAdminHandles(state) {
    const { ctx } = this;
    const isFocused = state.room.id === this.focusedRoomId;
    ctx.save();
    if (isFocused && this.selectedWallIndex !== null) {
      const aVertex = state.vertices[this.selectedWallIndex];
      const bVertex = state.vertices[(this.selectedWallIndex + 1) % state.vertices.length];
      const a = this.toScreen(aVertex.x, aVertex.y);
      const b = this.toScreen(bVertex.x, bVertex.y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = '#f2a541';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    state.vertices.forEach((v, i) => {
      const s = this.toScreen(v.x, v.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = isFocused && i === this.selectedVertexIndex ? '#e63946' : '#2c6e49';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.restore();
  }

  // Fixed pieces that came with the house: `type: 'furniture'` (sinks,
  // built-in cabinets) draws like furniture but with a dashed border and a
  // lock glyph; `type: 'wall'` (a pillar/duct/partition) draws as a plain
  // solid block matching the wall stroke, no label; `type: 'glass'` (an
  // interior glass divider/panel) draws with the same dashed cyan style as
  // a glass wall-opening, no label. Outside admin mode none of these are
  // part of hit-testing/dragging; in admin mode all become
  // selectable/draggable like a movable item.
  // Traces one item's own outline as a canvas path, in its local scaled
  // frame — caller must have already translated+rotated the context onto
  // that item's position/rotation. Shared between fixed and movable item
  // rendering so the three shapes (rect/circle/L) live in one place.
  _traceItemPath(item) {
    const { ctx } = this;
    ctx.beginPath();
    if (item.shape === 'circle') {
      ctx.arc(0, 0, item.radius * this.scale, 0, Math.PI * 2);
    } else if (item.shape === 'L') {
      const points = lShapeLocalPoints(item.width, item.height, item.notchWidth, item.notchHeight);
      ctx.moveTo(points[0].x * this.scale, points[0].y * this.scale);
      points.slice(1).forEach((p) => ctx.lineTo(p.x * this.scale, p.y * this.scale));
      ctx.closePath();
    } else {
      const w = item.width * this.scale;
      const h = item.height * this.scale;
      ctx.rect(-w / 2, -h / 2, w, h);
    }
  }

  _drawFixedItems(state) {
    const { ctx } = this;
    const isFocused = state.room.id === this.focusedRoomId;
    state.fixedItems.forEach((item) => {
      const isSelected = this.adminMode && isFocused && this.selectedKind === 'fixed' && item.id === this.selectedId;
      ctx.save();
      const s = this.toScreen(item.x, item.y);
      ctx.translate(s.x, s.y);
      ctx.rotate((item.rotation * Math.PI) / 180);

      this._traceItemPath(item);

      if (item.type === 'wall') {
        ctx.fillStyle = item.color || '#2c2c2c';
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = '#e63946';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      } else if (item.type === 'glass') {
        const glassColor = item.color || '#7ec8e3';
        ctx.fillStyle = hexToRgba(glassColor, 0.35);
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#e63946' : glassColor;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = item.color;
        ctx.strokeStyle = isSelected ? '#e63946' : '#333';
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.setLineDash([4, 3]);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (item.type === 'furniture') {
        ctx.rotate((-item.rotation * Math.PI) / 180);
        ctx.fillStyle = '#222';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🔒 ${item.label}`, 0, 0);
      }
      ctx.restore();
    });
  }

  _drawItems(state) {
    const { ctx } = this;
    const isFocused = state.room.id === this.focusedRoomId;
    state.items.forEach((item) => {
      ctx.save();
      const s = this.toScreen(item.x, item.y);
      ctx.translate(s.x, s.y);
      ctx.rotate((item.rotation * Math.PI) / 180);
      ctx.fillStyle = item.color;
      const isSelected = isFocused && this.selectedKind === 'item' && item.id === this.selectedId;
      ctx.strokeStyle = isSelected ? '#e63946' : '#333';
      ctx.lineWidth = isSelected ? 3 : 1.5;

      this._traceItemPath(item);
      ctx.fill();
      ctx.stroke();

      ctx.rotate((-item.rotation * Math.PI) / 180);
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, 0, 0);
      ctx.restore();
    });
  }

  // Optional per-item width×height (or diameter) label, toggled by
  // setShowItemDimensions — for movable furniture and fixed/locked items.
  _drawItemDimensions(state) {
    const { ctx } = this;
    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2c6e49';
    const drawFor = (item) => {
      const s = this.toScreen(item.x, item.y);
      const label =
        item.shape === 'circle'
          ? `⌀${(item.radius * 2).toFixed(2)} m`
          : `${item.width.toFixed(2)} × ${item.height.toFixed(2)} m`;
      const halfSpan = (item.shape === 'circle' ? item.radius : item.height / 2) * this.scale;
      ctx.fillText(label, s.x, s.y + halfSpan + 12);
    };
    state.items.forEach(drawFor);
    state.fixedItems.forEach(drawFor);
    ctx.restore();
  }

  // Draws one dimension line with ruler-style end ticks and a distance
  // label at its midpoint — shared by finalized measurements and the
  // in-progress preview while the user is dragging a new one.
  _drawMeasurementLine(x1, y1, x2, y2, { color = '#b5179e', selected = false, faded = false } = {}) {
    const { ctx } = this;
    const a = this.toScreen(x1, y1);
    const b = this.toScreen(x2, y2);
    const dist = Math.hypot(x2 - x1, y2 - y1);

    ctx.save();
    ctx.globalAlpha = faded ? 0.6 : 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const perp = angle + Math.PI / 2;
    const tick = 6;
    ctx.setLineDash([]);
    [a, b].forEach((p) => {
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(perp) * tick, p.y - Math.sin(perp) * tick);
      ctx.lineTo(p.x + Math.cos(perp) * tick, p.y + Math.sin(perp) * tick);
      ctx.stroke();
    });

    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const label = `${dist.toFixed(2)} m`;
    ctx.font = 'bold 11px sans-serif';
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = '#fff';
    ctx.fillRect(mid.x - textWidth / 2 - 4, mid.y - 9, textWidth + 8, 18);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mid.x, mid.y);
    ctx.restore();
  }

  // User-placed dimension notes (see setMeasuringMode) plus the
  // in-progress preview while one is being dragged into place.
  _drawMeasurements() {
    this.measurements.forEach((m) => {
      const isSelected = m.id === this.selectedMeasurementId;
      this._drawMeasurementLine(m.x1, m.y1, m.x2, m.y2, {
        color: isSelected ? '#e63946' : '#b5179e',
        selected: isSelected,
      });
    });
    if (this.pendingMeasurement) {
      const p = this.pendingMeasurement;
      this._drawMeasurementLine(p.x1, p.y1, p.x2, p.y2, { faded: true });
    }
  }
}

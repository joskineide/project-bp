import { ROOMS, WALL_VIEW_ORDER } from './room-data.js';
import { FURNITURE_CATALOG } from './furniture-catalog.js';
import { FloorPlanView } from './floor-plan.js';
import { WallElevationView } from './wall-view.js';
import { loadWallLayout } from './storage.js';

const tabs = document.querySelectorAll('.tab-button');
const panels = document.querySelectorAll('.tab-panel');

tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabs.forEach((b) => b.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
    onTabShown(btn.dataset.target);
  });
});

function isWallTabActive() {
  return document.getElementById('wall-view').classList.contains('active');
}

// --- Wall elevation picker (flat list across every room) ---------------
//
// A wall elevation is picked from every room's `wallViews` at once
// (each wall's label already names its room, e.g. "Cozinha (Pia)") rather than being tied to
// one room — this is what lets two different rooms' walls both be one
// dropdown selection apart.

const wallViewPicker = document.getElementById('wall-view-picker');
const wallViewCanvas = document.getElementById('wall-view-canvas');
const wallViewEmptyHint = document.getElementById('wall-view-empty-hint');
const wallView = new WallElevationView(wallViewCanvas);
const wallOrder = (entry) => {
  const i = WALL_VIEW_ORDER.indexOf(entry.wallView.id);
  return i === -1 ? WALL_VIEW_ORDER.length : i;
};
const ALL_WALL_VIEWS = ROOMS.flatMap((room) => (room.wallViews || []).map((wallView) => ({ room, wallView }))).sort(
  (a, b) => wallOrder(a) - wallOrder(b)
);

ALL_WALL_VIEWS.forEach((entry, index) => {
  const option = document.createElement('option');
  option.value = String(index);
  option.textContent = entry.wallView.label;
  wallViewPicker.appendChild(option);
});

if (ALL_WALL_VIEWS.length === 0) {
  wallViewPicker.hidden = true;
  wallViewCanvas.hidden = true;
  wallViewEmptyHint.hidden = false;
}

wallViewPicker.addEventListener('change', () => {
  wallView.setWall(ALL_WALL_VIEWS[Number(wallViewPicker.value) || 0].wallView);
});
if (ALL_WALL_VIEWS.length > 0) wallView.setWall(ALL_WALL_VIEWS[0].wallView);

// --- The whole-house canvas ----------------------------------------------
//
// One FloorPlanView for the app's whole lifetime, showing every room in
// ROOMS together in one shared canvas (see "Multi-room" in CLAUDE.md).
// There's no more room picker — whichever room you tap becomes "focused"
// (see the header's "Editando: ..." label), and that's the one admin
// edits/new furniture/export-import apply to.

const floorCanvas = document.getElementById('floor-plan-canvas');
const floorView = new FloorPlanView(floorCanvas, ROOMS);

// --- Admin mode ---------------------------------------------------------

const adminToolbox = document.getElementById('admin-toolbox');
const btnAddFixedFurniture = document.getElementById('btn-add-fixed-furniture');
const btnAddFixedFurnitureL = document.getElementById('btn-add-fixed-furniture-l');
const btnAddFixedWall = document.getElementById('btn-add-fixed-wall');
const btnAddFixedGlass = document.getElementById('btn-add-fixed-glass');
const btnRemoveVertex = document.getElementById('btn-remove-vertex');

const btnUndoCanvas = document.getElementById('btn-undo-canvas');
const btnRedoCanvas = document.getElementById('btn-redo-canvas');
const btnUndoWall = document.getElementById('btn-undo-wall');
const btnRedoWall = document.getElementById('btn-redo-wall');

function undoActive() {
  if (isWallTabActive()) wallView.undo();
  else floorView.undo();
}

function redoActive() {
  if (isWallTabActive()) wallView.redo();
  else floorView.redo();
}

function refreshUndoButton() {
  btnUndoCanvas.disabled = !floorView.canUndo();
  btnRedoCanvas.disabled = !floorView.canRedo();
  btnUndoWall.disabled = !wallView.canUndo();
  btnRedoWall.disabled = !wallView.canRedo();
}

function applyAdminMode(on) {
  floorView.setAdminMode(on);
  wallView.setAdminMode(on);
  document.getElementById('wall-admin-toolbox').classList.toggle('visible', on);
  adminToolbox.classList.toggle('visible', on);
  document.body.classList.toggle('admin-mode', on);
}

// There's no admin switch in the UI: the family member's copy never shows the
// editing tools. Opening the page with ?admin at the end of the URL turns them
// on for that visit only (nothing is remembered).
localStorage.removeItem('planta-admin-mode');
applyAdminMode(new URLSearchParams(window.location.search).has('admin'));

floorView.onChange = refreshUndoButton;
wallView.onChange = refreshUndoButton;

btnUndoCanvas.addEventListener('click', () => floorView.undo());
btnRedoCanvas.addEventListener('click', () => floorView.redo());
btnUndoWall.addEventListener('click', () => wallView.undo());
btnRedoWall.addEventListener('click', () => wallView.redo());
document.getElementById('btn-zoom-in').addEventListener('click', () => floorView.zoomBy(1.4));
document.getElementById('btn-zoom-out').addEventListener('click', () => floorView.zoomBy(1 / 1.4));

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undoActive();
  } else if ((key === 'z' && e.shiftKey) || key === 'y') {
    e.preventDefault();
    redoActive();
  }
});

btnAddFixedFurniture.addEventListener('click', () => floorView.addFixedItem('furniture'));
btnAddFixedFurnitureL.addEventListener('click', () => floorView.addFixedItem('furniture', 'L'));
btnAddFixedWall.addEventListener('click', () => floorView.addFixedItem('wall'));
btnAddFixedGlass.addEventListener('click', () => floorView.addFixedItem('glass'));
btnRemoveVertex.addEventListener('click', () => floorView.removeSelectedVertex());

floorView.onVertexSelectionChange = (index) => {
  btnRemoveVertex.hidden = index === null;
};

// --- Room export/import/reset (whichever room is focused) --------------

document.getElementById('btn-export-room').addEventListener('click', () => {
  const data = floorView.exportFocusedRoom();
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sala-${data.roomId}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('input-import-room').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const room = JSON.parse(reader.result);
      if (!Array.isArray(room.vertices) || !Array.isArray(room.openings) || !Array.isArray(room.fixedFurniture)) {
        throw new Error('o arquivo não tem o formato esperado (vertices/openings/fixedFurniture)');
      }
      floorView.replaceRoom(room);
    } catch (err) {
      window.alert(`Não foi possível importar a sala: ${err.message}`);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btn-reset-room').addEventListener('click', () => {
  if (window.confirm('Descartar as alterações deste ambiente e voltar aos dados originais?')) {
    floorView.resetFocusedRoomToDefault();
  }
});

// --- All-rooms export/import (every room's walls + furniture in one file,
// for handing the whole house's data over at once) ----------------------

document.getElementById('btn-export-all-rooms').addEventListener('click', () => {
  const data = floorView.exportAllRooms();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'casa-completa.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('input-import-all-rooms').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.rooms)) {
        throw new Error('o arquivo não tem o formato esperado ({ rooms: [...] })');
      }
      floorView.replaceAllRooms(data);
    } catch (err) {
      window.alert(`Não foi possível importar: ${err.message}`);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// --- Selected-wall editing (exact length + openings) -----------------

const wallEditPanel = document.getElementById('wall-edit-panel');
const wallLengthInput = document.getElementById('wall-length');
const wallOpeningsList = document.getElementById('wall-openings-list');
const btnInsertVertex = document.getElementById('btn-insert-vertex');
const btnAddOpeningOpen = document.getElementById('btn-add-opening-open');
const btnAddOpeningGlass = document.getElementById('btn-add-opening-glass');

const OPENING_TYPE_LABEL = { open: 'Vão aberto (sem parede)', glass: 'Painel de vidro' };

function renderWallEditPanel() {
  const info = floorView.getSelectedWallInfo();
  if (!info) {
    wallEditPanel.classList.remove('visible');
    return;
  }
  wallEditPanel.classList.add('visible');
  wallLengthInput.value = info.length.toFixed(2);

  wallOpeningsList.innerHTML = '';
  floorView.getSelectedWallOpenings().forEach((opening) => {
    const row = document.createElement('div');
    row.className = 'opening-row';

    const typeBtn = document.createElement('button');
    typeBtn.type = 'button';
    typeBtn.className = 'opening-type';
    typeBtn.textContent = OPENING_TYPE_LABEL[opening.type] || opening.type;
    typeBtn.addEventListener('click', () => {
      floorView.updateOpening(opening, { type: opening.type === 'open' ? 'glass' : 'open' });
      renderWallEditPanel();
    });

    const offsetLabel = document.createElement('label');
    offsetLabel.textContent = 'Início (m)';
    const offsetInput = document.createElement('input');
    offsetInput.type = 'number';
    offsetInput.step = '0.01';
    offsetInput.min = '0';
    offsetInput.value = opening.offset.toFixed(2);
    offsetInput.addEventListener('change', () => {
      floorView.updateOpening(opening, { offset: parseFloat(offsetInput.value) || 0 });
      renderWallEditPanel();
    });
    offsetLabel.appendChild(offsetInput);

    const widthLabel = document.createElement('label');
    widthLabel.textContent = 'Largura (m)';
    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.step = '0.01';
    widthInput.min = '0.05';
    widthInput.value = opening.width.toFixed(2);
    widthInput.addEventListener('change', () => {
      floorView.updateOpening(opening, { width: parseFloat(widthInput.value) || 0.05 });
      renderWallEditPanel();
    });
    widthLabel.appendChild(widthInput);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'opening-remove';
    removeBtn.textContent = '🗑';
    removeBtn.addEventListener('click', () => {
      floorView.removeOpening(opening);
      renderWallEditPanel();
    });

    row.append(typeBtn, offsetLabel, widthLabel, removeBtn);
    wallOpeningsList.appendChild(row);
  });
}

wallLengthInput.addEventListener('change', () => {
  const value = parseFloat(wallLengthInput.value);
  if (Number.isFinite(value) && value > 0) floorView.setSelectedWallLength(value);
  renderWallEditPanel();
});

btnInsertVertex.addEventListener('click', () => floorView.insertVertexOnSelectedWall());
btnAddOpeningOpen.addEventListener('click', () => {
  floorView.addOpeningToSelectedWall('open');
  renderWallEditPanel();
});
btnAddOpeningGlass.addEventListener('click', () => {
  floorView.addOpeningToSelectedWall('glass');
  renderWallEditPanel();
});

floorView.onWallSelectionChange = renderWallEditPanel;

// --- Wall-drawing tool (build a room's outline from scratch, wall by wall,
// each with its own typed length + absolute direction + type) -----------

const btnToggleWallDraw = document.getElementById('btn-toggle-wall-draw');
const btnToggleRoomMove = document.getElementById('btn-toggle-room-move');
const wallDrawPanel = document.getElementById('wall-draw-panel');
const wallDrawRoomSelect = document.getElementById('wall-draw-room-select');
const wallDrawStartX = document.getElementById('wall-draw-start-x');
const wallDrawStartY = document.getElementById('wall-draw-start-y');
const wallDrawList = document.getElementById('wall-draw-list');
const wallDrawLength = document.getElementById('wall-draw-length');
const wallDrawAngle = document.getElementById('wall-draw-angle');
const wallDrawGlass = document.getElementById('wall-draw-glass');
const btnWallDrawTurnLeft = document.getElementById('btn-wall-draw-turn-left');
const btnWallDrawTurnRight = document.getElementById('btn-wall-draw-turn-right');
const btnWallDrawAdd = document.getElementById('btn-wall-draw-add');
const wallDrawClosingPreview = document.getElementById('wall-draw-closing-preview');
const wallDrawClosingText = document.getElementById('wall-draw-closing-text');
const btnWallDrawFinish = document.getElementById('btn-wall-draw-finish');
const btnCancelWallDraw = document.getElementById('btn-cancel-wall-draw');

ROOMS.forEach((room) => {
  const option = document.createElement('option');
  option.value = room.id;
  option.textContent = room.name;
  wallDrawRoomSelect.appendChild(option);
});

// Picking a room here is the *only* way to change the wall-drawing tool's
// target once the mode is on — canvas taps are reserved for placing the
// start point (see setWallDrawMode's pointerdown handling), so without
// this there'd be no way to switch rooms without leaving the mode
// entirely. Disabled once a start point is set (`draw` exists) because
// the in-progress draw is already locked to whatever room was focused
// when it started; switching the room out from under it would desync the
// dropdown from what "Concluir e aplicar" actually targets.
wallDrawRoomSelect.addEventListener('change', () => {
  floorView.setFocusedRoom(wallDrawRoomSelect.value);
  // Only reachable while nothing's been drawn yet (the select is disabled
  // once a draw exists), so it's always safe to (re)start fresh at (0,0)
  // for whichever room was just picked.
  floorView.startWallDraw({ x: 0, y: 0 });
  renderWallDrawPanel();
});

function renderWallDrawPanel() {
  if (!floorView.wallDrawMode) {
    wallDrawPanel.classList.remove('visible');
    return;
  }
  wallDrawPanel.classList.add('visible');
  const draw = floorView.getWallDrawState ? floorView.getWallDrawState() : null;
  wallDrawRoomSelect.value = draw ? draw.roomId : floorView.getFocusedRoomId();
  wallDrawRoomSelect.disabled = Boolean(draw);

  if (!draw) {
    wallDrawStartX.value = '';
    wallDrawStartY.value = '';
    wallDrawList.innerHTML = '';
    wallDrawClosingPreview.hidden = true;
    btnWallDrawFinish.disabled = true;
    return;
  }

  wallDrawStartX.value = draw.startPoint.x.toFixed(2);
  wallDrawStartY.value = draw.startPoint.y.toFixed(2);

  wallDrawList.innerHTML = '';
  draw.segments.forEach((seg, index) => {
    const row = document.createElement('div');
    row.className = 'wall-draw-segment-row';

    const indexLabel = document.createElement('span');
    indexLabel.textContent = `#${index + 1}`;
    row.appendChild(indexLabel);

    const lengthInput = document.createElement('input');
    lengthInput.type = 'number';
    lengthInput.step = '0.01';
    lengthInput.min = '0.1';
    lengthInput.title = 'Comprimento (m)';
    lengthInput.value = seg.length.toFixed(2);
    lengthInput.addEventListener('change', () => {
      floorView.updateWallDrawSegment(index, { length: parseFloat(lengthInput.value) || seg.length });
    });
    row.appendChild(lengthInput);

    const angleInput = document.createElement('input');
    angleInput.type = 'number';
    angleInput.step = '1';
    angleInput.title = 'Direção (°)';
    angleInput.value = Math.round(seg.angle);
    angleInput.addEventListener('change', () => {
      floorView.updateWallDrawSegment(index, { angle: parseFloat(angleInput.value) || 0 });
    });
    row.appendChild(angleInput);

    const typeBtn = document.createElement('button');
    typeBtn.type = 'button';
    typeBtn.className = 'opening-type';
    typeBtn.textContent = seg.type === 'glass' ? 'Vidro' : 'Normal';
    typeBtn.addEventListener('click', () => {
      floorView.updateWallDrawSegment(index, { type: seg.type === 'glass' ? 'normal' : 'glass' });
    });
    row.appendChild(typeBtn);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'wall-draw-remove';
    removeBtn.textContent = '🗑';
    removeBtn.addEventListener('click', () => floorView.removeWallDrawSegment(index));
    row.appendChild(removeBtn);

    wallDrawList.appendChild(row);
  });

  if (draw.closingPreview) {
    wallDrawClosingPreview.hidden = false;
    wallDrawClosingText.textContent = `${draw.closingPreview.length.toFixed(2)} m, ${Math.round(draw.closingPreview.angle)}°`;
  } else {
    wallDrawClosingPreview.hidden = true;
  }
  btnWallDrawFinish.disabled = draw.segments.length < 2;
}

function syncModeButtons() {
  btnToggleWallDraw.classList.toggle('active', floorView.wallDrawMode);
  btnToggleRoomMove.classList.toggle('active', floorView.roomMoveMode);
}

btnToggleWallDraw.addEventListener('click', () => {
  floorView.setWallDrawMode(!floorView.wallDrawMode);
  renderWallDrawPanel();
  syncModeButtons();
});

btnToggleRoomMove.addEventListener('click', () => {
  floorView.setRoomMoveMode(!floorView.roomMoveMode);
  renderWallDrawPanel();
  syncModeButtons();
});

wallDrawStartX.addEventListener('change', () => {
  const draw = floorView.getWallDrawState();
  if (!draw) return;
  floorView.setWallDrawStartPoint(parseFloat(wallDrawStartX.value) || 0, draw.startPoint.y);
});
wallDrawStartY.addEventListener('change', () => {
  const draw = floorView.getWallDrawState();
  if (!draw) return;
  floorView.setWallDrawStartPoint(draw.startPoint.x, parseFloat(wallDrawStartY.value) || 0);
});

btnWallDrawTurnLeft.addEventListener('click', () => {
  wallDrawAngle.value = ((parseFloat(wallDrawAngle.value) || 0) - 90 + 360) % 360;
});
btnWallDrawTurnRight.addEventListener('click', () => {
  wallDrawAngle.value = ((parseFloat(wallDrawAngle.value) || 0) + 90) % 360;
});

btnWallDrawAdd.addEventListener('click', () => {
  const draw = floorView.getWallDrawState();
  if (!draw) return;
  floorView.addWallDrawSegment({
    length: parseFloat(wallDrawLength.value) || 1,
    angle: parseFloat(wallDrawAngle.value) || 0,
    type: wallDrawGlass.checked ? 'glass' : 'normal',
  });
  wallDrawGlass.checked = false;
  wallDrawLength.value = '1';
  renderWallDrawPanel();
});

btnWallDrawFinish.addEventListener('click', () => {
  const draw = floorView.getWallDrawState();
  const room = draw && ROOMS.find((r) => r.id === draw.roomId);
  const roomName = room ? room.name : 'ambiente atual';
  if (!window.confirm(`Isso substitui TODAS as paredes atuais de "${roomName}" pelo desenho novo. Continuar?`)) return;
  const result = floorView.finishWallDraw();
  if (result && result.error === 'degenerate') {
    window.alert(
      'Não foi possível aplicar: o desenho resultou em um formato inválido (provavelmente um comprimento ou direção digitados errados). Nada foi alterado — confira os valores da lista e tente novamente.'
    );
  } else if (result && result.merged) {
    window.alert('Ambiente aplicado. As paredes já fechavam quase exatamente, então nenhuma parede de fechamento extra foi criada.');
  } else if (result) {
    window.alert(
      `Ambiente aplicado. Parede de fechamento calculada: ${result.closingSegment.length.toFixed(2)} m — confira se esse número faz sentido.`
    );
  }
  renderWallDrawPanel();
});

btnCancelWallDraw.addEventListener('click', () => {
  // "Cancelar" is the obvious thing to reach for to get out of this tool
  // entirely — it used to only clear the in-progress draw and leave the
  // mode (and panel) on, which looked like there was no way out short of
  // finding the small mode-toggle button again.
  floorView.cancelWallDraw();
  floorView.setWallDrawMode(false);
  renderWallDrawPanel();
  syncModeButtons();
});

floorView.onWallDrawChange = renderWallDrawPanel;

// --- Measurements (free-standing dimension notes, whole-house) ---------

const ITEM_DIMENSIONS_STORAGE_KEY = 'planta-mostrar-medidas';
const btnToggleMeasuring = document.getElementById('btn-toggle-measuring');
const btnToggleItemDimensions = document.getElementById('btn-toggle-item-dimensions');
const measurementEditPanel = document.getElementById('measurement-edit-panel');
const measurementDistance = document.getElementById('measurement-distance');
const measurementX1 = document.getElementById('measurement-x1');
const measurementY1 = document.getElementById('measurement-y1');
const measurementX2 = document.getElementById('measurement-x2');
const measurementY2 = document.getElementById('measurement-y2');
const btnRemoveMeasurement = document.getElementById('btn-remove-measurement');

btnToggleMeasuring.addEventListener('click', () => {
  const on = !btnToggleMeasuring.classList.contains('active');
  btnToggleMeasuring.classList.toggle('active', on);
  floorView.setMeasuringMode(on);
});

btnToggleItemDimensions.addEventListener('click', () => {
  const on = !btnToggleItemDimensions.classList.contains('active');
  btnToggleItemDimensions.classList.toggle('active', on);
  localStorage.setItem(ITEM_DIMENSIONS_STORAGE_KEY, on ? '1' : '0');
  floorView.setShowItemDimensions(on);
});
{
  const startOn = localStorage.getItem(ITEM_DIMENSIONS_STORAGE_KEY) === '1';
  btnToggleItemDimensions.classList.toggle('active', startOn);
  floorView.setShowItemDimensions(startOn);
}

const btnToggleSnap = document.getElementById('btn-toggle-snap');
const SNAP_STORAGE_KEY = 'planta-encaixar';
btnToggleSnap.addEventListener('click', () => {
  const on = !btnToggleSnap.classList.contains('active');
  btnToggleSnap.classList.toggle('active', on);
  localStorage.setItem(SNAP_STORAGE_KEY, on ? '1' : '0');
  floorView.setSnapEnabled(on);
});
{
  const startOn = localStorage.getItem(SNAP_STORAGE_KEY) !== '0';
  btnToggleSnap.classList.toggle('active', startOn);
  floorView.setSnapEnabled(startOn);
}

function renderMeasurementEditPanel() {
  const m = floorView.getSelectedMeasurement();
  if (!m) {
    measurementEditPanel.classList.remove('visible');
    return;
  }
  measurementEditPanel.classList.add('visible');
  measurementX1.value = m.x1.toFixed(2);
  measurementY1.value = m.y1.toFixed(2);
  measurementX2.value = m.x2.toFixed(2);
  measurementY2.value = m.y2.toFixed(2);
  const distance = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
  measurementDistance.textContent = `${distance.toFixed(2)} m`;
}

[measurementX1, measurementY1, measurementX2, measurementY2].forEach((input) => {
  input.addEventListener('change', () => {
    floorView.updateSelectedMeasurement({
      x1: parseFloat(measurementX1.value) || 0,
      y1: parseFloat(measurementY1.value) || 0,
      x2: parseFloat(measurementX2.value) || 0,
      y2: parseFloat(measurementY2.value) || 0,
    });
    renderMeasurementEditPanel();
  });
});

btnRemoveMeasurement.addEventListener('click', () => floorView.removeSelectedMeasurement());

floorView.onMeasurementSelectionChange = renderMeasurementEditPanel;

// "Novo móvel" / "Novo móvel em L" just drop a default-size piece and open
// its edit panel — the family member is going to measure her own furniture
// and type the real name/size in, so there are no named presets (and no
// window.prompt chain, which is miserable on a phone).
const toolbox = document.getElementById('toolbox');
FURNITURE_CATALOG.forEach((item) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tool-chip';
  btn.textContent = `＋ Novo ${item.label.charAt(0).toLowerCase()}${item.label.slice(1)}`;
  btn.addEventListener('click', () => {
    floorView.addItem(item);
    // The edit panel sits below the canvas; make sure it's actually on
    // screen so the very next step (typing the real name/size) is obvious.
    document.getElementById('edit-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  toolbox.appendChild(btn);
});

const actionBar = document.getElementById('action-bar');
document.getElementById('btn-rotate-left').addEventListener('click', () => floorView.rotateSelected(-15));
document.getElementById('btn-rotate-right').addEventListener('click', () => floorView.rotateSelected(15));
document.getElementById('btn-scale-up').addEventListener('click', () => floorView.scaleSelected(1.1));
document.getElementById('btn-scale-down').addEventListener('click', () => floorView.scaleSelected(0.9));
document.getElementById('btn-remove').addEventListener('click', () => floorView.removeSelected());
document.getElementById('btn-clear').addEventListener('click', () => {
  if (window.confirm('Remover todos os móveis do ambiente focado?')) floorView.clearAll();
});

const editPanel = document.getElementById('edit-panel');
const editLabel = document.getElementById('edit-label');
const editX = document.getElementById('edit-x');
const editY = document.getElementById('edit-y');
const editWidth = document.getElementById('edit-width');
const editHeight = document.getElementById('edit-height');
const editRadius = document.getElementById('edit-radius');
const editRotation = document.getElementById('edit-rotation');
const editColor = document.getElementById('edit-color');
const editNotchWidth = document.getElementById('edit-notch-width');
const editNotchHeight = document.getElementById('edit-notch-height');
const widthHeightFields = document.getElementById('edit-width-height-fields');
const radiusField = document.getElementById('edit-radius-field');
const notchFields = document.getElementById('edit-notch-fields');

// The edit panel's X/Y show/accept the item's *top-right corner* (in its
// own, possibly-rotated frame), not its center — item.x/item.y stay
// center-based internally (rendering, hit-testing, dragging, and
// room-data.js/export-import all still use the center, unchanged), this
// conversion is purely a data-entry convenience. The user's own
// measurements are almost always taken from a piece's edge against a wall
// or another piece (e.g. "this armário's right edge sits at x=2.73"), so
// typing the center meant computing an average by hand every time — this
// removes that arithmetic. For an unrotated item the top-right corner is
// simply (x + width/2, y - height/2) (y-down: "top" is the smaller y); for
// a rotated one that offset itself rotates with the item, same as the
// rendered rectangle does (`_drawItems`/`_drawFixedItems` in
// floor-plan.js). Circles use their bounding box's top-right corner
// instead (rotation-invariant, a circle looks the same at any rotation).
function cornerOffsetFor({ shape, width, height, radius, rotation }) {
  if (shape === 'circle') return { dx: radius, dy: -radius };
  const rad = (rotation * Math.PI) / 180;
  const halfW = width / 2;
  const halfH = height / 2;
  return {
    dx: halfW * Math.cos(rad) + halfH * Math.sin(rad),
    dy: halfW * Math.sin(rad) - halfH * Math.cos(rad),
  };
}

function fillEditPanel(item) {
  if (!item) {
    editPanel.classList.remove('visible');
    return;
  }
  editPanel.classList.add('visible');
  editLabel.value = item.label;
  editRotation.value = item.rotation;
  editColor.value = item.color || '#8fb3c9';
  const offset = cornerOffsetFor(item);
  editX.value = (item.x + offset.dx).toFixed(2);
  editY.value = (item.y + offset.dy).toFixed(2);
  if (item.shape === 'circle') {
    widthHeightFields.style.display = 'none';
    radiusField.style.display = 'flex';
    notchFields.style.display = 'none';
    editRadius.value = item.radius.toFixed(2);
  } else {
    widthHeightFields.style.display = 'contents';
    radiusField.style.display = 'none';
    editWidth.value = item.width.toFixed(2);
    editHeight.value = item.height.toFixed(2);
    if (item.shape === 'L') {
      notchFields.style.display = 'contents';
      editNotchWidth.value = item.notchWidth.toFixed(2);
      editNotchHeight.value = item.notchHeight.toFixed(2);
    } else {
      notchFields.style.display = 'none';
    }
  }
}

function numberOr(input, fallback, min = -Infinity) {
  const value = parseFloat(input.value);
  return Number.isFinite(value) ? Math.max(min, value) : fallback;
}

function applyEdits() {
  const item = floorView.getSelectedItem();
  if (!item) return;
  const currentOffset = cornerOffsetFor(item);
  const currentCornerX = item.x + currentOffset.dx;
  const currentCornerY = item.y + currentOffset.dy;

  const rotation = numberOr(editRotation, item.rotation);
  const draft = { shape: item.shape, rotation };
  // 0.01m floor, not a guess at how small real furniture gets — the house
  // has fixed dividers as thin as 0.02m (see room-data.js), so this needs
  // to stay below that; matches MIN_ITEM_SIZE in floor-plan.js.
  if (item.shape === 'circle') {
    draft.radius = numberOr(editRadius, item.radius, 0.01);
  } else {
    draft.width = numberOr(editWidth, item.width, 0.01);
    draft.height = numberOr(editHeight, item.height, 0.01);
    if (item.shape === 'L') {
      // No floor beyond 0 here (unlike width/height) — a 0-size notch is
      // just a plain rectangle, still a perfectly valid shape, not a
      // degenerate one.
      draft.notchWidth = numberOr(editNotchWidth, item.notchWidth, 0);
      draft.notchHeight = numberOr(editNotchHeight, item.notchHeight, 0);
    }
  }
  // Re-derive the center from the (possibly just-edited) corner using the
  // *new* size/rotation, so changing the size or rotation at the same time
  // as the position still keeps that corner where it was typed.
  const newOffset = cornerOffsetFor(draft);
  const cornerX = numberOr(editX, currentCornerX);
  const cornerY = numberOr(editY, currentCornerY);

  const patch = {
    label: editLabel.value.trim() || item.label,
    rotation,
    color: editColor.value,
    x: cornerX - newOffset.dx,
    y: cornerY - newOffset.dy,
  };
  if (item.shape === 'circle') patch.radius = draft.radius;
  else {
    patch.width = draft.width;
    patch.height = draft.height;
    if (item.shape === 'L') {
      patch.notchWidth = draft.notchWidth;
      patch.notchHeight = draft.notchHeight;
    }
  }
  floorView.updateSelectedItem(patch);
}

[
  editLabel,
  editX,
  editY,
  editWidth,
  editHeight,
  editRadius,
  editNotchWidth,
  editNotchHeight,
  editRotation,
  editColor,
].forEach((el) => {
  el.addEventListener('change', applyEdits);
});

floorView.onSelectionChange = (item) => {
  actionBar.classList.toggle('visible', Boolean(item));
  fillEditPanel(item);
};

function onTabShown(targetId) {
  refreshUndoButton();
  if (targetId === 'wall-view') wallView.render();
}

window.addEventListener('resize', () => {
  const activePanel = document.querySelector('.tab-panel.active');
  if (activePanel) onTabShown(activePanel.id);
});

// --- Wall elevation: movable objects, fixed items, edit panel ------------

const wallItemPanel = document.getElementById('wall-item-panel');
const wallFields = {
  label: document.getElementById('wall-item-label'),
  offset: document.getElementById('wall-item-offset'),
  bottom: document.getElementById('wall-item-bottom'),
  width: document.getElementById('wall-item-width'),
  height: document.getElementById('wall-item-height'),
  color: document.getElementById('wall-item-color'),
};
const round3 = (v) => String(Math.round(v * 1000) / 1000);

wallView.onSelectionChange = (piece) => {
  wallItemPanel.classList.toggle('visible', Boolean(piece));
  if (!piece) return;
  wallFields.label.value = piece.label || '';
  wallFields.offset.value = round3(piece.offset);
  wallFields.bottom.value = round3(piece.bottom);
  wallFields.width.value = round3(piece.width);
  wallFields.height.value = round3(piece.height);
  wallFields.color.value = piece.color || '#e9b872';
};

function applyWallEdits() {
  const piece = wallView.getSelected();
  if (!piece) return;
  wallView.updateSelected({
    label: wallFields.label.value,
    offset: numberOr(wallFields.offset, piece.offset, 0),
    bottom: numberOr(wallFields.bottom, piece.bottom, 0),
    width: numberOr(wallFields.width, piece.width, 0.01),
    height: numberOr(wallFields.height, piece.height, 0.01),
    color: wallFields.color.value,
  });
}
Object.values(wallFields).forEach((el) => el.addEventListener('change', applyWallEdits));

function revealWallPanel() {
  wallItemPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
document.getElementById('btn-wall-add-item').addEventListener('click', () => {
  if (wallView.addItem()) revealWallPanel();
});
document.getElementById('btn-wall-add-fixed').addEventListener('click', () => {
  if (wallView.addFixed()) revealWallPanel();
});
const btnWallMeasure = document.getElementById('btn-wall-measure');
const btnWallMeasureRemove = document.getElementById('btn-wall-measure-remove');
btnWallMeasure.addEventListener('click', () => {
  const on = !btnWallMeasure.classList.contains('active');
  btnWallMeasure.classList.toggle('active', on);
  wallView.setMeasureMode(on);
});
wallView.onMeasurementSelectionChange = (m) => {
  btnWallMeasureRemove.hidden = !m;
};
btnWallMeasureRemove.addEventListener('click', () => wallView.removeSelectedMeasurement());
document.getElementById('btn-wall-item-remove').addEventListener('click', () => wallView.removeSelected());
document.getElementById('btn-wall-clear').addEventListener('click', () => {
  if (window.confirm('Remover todos os objetos desta parede?')) wallView.clearItems();
});
document.getElementById('btn-wall-reset-fixed').addEventListener('click', () => {
  if (window.confirm('Descartar as alterações nos itens fixos desta parede e voltar aos dados originais?')) {
    wallView.resetFixed();
  }
});
document.getElementById('btn-wall-export').addEventListener('click', () => {
  const walls = ALL_WALL_VIEWS.map(({ wallView: wall }) => {
    const stored = loadWallLayout(wall.id);
    return {
      wallId: wall.id,
      label: wall.label,
      furniture: stored && stored.fixed ? stored.fixed : wall.furniture,
      items: (stored && stored.items) || [],
    };
  });
  const blob = new Blob([JSON.stringify({ walls }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'paredes.json';
  a.click();
  URL.revokeObjectURL(url);
});

// This is a plain website — no service worker. An earlier version registered
// one (offline cache); clean up anything it left behind in a browser that
// already visited, so nobody keeps being served an old cached copy.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
}
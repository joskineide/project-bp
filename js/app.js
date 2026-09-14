import { ROOM } from './room-data.js';
import { FURNITURE_CATALOG } from './furniture-catalog.js';
import { FloorPlanView } from './floor-plan.js';
import { renderWallView } from './wall-view.js';

const tabs = document.querySelectorAll('.tab-button');
const panels = document.querySelectorAll('.tab-panel');
const wallsRendered = { 'wall-1': false, 'wall-2': false };

tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabs.forEach((b) => b.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
    onTabShown(btn.dataset.target);
  });
});

const floorCanvas = document.getElementById('floor-plan-canvas');
const floorView = new FloorPlanView(floorCanvas, ROOM);

const toolbox = document.getElementById('toolbox');
FURNITURE_CATALOG.forEach((item) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tool-chip';
  btn.textContent = item.label;
  btn.addEventListener('click', () => {
    if (item.custom) {
      const label = window.prompt('Nome do móvel:', 'Móvel personalizado');
      if (label === null) return;
      const width = parseFloat(window.prompt('Largura (metros):', '0.60'));
      const height = parseFloat(window.prompt('Profundidade (metros):', '0.60'));
      floorView.addItem(item, {
        label: label || item.label,
        width: Number.isFinite(width) && width > 0 ? width : item.width,
        height: Number.isFinite(height) && height > 0 ? height : item.height,
      });
    } else {
      floorView.addItem(item);
    }
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
  if (window.confirm('Remover todos os móveis do ambiente?')) floorView.clearAll();
});

const editPanel = document.getElementById('edit-panel');
const editLabel = document.getElementById('edit-label');
const editX = document.getElementById('edit-x');
const editY = document.getElementById('edit-y');
const editWidth = document.getElementById('edit-width');
const editHeight = document.getElementById('edit-height');
const editRadius = document.getElementById('edit-radius');
const editRotation = document.getElementById('edit-rotation');
const widthHeightFields = document.getElementById('edit-width-height-fields');
const radiusField = document.getElementById('edit-radius-field');

function fillEditPanel(item) {
  if (!item) {
    editPanel.classList.remove('visible');
    return;
  }
  editPanel.classList.add('visible');
  editLabel.value = item.label;
  editX.value = item.x.toFixed(2);
  editY.value = item.y.toFixed(2);
  editRotation.value = item.rotation;
  if (item.shape === 'circle') {
    widthHeightFields.style.display = 'none';
    radiusField.style.display = 'flex';
    editRadius.value = item.radius.toFixed(2);
  } else {
    widthHeightFields.style.display = 'contents';
    radiusField.style.display = 'none';
    editWidth.value = item.width.toFixed(2);
    editHeight.value = item.height.toFixed(2);
  }
}

function numberOr(input, fallback, min = -Infinity) {
  const value = parseFloat(input.value);
  return Number.isFinite(value) ? Math.max(min, value) : fallback;
}

function applyEdits() {
  const item = floorView.getSelectedItem();
  if (!item) return;
  const patch = {
    label: editLabel.value.trim() || item.label,
    x: numberOr(editX, item.x),
    y: numberOr(editY, item.y),
    rotation: numberOr(editRotation, item.rotation),
  };
  if (item.shape === 'circle') {
    patch.radius = numberOr(editRadius, item.radius, 0.05);
  } else {
    patch.width = numberOr(editWidth, item.width, 0.05);
    patch.height = numberOr(editHeight, item.height, 0.05);
  }
  floorView.updateSelectedItem(patch);
}

[editLabel, editX, editY, editWidth, editHeight, editRadius, editRotation].forEach((el) => {
  el.addEventListener('change', applyEdits);
});

document.getElementById('btn-export').addEventListener('click', () => {
  const data = JSON.stringify(floorView.items, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `layout-${ROOM.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('input-import').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const items = JSON.parse(reader.result);
      if (!Array.isArray(items)) throw new Error('o arquivo não contém uma lista de móveis');
      floorView.replaceItems(items);
      fillEditPanel(null);
    } catch (err) {
      window.alert(`Não foi possível importar o arquivo: ${err.message}`);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

floorView.onSelectionChange = (item) => {
  actionBar.classList.toggle('visible', Boolean(item));
  fillEditPanel(item);
};

function onTabShown(targetId) {
  if (targetId === 'wall-1' && !wallsRendered['wall-1']) {
    renderWallView(document.getElementById('wall-1-canvas'), ROOM.wallViews[0]);
    wallsRendered['wall-1'] = true;
  }
  if (targetId === 'wall-2' && !wallsRendered['wall-2']) {
    renderWallView(document.getElementById('wall-2-canvas'), ROOM.wallViews[1]);
    wallsRendered['wall-2'] = true;
  }
}

window.addEventListener('resize', () => {
  Object.keys(wallsRendered).forEach((k) => {
    wallsRendered[k] = false;
  });
  const activePanel = document.querySelector('.tab-panel.active');
  if (activePanel) onTabShown(activePanel.id);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

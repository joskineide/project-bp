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

floorView.onSelectionChange = (item) => {
  actionBar.classList.toggle('visible', Boolean(item));
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

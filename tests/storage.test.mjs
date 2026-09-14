import { test } from 'node:test';
import assert from 'node:assert/strict';

// storage.js reads the global `localStorage` (a browser API) — stub a
// minimal in-memory version before importing it, since Node has no DOM.
function installFakeLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  return store;
}

installFakeLocalStorage();
const { loadLayout, saveLayout } = await import('../js/storage.js');

test('loadLayout returns null when nothing was ever saved for that room', () => {
  assert.equal(loadLayout('quarto-inexistente'), null);
});

test('saveLayout then loadLayout round-trips the same data', () => {
  const items = [{ id: 'sofa-1', x: 1.2, y: 0.5, width: 1.6, height: 0.9, rotation: 0 }];
  saveLayout('sala', items);
  assert.deepEqual(loadLayout('sala'), items);
});

test('different room ids do not clobber each other', () => {
  saveLayout('cozinha', [{ id: 'a' }]);
  saveLayout('sala', [{ id: 'b' }, { id: 'c' }]);
  assert.deepEqual(loadLayout('cozinha'), [{ id: 'a' }]);
  assert.deepEqual(loadLayout('sala'), [{ id: 'b' }, { id: 'c' }]);
});

test('loadLayout returns null (not throw) on corrupted JSON', () => {
  globalThis.localStorage.setItem('planta-moveis-v1:quebrado', '{not valid json');
  assert.equal(loadLayout('quebrado'), null);
});

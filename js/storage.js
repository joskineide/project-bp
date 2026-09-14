// localStorage persistence for the furniture layout the user builds.
const STORAGE_PREFIX = 'planta-moveis-v1';

export function loadLayout(roomId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${roomId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Nao foi possivel carregar o layout salvo:', err);
    return null;
  }
}

export function saveLayout(roomId, items) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${roomId}`, JSON.stringify(items));
  } catch (err) {
    console.warn('Nao foi possivel salvar o layout:', err);
  }
}

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

// Admin-mode edits to the room itself (wall vertices, openings, fixed
// furniture) — separate from the movable-furniture layout above so
// exporting/importing one doesn't touch the other.
const ROOM_STORAGE_PREFIX = 'planta-sala-v1';

export function loadRoomLayout(roomId) {
  try {
    const raw = localStorage.getItem(`${ROOM_STORAGE_PREFIX}:${roomId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Nao foi possivel carregar as alteracoes do ambiente:', err);
    return null;
  }
}

export function saveRoomLayout(roomId, room) {
  try {
    localStorage.setItem(`${ROOM_STORAGE_PREFIX}:${roomId}`, JSON.stringify(room));
  } catch (err) {
    console.warn('Nao foi possivel salvar as alteracoes do ambiente:', err);
  }
}

// User-placed measurement/dimension notes — free-standing lines with a
// distance label, independent of the furniture layout and every room's own
// walls. One shared list for the whole combined house view (not per room)
// since a measurement can freely span across a room boundary.
const HOUSE_MEASUREMENTS_STORAGE_KEY = 'planta-medidas-casa-v1';

export function loadHouseMeasurements() {
  try {
    const raw = localStorage.getItem(HOUSE_MEASUREMENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Nao foi possivel carregar as medidas salvas:', err);
    return null;
  }
}

export function saveHouseMeasurements(measurements) {
  try {
    localStorage.setItem(HOUSE_MEASUREMENTS_STORAGE_KEY, JSON.stringify(measurements));
  } catch (err) {
    console.warn('Nao foi possivel salvar as medidas:', err);
  }
}

// Wall-elevation state per wall id: { items: [...movable objects], fixed: [...] | null }.
// `fixed` is only stored once an admin actually edited the wall's fixed
// pieces — null means "use the defaults from room-data.js", so a corrected
// default later still reaches a phone that never touched them.
const WALL_STORAGE_PREFIX = 'planta-parede-v1';

export function loadWallLayout(wallId) {
  try {
    const raw = localStorage.getItem(`${WALL_STORAGE_PREFIX}:${wallId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Nao foi possivel carregar a parede salva:', err);
    return null;
  }
}

export function saveWallLayout(wallId, state) {
  try {
    localStorage.setItem(`${WALL_STORAGE_PREFIX}:${wallId}`, JSON.stringify(state));
  } catch (err) {
    console.warn('Nao foi possivel salvar a parede:', err);
  }
}

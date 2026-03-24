const KEY = "TYPEFUN_MVP_STATE_V1";

const emptyState = {
  lastPoemId: null,
  progressByPoem: {},
  bestByPoem: {}
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(emptyState);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(emptyState),
      ...parsed
    };
  } catch (err) {
    return structuredClone(emptyState);
  }
}

export function saveState(nextState) {
  localStorage.setItem(KEY, JSON.stringify(nextState));
}

export function clearProgress(poemId) {
  const state = loadState();
  delete state.progressByPoem[poemId];
  if (state.lastPoemId === poemId) {
    state.lastPoemId = null;
  }
  saveState(state);
}

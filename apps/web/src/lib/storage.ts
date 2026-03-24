import type { PracticeProgress } from "@typefun/typing-core";

const KEY = "TYPEFUN_MVP_STATE_V1";

export type BestRecord = {
  stars: number;
  accuracy: number;
  cpm: number;
  updatedAt: number;
};

export type SavedState = {
  lastPoemId: string | null;
  progressByPoem: Record<string, PracticeProgress>;
  bestByPoem: Record<string, BestRecord>;
};

const emptyState = (): SavedState => ({
  lastPoemId: null,
  progressByPoem: {},
  bestByPoem: {}
});

export function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

export function saveState(next: SavedState): void {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function clearProgress(poemId: string): void {
  const state = loadState();
  delete state.progressByPoem[poemId];
  if (state.lastPoemId === poemId) {
    state.lastPoemId = null;
  }
  saveState(state);
}

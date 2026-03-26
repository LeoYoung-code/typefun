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

/** 整页刷新（F5）后丢弃未完成的练习进度，下次进入从开头打。 */
export function clearPersistedProgressOnReload(): void {
  if (typeof performance === "undefined") return;
  const nav = performance.getEntriesByType(
    "navigation"
  )[0] as PerformanceNavigationTiming | undefined;
  if (nav?.type !== "reload") return;
  const state = loadState();
  state.progressByPoem = {};
  saveState(state);
}

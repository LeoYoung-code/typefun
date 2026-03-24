import { flattenPoem } from "./pinyin.js";
import { calcStats } from "./stats.js";
import type { Metrics, Poem, PracticeProgress, PracticeState, Unit } from "./types.js";

function skipPunctuationUnits(units: Unit[], cursor: number): number {
  let c = cursor;
  while (c < units.length && units[c].isPunctuation) {
    c += 1;
  }
  return c;
}

function refreshTypingError(state: PracticeState): PracticeState {
  const current = state.units[state.cursor];
  if (!current || current.isPunctuation) {
    return { ...state, currentError: false };
  }
  if (!state.typedBuffer) {
    return { ...state, currentError: false };
  }
  const currentError = !current.pinyinRaw.startsWith(state.typedBuffer);
  return { ...state, currentError };
}

export function createPracticeState(
  poem: Poem,
  restore: PracticeProgress | null,
  now: number
): PracticeState {
  const units = flattenPoem(poem);
  const metrics: Metrics = restore
    ? {
        startedAt: now - Math.max(0, restore.elapsedSec || 0) * 1000,
        totalKeyCount: restore.totalKeyCount || 0,
        correctKeyCount: restore.correctKeyCount || 0,
        correctCharCount: restore.correctCharCount || 0,
        errorCount: restore.errorCount || 0
      }
    : {
        startedAt: now,
        totalKeyCount: 0,
        correctKeyCount: 0,
        correctCharCount: 0,
        errorCount: 0
      };

  let cursor = restore ? restore.cursor : 0;
  let typedBuffer = restore ? restore.typedBuffer || "" : "";
  cursor = skipPunctuationUnits(units, cursor);

  let state: PracticeState = {
    poem,
    units,
    cursor,
    typedBuffer,
    currentError: false,
    metrics
  };
  state = refreshTypingError(state);
  return state;
}

function bumpMetrics(m: Metrics, patch: Partial<Metrics>): Metrics {
  return { ...m, ...patch };
}

/**
 * 单键输入：拉丁 a-z 或 "backspace"（与现 MVP keydown 一致）。
 */
export function applyPracticeKey(
  state: PracticeState,
  key: string,
  now: number
): PracticeState {
  const lower = key.toLowerCase();
  const current = state.units[state.cursor];
  if (!current || current.isPunctuation) {
    return state;
  }

  if (lower === "backspace") {
    if (state.typedBuffer.length > 0) {
      const typedBuffer = state.typedBuffer.slice(0, -1);
      return refreshTypingError({ ...state, typedBuffer });
    }
    if (state.cursor > 0) {
      let newCursor = state.cursor - 1;
      while (newCursor > 0 && state.units[newCursor].isPunctuation) {
        newCursor -= 1;
      }
      const prev = state.units[newCursor];
      if (prev && !prev.isPunctuation) {
        const typedBuffer = prev.pinyinRaw.slice(0, -1);
        const metrics = bumpMetrics(state.metrics, {
          correctCharCount: Math.max(0, state.metrics.correctCharCount - 1)
        });
        return refreshTypingError({
          ...state,
          cursor: newCursor,
          typedBuffer,
          metrics,
          currentError: false
        });
      }
    }
    return state;
  }

  if (!/^[a-z]$/.test(lower)) {
    return state;
  }

  let metrics = bumpMetrics(state.metrics, {
    totalKeyCount: state.metrics.totalKeyCount + 1
  });
  let typedBuffer = state.typedBuffer + lower;
  const expectedRaw = current.pinyinRaw;

  if (expectedRaw.startsWith(typedBuffer)) {
    metrics = bumpMetrics(metrics, {
      correctKeyCount: metrics.correctKeyCount + 1
    });
    let cursor = state.cursor;
    if (typedBuffer.length >= expectedRaw.length) {
      cursor += 1;
      metrics = bumpMetrics(metrics, {
        correctCharCount: metrics.correctCharCount + 1
      });
      typedBuffer = "";
      cursor = skipPunctuationUnits(state.units, cursor);
    }
    return refreshTypingError({
      ...state,
      cursor,
      typedBuffer,
      metrics,
      currentError: false
    });
  }

  metrics = bumpMetrics(metrics, {
    errorCount: metrics.errorCount + 1
  });
  return refreshTypingError({
    ...state,
    typedBuffer,
    metrics,
    currentError: true
  });
}

export function isPracticeComplete(state: PracticeState): boolean {
  return state.cursor >= state.units.length;
}

export function buildProgressSnapshot(
  state: PracticeState,
  now: number
): PracticeProgress {
  const totalChars = state.units.filter((u) => !u.isPunctuation).length;
  const stats = calcStats(state.metrics, totalChars, now);
  return {
    cursor: state.cursor,
    typedBuffer: state.typedBuffer,
    totalKeyCount: state.metrics.totalKeyCount,
    correctKeyCount: state.metrics.correctKeyCount,
    correctCharCount: state.metrics.correctCharCount,
    errorCount: state.metrics.errorCount,
    elapsedSec: (now - state.metrics.startedAt) / 1000,
    progress: stats.progress
  };
}

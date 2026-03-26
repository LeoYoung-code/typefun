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

function syllableHasErrorSoFar(typedBuffer: string, expectedRaw: string): boolean {
  for (let i = 0; i < typedBuffer.length; i += 1) {
    if (typedBuffer[i] !== expectedRaw[i]) return true;
  }
  return false;
}

function refreshTypingError(state: PracticeState): PracticeState {
  const current = state.units[state.cursor];
  if (!current || current.isPunctuation) {
    return { ...state, currentError: false };
  }
  if (!state.typedBuffer) {
    return { ...state, currentError: false };
  }
  const currentError = syllableHasErrorSoFar(state.typedBuffer, current.pinyinRaw);
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

  const failedSnapshots: Record<string, string> =
    restore?.failedSnapshots && typeof restore.failedSnapshots === "object"
      ? { ...restore.failedSnapshots }
      : {};

  const syllableEverWrong = Array.isArray(restore?.syllableEverWrong)
    ? [...restore.syllableEverWrong]
    : [];

  let state: PracticeState = {
    poem,
    units,
    cursor,
    typedBuffer,
    currentError: false,
    failedSnapshots,
    syllableEverWrong,
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
        const prevKey = String(newCursor);
        const failSnap = state.failedSnapshots[prevKey];
        if (failSnap !== undefined) {
          const nextFailed = { ...state.failedSnapshots };
          delete nextFailed[prevKey];
          const typedBuffer = failSnap.length <= 1 ? "" : failSnap.slice(0, -1);
          return refreshTypingError({
            ...state,
            cursor: newCursor,
            typedBuffer,
            failedSnapshots: nextFailed,
            syllableEverWrong: [],
            currentError: false
          });
        }
        const typedBuffer = prev.pinyinRaw.slice(0, -1);
        const metrics = bumpMetrics(state.metrics, {
          correctCharCount: Math.max(0, state.metrics.correctCharCount - 1)
        });
        return refreshTypingError({
          ...state,
          cursor: newCursor,
          typedBuffer,
          metrics,
          syllableEverWrong: [],
          currentError: false
        });
      }
    }
    return state;
  }

  const current = state.units[state.cursor];
  if (!current || current.isPunctuation) {
    return state;
  }

  if (!/^[a-z]$/.test(lower)) {
    return state;
  }

  const metrics = bumpMetrics(state.metrics, {
    totalKeyCount: state.metrics.totalKeyCount + 1
  });
  const typedBuffer = state.typedBuffer + lower;
  const expectedRaw = current.pinyinRaw;
  const pos = typedBuffer.length - 1;
  const keyOk = pos < expectedRaw.length && lower === expectedRaw[pos];

  let nextMetrics = keyOk
    ? bumpMetrics(metrics, { correctKeyCount: metrics.correctKeyCount + 1 })
    : bumpMetrics(metrics, { errorCount: metrics.errorCount + 1 });

  let nextSyllableEverWrong = state.syllableEverWrong;
  if (!keyOk) {
    const mask = [...state.syllableEverWrong];
    while (mask.length <= pos) mask.push(false);
    mask[pos] = true;
    nextSyllableEverWrong = mask;
  }

  if (typedBuffer.length >= expectedRaw.length) {
    let cursor = state.cursor + 1;
    cursor = skipPunctuationUnits(state.units, cursor);
    let failedSnapshots = { ...state.failedSnapshots };
    let allOk = true;
    for (let i = 0; i < expectedRaw.length; i += 1) {
      if (typedBuffer[i] !== expectedRaw[i]) {
        allOk = false;
        break;
      }
    }
    if (allOk) {
      nextMetrics = bumpMetrics(nextMetrics, {
        correctCharCount: nextMetrics.correctCharCount + 1
      });
    } else {
      failedSnapshots[String(state.cursor)] = typedBuffer;
    }
    return refreshTypingError({
      ...state,
      cursor,
      typedBuffer: "",
      metrics: nextMetrics,
      failedSnapshots,
      syllableEverWrong: [],
      currentError: false
    });
  }

  return refreshTypingError({
    ...state,
    typedBuffer,
    metrics: nextMetrics,
    syllableEverWrong: nextSyllableEverWrong
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
    syllableEverWrong: [...state.syllableEverWrong],
    failedSnapshots: { ...state.failedSnapshots },
    totalKeyCount: state.metrics.totalKeyCount,
    correctKeyCount: state.metrics.correctKeyCount,
    correctCharCount: state.metrics.correctCharCount,
    errorCount: state.metrics.errorCount,
    elapsedSec: (now - state.metrics.startedAt) / 1000,
    progress: stats.progress
  };
}

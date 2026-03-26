import type { PracticeState, Unit } from "./types.js";

/**
 * 从练习前后快照判断是否刚「正确完成一字」，返回该字（用于朗读）。
 * 与引擎约定一致：仅当 correctCharCount 增加时可能返回非空。
 */
export function extractCompletedHanzi(prev: PracticeState, next: PracticeState): string | null {
  if (next.metrics.correctCharCount <= prev.metrics.correctCharCount) return null;
  const u: Unit | undefined = prev.units[prev.cursor];
  if (!u || u.isPunctuation) return null;
  return u.char;
}

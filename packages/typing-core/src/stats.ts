import type { Metrics } from "./types.js";

export type StatsResult = {
  accuracy: number;
  kpm: number;
  cpm: number;
  correctCpm: number;
  progress: number;
};

export function calcStats(
  metrics: Metrics,
  totalChars: number,
  now: number = Date.now()
): StatsResult {
  const elapsedSec = Math.max(1, (now - metrics.startedAt) / 1000);
  const perMin = 60 / elapsedSec;
  const kpm = metrics.totalKeyCount * perMin;
  const cpm = metrics.correctCharCount * perMin;
  const correctCpm = metrics.correctCharCount * perMin;
  const accuracy =
    metrics.totalKeyCount === 0
      ? 100
      : (metrics.correctKeyCount / metrics.totalKeyCount) * 100;
  const progress =
    totalChars === 0 ? 0 : (metrics.correctCharCount / totalChars) * 100;

  return {
    accuracy,
    kpm,
    cpm,
    correctCpm,
    progress
  };
}

export function formatPercent(num: number): string {
  return `${Math.max(0, Math.min(100, num)).toFixed(0)}%`;
}

export function formatRate(num: number, unit: string): string {
  return `${Math.max(0, num).toFixed(0)} ${unit}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function scoreToStars(accuracy: number, cpm: number): number {
  if (accuracy >= 98 && cpm >= 45) return 5;
  if (accuracy >= 95 && cpm >= 35) return 4;
  if (accuracy >= 90 && cpm >= 25) return 3;
  if (accuracy >= 85 && cpm >= 18) return 2;
  return 1;
}

export function calcStats(metrics, totalChars) {
  const elapsedSec = Math.max(1, (Date.now() - metrics.startedAt) / 1000);
  const perMin = 60 / elapsedSec;
  const kpm = metrics.totalKeyCount * perMin;
  const cpm = metrics.correctCharCount * perMin;
  const correctCpm = metrics.correctCharCount * perMin;
  const accuracy = metrics.totalKeyCount === 0
    ? 100
    : (metrics.correctKeyCount / metrics.totalKeyCount) * 100;
  const progress = totalChars === 0 ? 0 : (metrics.correctCharCount / totalChars) * 100;

  return {
    accuracy,
    kpm,
    cpm,
    correctCpm,
    progress
  };
}

export function formatPercent(num) {
  return `${Math.max(0, Math.min(100, num)).toFixed(0)}%`;
}

export function formatRate(num, unit) {
  return `${Math.max(0, num).toFixed(0)} ${unit}`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

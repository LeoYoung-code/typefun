const STORAGE_KEY = "typefun.typing.zoom";

export const TYPING_ZOOM_MIN = 0.5;
export const TYPING_ZOOM_MAX = 1.5;
export const TYPING_ZOOM_STEP = 0.1;
export const TYPING_ZOOM_DEFAULT = 1;

function clamp(n: number): number {
  const x = Math.round(n * 100) / 100;
  return Math.min(TYPING_ZOOM_MAX, Math.max(TYPING_ZOOM_MIN, x));
}

export function loadTypingZoom(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null || v === "") return TYPING_ZOOM_DEFAULT;
    const n = Number(v);
    if (!Number.isFinite(n)) return TYPING_ZOOM_DEFAULT;
    return clamp(n);
  } catch {
    return TYPING_ZOOM_DEFAULT;
  }
}

export function saveTypingZoom(z: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clamp(z)));
  } catch {
    /* ignore */
  }
}

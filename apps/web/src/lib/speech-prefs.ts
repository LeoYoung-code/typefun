const KEY = "typefun.speech.enabled";

export function loadSpeechEnabled(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === null) return false;
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export function saveSpeechEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

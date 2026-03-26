const ENABLED_KEY = "typefun.keySound.enabled";
const PRESET_KEY = "typefun.keySound.presetId";

/** 默认开启键声（与朗读默认关不同，音效为即时反馈） */
export function loadKeySoundEnabled(): boolean {
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    if (v === null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

export function saveKeySoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadKeySoundPresetId(): string | null {
  try {
    const v = localStorage.getItem(PRESET_KEY);
    if (v === null || v === "") return null;
    return v;
  } catch {
    return null;
  }
}

export function saveKeySoundPresetId(id: string | null): void {
  try {
    if (id === null || id === "") localStorage.removeItem(PRESET_KEY);
    else localStorage.setItem(PRESET_KEY, id);
  } catch {
    /* ignore */
  }
}

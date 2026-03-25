const KEY = "typefun.speech.enabled";
const VOICE_KEY = "typefun.speech.voiceURI";

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

/** 朗读音色 voiceURI；null 表示系统默认 */
export function loadSpeechVoiceURI(): string | null {
  try {
    const v = localStorage.getItem(VOICE_KEY);
    if (v === null || v === "") return null;
    return v;
  } catch {
    return null;
  }
}

export function saveSpeechVoiceURI(uri: string | null): void {
  try {
    if (uri === null || uri === "") localStorage.removeItem(VOICE_KEY);
    else localStorage.setItem(VOICE_KEY, uri);
  } catch {
    /* ignore */
  }
}

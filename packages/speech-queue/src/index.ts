export type SpeechQueueOptions = {
  /** 例如 zh-CN */
  lang?: string;
  /** 待播队列上限；超出则丢弃最旧（队首），贴近最近打字 */
  maxPending?: number;
  /** 待播超过该条数时，一次合并多字为一句以追赶进度 */
  mergeThreshold?: number;
  mergeChunk?: number;
  /** 当前环境不支持 speechSynthesis 时最多触发一次 */
  onUnsupported?: () => void;
};

export type SpeechQueue = {
  enqueue(text: string): void;
  setEnabled(enabled: boolean): void;
  getEnabled(): boolean;
  cancel(): void;
  destroy(): void;
};

function getSynth(): SpeechSynthesis | null {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as unknown as { speechSynthesis?: SpeechSynthesis };
  return g.speechSynthesis ?? null;
}

/**
 * Web Speech API 朗读队列：完成序 FIFO；积压时合并、过长时丢队首。
 */
export function createSpeechQueue(options?: SpeechQueueOptions): SpeechQueue {
  const lang = options?.lang ?? "zh-CN";
  const maxPending = options?.maxPending ?? 20;
  const mergeThreshold = options?.mergeThreshold ?? 10;
  const mergeChunk = options?.mergeChunk ?? 6;
  const onUnsupported = options?.onUnsupported;

  const queue: string[] = [];
  let enabled = false;
  let speaking = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let unsupportedNotified = false;

  let visHandler: (() => void) | null = null;
  if (typeof document !== "undefined") {
    visHandler = () => {
      if (document.visibilityState === "hidden") {
        cancelInternal();
      }
    };
    document.addEventListener("visibilitychange", visHandler);
  }

  function clearWatchdog() {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  }

  function truncate() {
    while (queue.length > maxPending) {
      queue.shift();
    }
  }

  function takeNextUtteranceText(): string {
    if (queue.length === 0) return "";
    if (queue.length <= mergeThreshold) {
      return queue.shift() ?? "";
    }
    const n = Math.min(mergeChunk, queue.length);
    return queue.splice(0, n).join("");
  }

  function speakNext() {
    if (!enabled || speaking) return;
    const synth = getSynth();
    if (!synth) {
      if (!unsupportedNotified && onUnsupported) {
        unsupportedNotified = true;
        onUnsupported();
      }
      return;
    }
    const text = takeNextUtteranceText();
    if (!text) return;

    speaking = true;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const finish = () => {
      clearWatchdog();
      speaking = false;
      speakNext();
    };
    u.onend = finish;
    u.onerror = finish;
    watchdog = setTimeout(() => {
      clearWatchdog();
      speaking = false;
      speakNext();
    }, 15000);

    try {
      synth.speak(u);
    } catch {
      clearWatchdog();
      speaking = false;
      speakNext();
    }
  }

  function cancelInternal() {
    clearWatchdog();
    const synth = getSynth();
    if (synth) {
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
    }
    queue.length = 0;
    speaking = false;
  }

  function enqueue(text: string) {
    if (!enabled || !text) return;
    for (const ch of text) {
      queue.push(ch);
    }
    truncate();
    speakNext();
  }

  function setEnabled(v: boolean) {
    enabled = v;
    if (!v) {
      cancelInternal();
    }
  }

  function cancel() {
    cancelInternal();
  }

  function destroy() {
    cancelInternal();
    if (visHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", visHandler);
      visHandler = null;
    }
  }

  function getEnabled() {
    return enabled;
  }

  return { enqueue, setEnabled, getEnabled, cancel, destroy };
}

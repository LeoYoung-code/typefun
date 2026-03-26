export type SpeechQueueOptions = {
  /** 例如 zh-CN */
  lang?: string;
  /**
   * 指定发音人；空字符串或 null 表示由浏览器按语言选默认。
   * 值为 SpeechSynthesisVoice.voiceURI。
   */
  voiceURI?: string | null;
  /** 待播队列上限；超出则丢弃最旧（队首），贴近最近打字 */
  maxPending?: number;
  /** 待播超过该条数时，一次合并多字为一句以追赶进度 */
  mergeThreshold?: number;
  mergeChunk?: number;
  /** 当前环境不支持 speechSynthesis 时最多触发一次 */
  onUnsupported?: () => void;
};

export type SpeechVoiceOption = {
  /** 空字符串表示系统默认 */
  value: string;
  label: string;
};

export type SpeechQueue = {
  enqueue(text: string): void;
  setEnabled(enabled: boolean): void;
  getEnabled(): boolean;
  setVoiceURI(uri: string | null): void;
  getVoiceURI(): string | null;
  /** 队列已空且当前无在播 utterance 时 resolve（用于练习结束前播完最后一字） */
  waitUntilIdle(): Promise<void>;
  cancel(): void;
  destroy(): void;
};

function getSynth(): SpeechSynthesis | null {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as unknown as { speechSynthesis?: SpeechSynthesis };
  return g.speechSynthesis ?? null;
}

function langPrimary(lang: string): string {
  const i = lang.indexOf("-");
  return i === -1 ? lang : lang.slice(0, i);
}

/** 是否属于目标语言（如 zh-CN、zh-TW 均匹配 lang=zh-CN） */
export function speechVoiceMatchesLang(v: SpeechSynthesisVoice, lang: string): boolean {
  return v.lang.toLowerCase().startsWith(langPrimary(lang).toLowerCase());
}

export function getSpeechVoicesForLang(lang: string): SpeechSynthesisVoice[] {
  const synth = getSynth();
  if (!synth) return [];
  const seen = new Set<string>();
  const out: SpeechSynthesisVoice[] = [];
  for (const v of synth.getVoices()) {
    if (!speechVoiceMatchesLang(v, lang)) continue;
    if (seen.has(v.voiceURI)) continue;
    seen.add(v.voiceURI);
    out.push(v);
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return out;
}

/** 预设候选：在常见系统 TTS 名称上的宽松匹配，仅用于下拉前几项固定槽位 */
const VOICE_PRESET_SLOTS: Array<{ label: string; test: (v: SpeechSynthesisVoice) => boolean }> = [
  {
    label: "中文女声（优先）",
    test: (v) =>
      /女|Female|Mei|Xiaoxiao|Ting|Yu|Yaoyao|Hui|Xiao/i.test(v.name)
  },
  {
    label: "中文男声（优先）",
    test: (v) => /男|Male|Kang|Yun|Li|Han/i.test(v.name)
  }
];

/**
 * 构建音色下拉：系统默认 + 固定候选（若环境中有匹配）+ 其余同语言发音人。
 */
export function buildSpeechVoicePickerOptions(lang: string): SpeechVoiceOption[] {
  const list = getSpeechVoicesForLang(lang);
  const out: SpeechVoiceOption[] = [{ value: "", label: "系统默认" }];
  const used = new Set<string>([""]);

  for (const slot of VOICE_PRESET_SLOTS) {
    const hit = list.find((v) => slot.test(v) && !used.has(v.voiceURI));
    if (hit) {
      out.push({ value: hit.voiceURI, label: slot.label });
      used.add(hit.voiceURI);
    }
  }

  for (const v of list) {
    if (used.has(v.voiceURI)) continue;
    out.push({
      value: v.voiceURI,
      label: `${v.name}（${v.lang}）`
    });
    used.add(v.voiceURI);
  }
  return out;
}

/**
 * 若本地已存 voiceURI 不在列表中（列表尚未加载或音色已移除），补一条避免 select 失控。
 */
export function mergeOrphanSpeechVoiceOption(
  options: SpeechVoiceOption[],
  savedURI: string | null,
  lang: string
): SpeechVoiceOption[] {
  if (!savedURI || options.some((o) => o.value === savedURI)) return options;
  const synth = getSynth();
  const v = synth?.getVoices().find((x) => x.voiceURI === savedURI);
  if (v && speechVoiceMatchesLang(v, lang)) {
    return [
      ...options,
      { value: v.voiceURI, label: `${v.name}（${v.lang}）` }
    ];
  }
  return [
    ...options,
    { value: savedURI, label: "已保存音色（当前不可用）" }
  ];
}

/** voices 列表异步加载时订阅刷新（如填充下拉） */
export function subscribeSpeechVoices(callback: () => void): () => void {
  const synth = getSynth();
  if (!synth) return () => {};
  const run = () => callback();
  synth.addEventListener("voiceschanged", run);
  queueMicrotask(run);
  return () => synth.removeEventListener("voiceschanged", run);
}

function resolveVoice(voiceURI: string | null): SpeechSynthesisVoice | null {
  if (!voiceURI) return null;
  const synth = getSynth();
  if (!synth) return null;
  return synth.getVoices().find((v) => v.voiceURI === voiceURI) ?? null;
}

/**
 * Web Speech API 朗读队列：完成序 FIFO；积压时合并、过长时丢队首。
 */
export function createSpeechQueue(options?: SpeechQueueOptions): SpeechQueue {
  const lang = options?.lang ?? "zh-CN";
  let voiceURI: string | null = options?.voiceURI?.trim() || null;
  if (voiceURI === "") voiceURI = null;

  const maxPending = options?.maxPending ?? 20;
  const mergeThreshold = options?.mergeThreshold ?? 10;
  const mergeChunk = options?.mergeChunk ?? 6;
  const onUnsupported = options?.onUnsupported;

  const queue: string[] = [];
  let enabled = false;
  let speaking = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let unsupportedNotified = false;
  const idleResolvers: Array<() => void> = [];

  function maybeResolveIdle() {
    if (speaking || queue.length > 0) return;
    const batch = idleResolvers.splice(0);
    for (const fn of batch) {
      queueMicrotask(fn);
    }
  }

  function waitUntilIdle(): Promise<void> {
    return new Promise((resolve) => {
      if (!speaking && queue.length === 0) {
        queueMicrotask(resolve);
        return;
      }
      idleResolvers.push(resolve);
    });
  }

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
      queue.length = 0;
      maybeResolveIdle();
      return;
    }
    const text = takeNextUtteranceText();
    if (!text) {
      maybeResolveIdle();
      return;
    }

    speaking = true;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = resolveVoice(voiceURI);
    if (v) u.voice = v;

    const finish = () => {
      clearWatchdog();
      speaking = false;
      speakNext();
      queueMicrotask(() => maybeResolveIdle());
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
    maybeResolveIdle();
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

  function setVoiceURI(uri: string | null) {
    const t = uri?.trim() ?? "";
    voiceURI = t === "" ? null : t;
  }

  function getVoiceURI() {
    return voiceURI;
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

  return {
    enqueue,
    setEnabled,
    getEnabled,
    setVoiceURI,
    getVoiceURI,
    waitUntilIdle,
    cancel,
    destroy
  };
}

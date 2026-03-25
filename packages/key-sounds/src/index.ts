/**
 * Web Audio–based mechanical key sounds: load short samples from static URLs,
 * randomize per stroke, respect enable/preset.
 */

export type KeySoundKind = "key" | "backspace" | "error";

export type KeySoundManifest = {
  version: 1;
  /** 输错字母时播放，路径相对 manifest 所在目录 */
  errorSample?: string;
  presets: KeySoundPresetDef[];
};

export type KeySoundPresetDef = {
  id: string;
  label: string;
  keys: string[];
  backspace?: string;
};

export type CreateKeySoundEngineOptions = {
  /** Resolved URL to manifest.json */
  manifestUrl: string | URL;
  /** Max overlapping sources (fast typing). */
  maxPolyphony?: number;
};

export type KeySoundEngine = {
  /** Load manifest + decode all presets (idempotent per preset). */
  init(): Promise<void>;
  /** Call after first user gesture if audio was suspended. */
  unlock(): Promise<void>;
  setEnabled(on: boolean): void;
  getEnabled(): boolean;
  setPresetId(id: string | null): void;
  getPresetId(): string | null;
  play(kind: KeySoundKind): void;
  dispose(): void;
};

const DEFAULT_POLY = 6;

function pickRandom<T>(xs: T[]): T | undefined {
  if (!xs.length) return undefined;
  return xs[Math.floor(Math.random() * xs.length)];
}

export function createKeySoundEngine(options: CreateKeySoundEngineOptions): KeySoundEngine {
  const maxPolyphony = options.maxPolyphony ?? DEFAULT_POLY;
  let ctx: AudioContext | null = null;
  let manifest: KeySoundManifest | null = null;
  const buffersByPreset = new Map<string, Map<string, AudioBuffer>>();
  let errorBuffer: AudioBuffer | null = null;
  let enabled = true;
  let presetId: string | null = null;
  let activeSources = 0;

  function getCtx(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext();
    }
    return ctx;
  }

  const manifestHref = options.manifestUrl instanceof URL ? options.manifestUrl.href : String(options.manifestUrl);

  /** Paths in manifest are relative to the manifest file's directory. */
  function resolveUrl(rel: string): string {
    const baseDir = new URL("./", manifestHref);
    return new URL(rel.replace(/^\//, ""), baseDir).href;
  }

  async function loadBuffer(url: string): Promise<AudioBuffer> {
    const c = getCtx();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`key-sounds: failed to load ${url}: ${res.status}`);
    const arr = await res.arrayBuffer();
    return await c.decodeAudioData(arr.slice(0));
  }

  async function ensurePresetBuffers(preset: KeySoundPresetDef): Promise<void> {
    if (buffersByPreset.has(preset.id)) return;
    const map = new Map<string, AudioBuffer>();
    const keys = [...preset.keys];
    if (preset.backspace) keys.push(preset.backspace);
    for (const rel of keys) {
      const url = resolveUrl(rel);
      if (map.has(rel)) continue;
      const buf = await loadBuffer(url);
      map.set(rel, buf);
    }
    buffersByPreset.set(preset.id, map);
  }

  async function init(): Promise<void> {
    const res = await fetch(manifestHref);
    if (!res.ok) throw new Error(`key-sounds: manifest ${res.status}`);
    manifest = (await res.json()) as KeySoundManifest;
    if (!manifest.presets?.length) throw new Error("key-sounds: empty manifest");
    if (!presetId) presetId = manifest.presets[0]?.id ?? null;
    const tasks: Promise<void>[] = manifest.presets.map((p) => ensurePresetBuffers(p));
    if (manifest.errorSample) {
      tasks.push(
        loadBuffer(resolveUrl(manifest.errorSample)).then((b) => {
          errorBuffer = b;
        })
      );
    }
    await Promise.all(tasks);
  }

  async function unlock(): Promise<void> {
    const c = getCtx();
    if (c.state === "suspended") {
      await c.resume();
    }
  }

  function setEnabled(on: boolean): void {
    enabled = on;
  }

  function getEnabled(): boolean {
    return enabled;
  }

  function setPresetId(id: string | null): void {
    presetId = id;
  }

  function getPresetId(): string | null {
    return presetId;
  }

  function play(kind: KeySoundKind): void {
    if (!enabled || !manifest) return;

    if (kind === "error") {
      if (!errorBuffer) return;
      if (activeSources >= maxPolyphony) return;
      const c = getCtx();
      if (c.state === "suspended") return;
      const src = c.createBufferSource();
      const gain = c.createGain();
      gain.gain.value = 0.42;
      src.buffer = errorBuffer;
      src.connect(gain);
      gain.connect(c.destination);
      activeSources += 1;
      src.onended = () => {
        activeSources -= 1;
      };
      src.start();
      return;
    }

    const pdef = manifest.presets.find((x) => x.id === presetId) ?? manifest.presets[0];
    if (!pdef) return;
    const map = buffersByPreset.get(pdef.id);
    if (!map) return;

    let rel: string | undefined;
    if (kind === "backspace" && pdef.backspace) {
      rel = pdef.backspace;
    } else {
      rel = pickRandom(pdef.keys);
    }
    if (!rel) rel = pickRandom(pdef.keys);
    if (!rel) return;

    const buffer = map.get(rel);
    if (!buffer) return;

    if (activeSources >= maxPolyphony) return;

    const c = getCtx();
    if (c.state === "suspended") return;

    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = 0.35;
    src.buffer = buffer;
    src.connect(gain);
    gain.connect(c.destination);
    activeSources += 1;
    src.onended = () => {
      activeSources -= 1;
    };
    src.start();
  }

  function dispose(): void {
    if (ctx) {
      void ctx.close();
      ctx = null;
    }
    buffersByPreset.clear();
    errorBuffer = null;
    manifest = null;
    activeSources = 0;
  }

  return {
    init,
    unlock,
    setEnabled,
    getEnabled,
    setPresetId,
    getPresetId,
    play,
    dispose
  };
}

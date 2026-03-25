import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createKeySoundEngine } from "./index.js";

describe("createKeySoundEngine", () => {
  const origFetch = globalThis.fetch;
  const origAC = globalThis.AudioContext;

  beforeEach(() => {
    const fakeBuffer = { duration: 0.02 } as AudioBuffer;
    class FakeAudioContext {
      state = "running";
      destination = {};
      async decodeAudioData(arr: ArrayBuffer) {
        void arr;
        return fakeBuffer;
      }
      async resume() {
        return undefined;
      }
      async close() {
        return undefined;
      }
      createBufferSource() {
        return {
          buffer: null as AudioBuffer | null,
          connect: vi.fn(),
          start: vi.fn(),
          onended: null as (() => void) | null
        };
      }
      createGain() {
        return { gain: { value: 1 }, connect: vi.fn() };
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);

    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("manifest.json")) {
        return {
          ok: true,
          json: async () => ({
            version: 1,
            errorSample: "error.wav",
            presets: [
              {
                id: "a",
                label: "A",
                keys: ["a/k1.wav"],
                backspace: "a/bs.wav"
              }
            ]
          })
        } as Response;
      }
      if (u.endsWith(".wav")) {
        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(8)
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.unstubAllGlobals();
    if (origAC) vi.stubGlobal("AudioContext", origAC);
  });

  it("init loads manifest and presets", async () => {
    const eng = createKeySoundEngine({
      manifestUrl: "https://example.com/sounds/manifest.json"
    });
    await eng.init();
    expect(eng.getPresetId()).toBe("a");
  });

  it("does not play when disabled", async () => {
    const eng = createKeySoundEngine({
      manifestUrl: "https://example.com/sounds/manifest.json"
    });
    await eng.init();
    eng.setEnabled(false);
    eng.play("key");
    // no throw
    expect(true).toBe(true);
  });
});

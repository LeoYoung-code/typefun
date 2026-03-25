import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createSpeechQueue } from "./index.js";

describe("createSpeechQueue", () => {
  const spoken: string[] = [];

  beforeEach(() => {
    spoken.length = 0;
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        lang = "";
        onend: ((ev: SpeechSynthesisEvent) => void) | null = null;
        onerror: ((ev: SpeechSynthesisEvent) => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      }
    );
    const speak = vi.fn((u: SpeechSynthesisUtterance) => {
      spoken.push(u.text);
      queueMicrotask(() => u.onend?.({} as SpeechSynthesisEvent));
    });
    const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", {
      speak,
      cancel,
      getVoices: () => [],
      pause: vi.fn(),
      resume: vi.fn(),
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as SpeechSynthesis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not speak when disabled", () => {
    const q = createSpeechQueue();
    q.enqueue("春");
    expect(spoken).toEqual([]);
  });

  it("speaks FIFO when enabled", async () => {
    const q = createSpeechQueue({ mergeThreshold: 100 });
    q.setEnabled(true);
    q.enqueue("春");
    q.enqueue("眠");
    await vi.waitFor(() => spoken.length >= 2);
    expect(spoken[0]).toBe("春");
    expect(spoken[1]).toBe("眠");
  });

  it("merges multiple chars when backlog exceeds mergeThreshold", async () => {
    const q = createSpeechQueue({
      mergeThreshold: 0,
      mergeChunk: 4,
      maxPending: 50
    });
    q.setEnabled(true);
    q.enqueue("一二三四");
    await vi.waitFor(() => spoken.length >= 1);
    expect(spoken[0]).toBe("一二三四");
  });
});

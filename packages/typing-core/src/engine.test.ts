import { describe, expect, it } from "vitest";
import {
  applyPracticeKey,
  buildProgressSnapshot,
  createPracticeState,
  isPracticeComplete
} from "./engine.js";
import type { Poem } from "./types.js";

const mini: Poem = {
  id: "t",
  title: "测",
  author: "测",
  unlocked: true,
  lines: [
    {
      hanzi: ["床", "，"],
      pinyin: ["chuáng", ""]
    }
  ]
};

const punctFirst: Poem = {
  id: "p",
  title: "标",
  author: "测",
  unlocked: true,
  lines: [
    {
      hanzi: ["，", "床"],
      pinyin: ["", "chuáng"]
    }
  ]
};

describe("createPracticeState", () => {
  it("skips leading punctuation", () => {
    const s = createPracticeState(punctFirst, null, 1_000_000);
    expect(s.units[s.cursor].char).toBe("床");
  });
});

describe("applyPracticeKey", () => {
  it("completes one syllable", () => {
    let s = createPracticeState(mini, null, 1_000_000);
    for (const ch of "chuang") {
      s = applyPracticeKey(s, ch, 1_000_000);
    }
    expect(s.cursor).toBeGreaterThan(0);
    expect(s.typedBuffer).toBe("");
  });

  it("wrong letter stays on unit and moves to next letter slot", () => {
    let s = createPracticeState(mini, null, 1_000_000);
    s = applyPracticeKey(s, "x", 1_000_000);
    expect(s.cursor).toBe(0);
    expect(s.typedBuffer).toBe("x");
    expect(s.currentError).toBe(true);
    expect(s.failedSnapshots["0"]).toBeUndefined();
  });

  it("backspace shrinks buffer", () => {
    let s = createPracticeState(mini, null, 1_000_000);
    s = applyPracticeKey(s, "c", 1_000_000);
    s = applyPracticeKey(s, "backspace", 1_000_000);
    expect(s.typedBuffer).toBe("");
    expect(s.currentError).toBe(false);
  });

  it("backspace after wrong letter clears buffer on same unit", () => {
    let s = createPracticeState(mini, null, 1_000_000);
    s = applyPracticeKey(s, "x", 1_000_000);
    expect(s.cursor).toBe(0);
    s = applyPracticeKey(s, "backspace", 1_000_000);
    expect(s.cursor).toBe(0);
    expect(s.typedBuffer).toBe("");
    expect(s.failedSnapshots["0"]).toBeUndefined();
  });

  it("stores failed snapshot when syllable completes with a wrong key", () => {
    let s = createPracticeState(mini, null, 1_000_000);
    for (const ch of "xhuang") {
      s = applyPracticeKey(s, ch, 1_000_000);
    }
    expect(s.failedSnapshots["0"]).toBe("xhuang");
    expect(s.cursor).toBeGreaterThan(0);
  });
});

describe("isPracticeComplete", () => {
  it("true when cursor past end", () => {
    const oneChar: Poem = {
      id: "o",
      title: "一",
      author: "测",
      lines: [{ hanzi: ["啊"], pinyin: ["a"] }]
    };
    let s = createPracticeState(oneChar, null, 0);
    s = applyPracticeKey(s, "a", 1000);
    expect(isPracticeComplete(s)).toBe(true);
  });
});

describe("buildProgressSnapshot", () => {
  it("includes progress fields", () => {
    const s = createPracticeState(mini, null, 10_000);
    const p = buildProgressSnapshot(s, 20_000);
    expect(p.cursor).toBe(s.cursor);
    expect(typeof p.progress).toBe("number");
  });
});

import { describe, expect, it } from "vitest";
import { applyPracticeKey, createPracticeState } from "./engine.js";
import { extractCompletedHanzi } from "./completed-hanzi.js";
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

describe("extractCompletedHanzi", () => {
  it("returns hanzi when a character is completed correctly", () => {
    let s = createPracticeState(mini, null, 1_000_000);
    const prev = s;
    for (const ch of "chuang") {
      s = applyPracticeKey(s, ch, 1_000_000);
    }
    expect(extractCompletedHanzi(prev, s)).toBe("床");
  });

  it("returns null when syllable completes with errors", () => {
    let s = createPracticeState(mini, null, 1_000_000);
    for (const ch of "xhuang") {
      const prev = s;
      s = applyPracticeKey(s, ch, 1_000_000);
      if (ch === "g") {
        expect(extractCompletedHanzi(prev, s)).toBeNull();
      }
    }
  });
});

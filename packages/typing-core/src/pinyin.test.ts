import { describe, expect, it } from "vitest";
import { normalizePinyin, pinyinDisplayLetters } from "./pinyin.js";

describe("pinyinDisplayLetters", () => {
  it("与 normalize 等长且保留声调", () => {
    const py = "qǔ";
    const raw = normalizePinyin(py);
    const disp = pinyinDisplayLetters(py);
    expect(disp.join("")).toBe("qǔ");
    expect(disp.length).toBe(raw.length);
    expect(raw).toBe("qu");
  });

  it("多字母音节", () => {
    const py = "xiāng";
    expect(pinyinDisplayLetters(py).join("")).toBe("xiāng");
    expect(pinyinDisplayLetters(py).length).toBe(normalizePinyin(py).length);
  });

  it("yī 类音节", () => {
    expect(pinyinDisplayLetters("yī").join("")).toBe("yī");
  });

  it("空字符串", () => {
    expect(pinyinDisplayLetters("")).toEqual([]);
  });
});

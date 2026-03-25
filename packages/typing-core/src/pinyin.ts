import type { Poem, Unit } from "./types.js";

const TONE_MAP: Record<string, string> = {
  ā: "a",
  á: "a",
  ǎ: "a",
  à: "a",
  ē: "e",
  é: "e",
  ě: "e",
  è: "e",
  ī: "i",
  í: "i",
  ǐ: "i",
  ì: "i",
  ō: "o",
  ó: "o",
  ǒ: "o",
  ò: "o",
  ū: "u",
  ú: "u",
  ǔ: "u",
  ù: "u",
  ǖ: "v",
  ǘ: "v",
  ǚ: "v",
  ǜ: "v",
  ü: "v"
};

const PUNCTUATION = new Set([
  "，",
  "。",
  "！",
  "？",
  "；",
  "：",
  "、",
  "“",
  "”",
  "‘",
  "’"
]);

export function normalizePinyin(py: string): string {
  if (!py) return "";
  return [...py.toLowerCase()]
    .map((ch) => TONE_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-zv]/g, "");
}

/** 与 {@link normalizePinyin} 逐字一一对应，用于 UI 展示（保留声调、ü 等）。 */
export function pinyinDisplayLetters(py: string): string[] {
  if (!py) return [];
  const letters: string[] = [];
  for (const ch of py.toLowerCase()) {
    if (TONE_MAP[ch] !== undefined) {
      letters.push(ch);
      continue;
    }
    if (/[a-z]/.test(ch)) {
      letters.push(ch);
    }
  }
  const raw = normalizePinyin(py);
  if (letters.length !== raw.length) {
    return [...raw];
  }
  return letters;
}

export function isPunctuation(char: string): boolean {
  return PUNCTUATION.has(char);
}

export function flattenPoem(poem: Poem): Unit[] {
  const units: Unit[] = [];
  poem.lines.forEach((line, lineIndex) => {
    line.hanzi.forEach((char, idx) => {
      const pinyin = line.pinyin[idx] ?? "";
      units.push({
        lineIndex,
        char,
        pinyin,
        pinyinRaw: normalizePinyin(pinyin),
        isPunctuation: isPunctuation(char)
      });
    });
  });
  return units;
}

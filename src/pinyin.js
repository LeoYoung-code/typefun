const TONE_MAP = {
  ā: "a", á: "a", ǎ: "a", à: "a",
  ē: "e", é: "e", ě: "e", è: "e",
  ī: "i", í: "i", ǐ: "i", ì: "i",
  ō: "o", ó: "o", ǒ: "o", ò: "o",
  ū: "u", ú: "u", ǔ: "u", ù: "u",
  ǖ: "v", ǘ: "v", ǚ: "v", ǜ: "v",
  ü: "v"
};

const PUNCTUATION = new Set(["，", "。", "！", "？", "；", "：", "、", "“", "”", "‘", "’"]);

export function normalizePinyin(py) {
  if (!py) return "";
  return [...py.toLowerCase()]
    .map((ch) => TONE_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-zv]/g, "");
}

export function isPunctuation(char) {
  return PUNCTUATION.has(char);
}

export function flattenPoem(poem) {
  const units = [];
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

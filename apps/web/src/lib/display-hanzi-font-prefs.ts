import { reactive } from "vue";

const STORAGE_KEY = "typefun.display.hanziFont";

export type DisplayHanziFontId =
  | "system"
  | "songti"
  | "kaiti"
  | "xingkai"
  | "fangsong"
  | "heiti";

export const DISPLAY_HANZI_FONT_OPTIONS: { id: DisplayHanziFontId; label: string }[] = [
  { id: "system", label: "系统默认" },
  { id: "songti", label: "宋体" },
  { id: "kaiti", label: "楷体" },
  { id: "xingkai", label: "行楷" },
  { id: "fangsong", label: "仿宋" },
  { id: "heiti", label: "黑体" }
];

const VALID = new Set<string>(DISPLAY_HANZI_FONT_OPTIONS.map((o) => o.id));

export function loadDisplayHanziFontId(): DisplayHanziFontId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && VALID.has(v)) return v as DisplayHanziFontId;
  } catch {
    /* ignore */
  }
  return "system";
}

export function saveDisplayHanziFontId(id: DisplayHanziFontId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function applyDisplayHanziFontToDocument(id: DisplayHanziFontId): void {
  document.documentElement.dataset.displayHanziFont = id;
}

/** 练习区汉字格所用展示字体，与 localStorage 同步 */
export const displayHanziFont = reactive({
  id: loadDisplayHanziFontId() as DisplayHanziFontId
});

export function initDisplayHanziFontDom(): void {
  displayHanziFont.id = loadDisplayHanziFontId();
  applyDisplayHanziFontToDocument(displayHanziFont.id);
}

export function setDisplayHanziFontId(id: DisplayHanziFontId): void {
  displayHanziFont.id = id;
  saveDisplayHanziFontId(id);
  applyDisplayHanziFontToDocument(id);
}

export function onDisplayHanziFontSelectChange(ev: Event): void {
  const el = ev.target as HTMLSelectElement;
  setDisplayHanziFontId(el.value as DisplayHanziFontId);
}

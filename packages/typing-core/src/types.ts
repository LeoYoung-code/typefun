export type PoemLine = {
  hanzi: string[];
  pinyin: string[];
};

/** 体裁：与 `data/poems.json` 中 `category` 字段一致 */
export type PoemCategory = "tang" | "song_ci";

export const POEM_CATEGORY_LABELS: Record<PoemCategory, string> = {
  tang: "唐诗",
  song_ci: "宋词"
};

/** 列表分页用（无正文），与 API `GET /api/poems` 条目一致 */
export type PoemListItem = {
  id: string;
  title: string;
  author: string;
  category?: PoemCategory;
  stars?: number;
  unlocked?: boolean;
};

export type Poem = {
  id: string;
  title: string;
  author: string;
  /** 未标注时视为唐诗（兼容旧数据与测试夹具） */
  category?: PoemCategory;
  stars?: number;
  unlocked?: boolean;
  lines: PoemLine[];
};

export type Unit = {
  lineIndex: number;
  char: string;
  pinyin: string;
  pinyinRaw: string;
  isPunctuation: boolean;
};

export type Metrics = {
  startedAt: number;
  totalKeyCount: number;
  correctKeyCount: number;
  correctCharCount: number;
  errorCount: number;
};

export type PracticeProgress = {
  cursor: number;
  typedBuffer: string;
  /** 当前音节内各字母位置是否曾在本次输入中打错过（退格后重打对仍保留，用于 UI 黄色） */
  syllableEverWrong?: boolean[];
  /** 整字已打完但含错键：unit 下标 → 该字全部按键序列（逐字母着色） */
  failedSnapshots?: Record<string, string>;
  totalKeyCount: number;
  correctKeyCount: number;
  correctCharCount: number;
  errorCount: number;
  elapsedSec: number;
  progress: number;
};

export type PracticeState = {
  poem: Poem;
  units: Unit[];
  cursor: number;
  typedBuffer: string;
  currentError: boolean;
  failedSnapshots: Record<string, string>;
  /** 与 PracticeProgress.syllableEverWrong 一致，仅当前 cursor 音节有效 */
  syllableEverWrong: boolean[];
  metrics: Metrics;
};

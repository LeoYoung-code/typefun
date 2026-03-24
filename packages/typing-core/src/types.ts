export type PoemLine = {
  hanzi: string[];
  pinyin: string[];
};

export type Poem = {
  id: string;
  title: string;
  author: string;
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
  metrics: Metrics;
};

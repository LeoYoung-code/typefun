import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Poem, PoemCategory, PoemListItem } from "@typefun/typing-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(__dirname, "../../../data");
const corpusIndexPath = join(dataRoot, "corpus/index.json");
const corpusShardsDir = join(dataRoot, "corpus/shards");
const legacyPoemsPath = join(dataRoot, "poems.json");

export type PoemsPage = {
  items: PoemListItem[];
  total: number;
  page: number;
  pageSize: number;
};

type IndexEntry = {
  id: string;
  title: string;
  author: string;
  category: PoemCategory;
  shard: string;
  offset: number;
};

type CorpusIndexFile = {
  version: number;
  entries: IndexEntry[];
};

function toListItem(p: Poem): PoemListItem {
  return {
    id: p.id,
    title: p.title,
    author: p.author,
    category: p.category,
    stars: p.stars,
    unlocked: p.unlocked
  };
}

function loadLegacyPoems(): Poem[] {
  const raw = readFileSync(legacyPoemsPath, "utf8");
  return JSON.parse(raw) as Poem[];
}

const shardCache = new Map<string, Poem[]>();

function readShard(shardName: string): Poem[] {
  const cached = shardCache.get(shardName);
  if (cached) return cached;
  const path = join(corpusShardsDir, `${shardName}.json`);
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as { poems: Poem[] };
  shardCache.set(shardName, parsed.poems);
  return parsed.poems;
}

export class PoemRepository {
  private readonly mode: "corpus" | "legacy";
  private readonly legacyPoems: Poem[] | null;
  private readonly entries: IndexEntry[];
  private readonly byId = new Map<string, IndexEntry>();

  constructor() {
    if (existsSync(corpusIndexPath)) {
      const idx = JSON.parse(
        readFileSync(corpusIndexPath, "utf8")
      ) as CorpusIndexFile;
      this.mode = "corpus";
      this.legacyPoems = null;
      this.entries = idx.entries;
      for (const e of this.entries) {
        this.byId.set(e.id, e);
      }
    } else {
      this.mode = "legacy";
      this.legacyPoems = loadLegacyPoems();
      this.entries = [];
    }
  }

  listPage(
    page: number,
    pageSize: number,
    category: "all" | PoemCategory
  ): PoemsPage {
    const pg = Math.max(1, page);
    const size = Math.min(100, Math.max(1, pageSize));
    if (this.mode === "legacy") {
      const list = this.legacyPoems!;
      const filtered =
        category === "all"
          ? list
          : list.filter((p) => (p.category ?? "tang") === category);
      const total = filtered.length;
      const start = (pg - 1) * size;
      const slice = filtered.slice(start, start + size).map(toListItem);
      return { items: slice, total, page: pg, pageSize: size };
    }
    const filtered =
      category === "all"
        ? this.entries
        : this.entries.filter((e) => e.category === category);
    const total = filtered.length;
    const start = (pg - 1) * size;
    const slice = filtered.slice(start, start + size).map((e) => ({
      id: e.id,
      title: e.title,
      author: e.author,
      category: e.category,
      stars: 0,
      unlocked: true
    }));
    return { items: slice, total, page: pg, pageSize: size };
  }

  getById(id: string): Poem | null {
    if (this.mode === "legacy") {
      return this.legacyPoems!.find((p) => p.id === id) ?? null;
    }
    const e = this.byId.get(id);
    if (!e) return null;
    const poems = readShard(e.shard);
    const poem = poems[e.offset];
    if (!poem || poem.id !== id) return null;
    return poem;
  }

  randomSummary(category: "all" | PoemCategory): PoemListItem | null {
    if (this.mode === "legacy") {
      const list = this.legacyPoems!;
      const filtered =
        category === "all"
          ? list
          : list.filter((p) => (p.category ?? "tang") === category);
      if (!filtered.length) return null;
      const i = Math.floor(Math.random() * filtered.length);
      return toListItem(filtered[i]!);
    }
    const filtered =
      category === "all"
        ? this.entries
        : this.entries.filter((e) => e.category === category);
    if (!filtered.length) return null;
    const i = Math.floor(Math.random() * filtered.length);
    const e = filtered[i]!;
    return {
      id: e.id,
      title: e.title,
      author: e.author,
      category: e.category,
      stars: 0,
      unlocked: true
    };
  }

  totalCount(category: "all" | PoemCategory): number {
    if (this.mode === "legacy") {
      const list = this.legacyPoems!;
      if (category === "all") return list.length;
      return list.filter((p) => (p.category ?? "tang") === category).length;
    }
    if (category === "all") return this.entries.length;
    return this.entries.filter((e) => e.category === category).length;
  }
}

type RepoCache = {
  repo: PoemRepository;
  /** 使用语料库索引时的 mtime；否则为 null */
  corpusMtime: number | null;
  /** 回退 poems.json 时的 mtime；否则为 null */
  legacyMtime: number | null;
};

let repoCache: RepoCache | null = null;

function currentSourceMtime(): { corpusMtime: number | null; legacyMtime: number | null } {
  if (existsSync(corpusIndexPath)) {
    return { corpusMtime: statSync(corpusIndexPath).mtimeMs, legacyMtime: null };
  }
  return {
    corpusMtime: null,
    legacyMtime: statSync(legacyPoemsPath).mtimeMs
  };
}

/**
 * 每次请求前对比数据文件 mtime，语料更新后无需重启 API（tsx watch 重编译仍会换进程，但手工改 corpus 时常遇单例陈旧）。
 */
export function getPoemRepository(): PoemRepository {
  const { corpusMtime, legacyMtime } = currentSourceMtime();
  if (
    !repoCache ||
    repoCache.corpusMtime !== corpusMtime ||
    repoCache.legacyMtime !== legacyMtime
  ) {
    shardCache.clear();
    repoCache = {
      repo: new PoemRepository(),
      corpusMtime,
      legacyMtime
    };
  }
  return repoCache.repo;
}

#!/usr/bin/env node
/**
 * --seed     从 data/poems.json 生成 data/corpus（开发/CI 小样本）
 * --full     从 vendor/chinese-poetry 导入（需先 clone 仓库）
 * --max=N    与 --full 合用：最多导入 N 首（默认唐诗/宋词各约一半）
 * --vendor=  覆盖 chinese-poetry 根目录，默认 <repo>/vendor/chinese-poetry
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pinyin } from "pinyin-pro";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const corpusDir = join(root, "data/corpus");
const shardDir = join(corpusDir, "shards");

const PUNCT = new Set([
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
  "’",
  "…",
  "—",
  "《",
  "》",
  "（",
  "）",
  "·"
]);

function isPunct(ch) {
  return PUNCT.has(ch) || /\s/.test(ch);
}

function lineToPoemLine(text) {
  const hanzi = [...text];
  const py = hanzi.map((ch) => {
    if (isPunct(ch)) return "";
    try {
      return pinyin(ch, { toneType: "symbol" }) || "";
    } catch {
      return "";
    }
  });
  return { hanzi, pinyin: py };
}

function paragraphsToLines(paragraphs) {
  const out = [];
  for (const p of paragraphs) {
    if (!p || !String(p).trim()) continue;
    const pl = lineToPoemLine(String(p).trim());
    if (pl.hanzi.length) out.push(pl);
  }
  return out;
}

function seedFromPoemsJson() {
  const poems = JSON.parse(
    readFileSync(join(root, "data/poems.json"), "utf8")
  );
  if (existsSync(shardDir)) {
    rmSync(shardDir, { recursive: true });
  }
  mkdirSync(shardDir, { recursive: true });
  const shardName = "shard-00000";
  writeFileSync(
    join(shardDir, `${shardName}.json`),
    JSON.stringify({ poems }, null, 0)
  );
  const entries = poems.map((p, i) => ({
    id: p.id,
    title: p.title,
    author: p.author,
    category: p.category ?? "tang",
    shard: shardName,
    offset: i
  }));
  mkdirSync(corpusDir, { recursive: true });
  writeFileSync(
    join(corpusDir, "index.json"),
    JSON.stringify({ version: 1, entries }, null, 0)
  );
  console.log(`[corpus:seed] wrote ${entries.length} entries → data/corpus/`);
}

const SHARD_CAP = 400;

/**
 * @param {string} vendorRoot
 * @param {{ max?: number }} opts max 有值时：唐诗约 ceil(max/2)、宋词约 floor(max/2)，凑满即停
 */
function importFull(vendorRoot, opts = {}) {
  const maxTotal = opts.max;
  const capTang =
    typeof maxTotal === "number" && Number.isFinite(maxTotal)
      ? Math.ceil(maxTotal / 2)
      : Infinity;
  const capSong =
    typeof maxTotal === "number" && Number.isFinite(maxTotal)
      ? Math.floor(maxTotal / 2)
      : Infinity;

  const tangDir = join(vendorRoot, "全唐诗");
  const songDir = join(vendorRoot, "宋词");
  const tangFiles = readdirSync(tangDir)
    .filter((f) => /^poet\.tang\.\d+\.json$/.test(f))
    .sort()
    .map((f) => join(tangDir, f));
  const ciFiles = readdirSync(songDir)
    .filter((f) => /^ci\.song\.\d+\.json$/.test(f))
    .sort()
    .map((f) => join(songDir, f));

  if (tangFiles.length === 0 || ciFiles.length === 0) {
    console.error(
      "[corpus:full] 未找到 全唐诗/poet.tang.*.json 或 宋词/ci.song.*.json，请确认 vendor 路径正确。"
    );
    process.exit(1);
  }

  if (existsSync(shardDir)) {
    rmSync(shardDir, { recursive: true });
  }
  mkdirSync(shardDir, { recursive: true });
  mkdirSync(corpusDir, { recursive: true });

  const entries = [];
  let shardIdx = 0;
  let shardPoems = [];

  function flushShard() {
    if (!shardPoems.length) return;
    const name = `shard-${String(shardIdx).padStart(5, "0")}`;
    writeFileSync(
      join(shardDir, `${name}.json`),
      JSON.stringify({ poems: shardPoems }, null, 0)
    );
    shardIdx += 1;
    shardPoems = [];
  }

  function pushPoem(poem) {
    if (shardPoems.length >= SHARD_CAP) flushShard();
    const name = `shard-${String(shardIdx).padStart(5, "0")}`;
    const offset = shardPoems.length;
    entries.push({
      id: poem.id,
      title: poem.title,
      author: poem.author,
      category: poem.category,
      shard: name,
      offset
    });
    shardPoems.push(poem);
  }

  let tangCount = 0;
  outerTang: for (const file of tangFiles) {
    if (tangCount >= capTang) break outerTang;
    const arr = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      if (tangCount >= capTang) break outerTang;
      const raw = arr[i];
      const lines = paragraphsToLines(raw.paragraphs ?? []);
      if (!lines.length) continue;
      const id = raw.id ? `tang-${raw.id}` : `tang-${file}-${i}`;
      const poem = {
        id,
        category: /** @type {const} */ ("tang"),
        title: raw.title?.trim() || "无题",
        author: `唐 · ${raw.author?.trim() || "佚名"}`,
        stars: 0,
        unlocked: true,
        lines
      };
      pushPoem(poem);
      tangCount += 1;
      if (tangCount % 2000 === 0) {
        console.log(`[corpus:full] 唐诗 ${tangCount} …`);
      }
    }
  }

  let ciCount = 0;
  outerSong: for (const file of ciFiles) {
    if (ciCount >= capSong) break outerSong;
    const arr = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      if (ciCount >= capSong) break outerSong;
      const raw = arr[i];
      const lines = paragraphsToLines(raw.paragraphs ?? []);
      if (!lines.length) continue;
      const id = `songci-${basename(file, ".json")}-${i}`;
      const title = (raw.rhythmic || raw.title || "无题").trim();
      const poem = {
        id,
        category: /** @type {const} */ ("song_ci"),
        title,
        author: `宋 · ${raw.author?.trim() || "佚名"}`,
        stars: 0,
        unlocked: true,
        lines
      };
      pushPoem(poem);
      ciCount += 1;
      if (ciCount % 1000 === 0) {
        console.log(`[corpus:full] 宋词 ${ciCount} …`);
      }
    }
  }

  flushShard();
  writeFileSync(
    join(corpusDir, "index.json"),
    JSON.stringify({ version: 1, entries }, null, 0)
  );
  console.log(
    `[corpus:full] done: 唐诗 ${tangCount}，宋词 ${ciCount}，合计 ${entries.length} 条，分片 ${shardIdx} 个`
  );
}

const argv = process.argv.slice(2);
const vendorArg = argv.find((a) => a.startsWith("--vendor="));
const maxArg = argv.find((a) => a.startsWith("--max="));
const vendorRoot = vendorArg
  ? vendorArg.slice("--vendor=".length)
  : join(root, "vendor/chinese-poetry");
const maxParsed = maxArg ? Number.parseInt(maxArg.slice("--max=".length), 10) : NaN;
const maxTotal =
  Number.isFinite(maxParsed) && maxParsed > 0 ? maxParsed : undefined;

if (argv.includes("--seed")) {
  seedFromPoemsJson();
} else if (argv.includes("--full")) {
  importFull(vendorRoot, maxTotal !== undefined ? { max: maxTotal } : {});
} else {
  console.log(
    "用法: node scripts/build-corpus.mjs --seed | --full [--max=N] [--vendor=path/to/chinese-poetry]"
  );
  process.exit(1);
}

/**
 * 生成三套差异明显的机械键盘风格短采样（合成，非实录），写入 public/sounds。
 * 设计目标：茶轴闷/段落感、青轴脆/高频 click、静音红轻/闷。
 * 运行：node scripts/generate-key-sounds.mjs
 *
 * 实录资源请用：pnpm run fetch:keys（见 public/sounds/LICENSES.md）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "sounds");

const SAMPLE_RATE = 44100;

/** 输错字母：短促不和谐音（220Hz + 330Hz），与键声区分 */
function synthErrorSamples() {
  const durMs = 185;
  const n = Math.floor((SAMPLE_RATE * durMs) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 38);
    const a = Math.sin(2 * Math.PI * 220 * t) * 0.48;
    const b = Math.sin(2 * Math.PI * 330 * t) * 0.38;
    const wobble = Math.sin(2 * Math.PI * 6.5 * t) * 0.12;
    out[i] = (a + b) * env * (1 + wobble);
  }
  return out;
}

function writeWav(path, samples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  writeFileSync(path, Buffer.from(buffer));
}

if (process.argv.includes("--error-only")) {
  mkdirSync(OUT, { recursive: true });
  writeWav(join(OUT, "error.wav"), synthErrorSamples());
  console.log("Wrote", join(OUT, "error.wav"));
  process.exit(0);
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** 带通风格：低频 + 高频混合，系数可调 */
function bandMix(t, rng, lowHz, highHz, lowAmt, highAmt) {
  const low = Math.sin(2 * Math.PI * lowHz * t);
  const high = Math.sin(2 * Math.PI * highHz * t);
  const n = (rng() * 2 - 1) * 0.5;
  return lowAmt * low + highAmt * high + n * 0.08;
}

/**
 * 青轴：极快起音 + 高频 click + 短共鸣（与茶/红差异最大）
 */
function synthClickyBlue(seed) {
  const rng = makeRng(seed);
  const durMs = 38 + (rng() * 8 - 4);
  const n = Math.floor((SAMPLE_RATE * durMs) / 1000);
  const out = new Float32Array(n);
  const clickHz = 3800 + rng() * 400;
  const ringHz = 6200 + rng() * 500;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // 两段包络：先极尖后长尾
    const envFast = Math.exp(-t * 220);
    const envBody = Math.exp(-t * 95);
    const attack = t < 0.0008 ? t / 0.0008 : 1;
    const spike = (rng() * 2 - 1) * envFast * 0.85;
    const click = Math.sin(2 * Math.PI * clickHz * t) * envBody * 0.55;
    const ring = Math.sin(2 * Math.PI * ringHz * t) * Math.exp(-t * 140) * 0.35;
    const air = (rng() * 2 - 1) * Math.exp(-t * 180) * 0.4;
    out[i] = attack * (spike + click + ring + air) * 0.52;
  }
  return out;
}

/**
 * 茶轴：中低频「闷」+ 4–7ms 二段小凸起（段落感），高频少
 */
function synthTactileBrown(seed) {
  const rng = makeRng(seed);
  const durMs = 52 + (rng() * 10 - 5);
  const n = Math.floor((SAMPLE_RATE * durMs) / 1000);
  const out = new Float32Array(n);
  const thockHz = 420 + rng() * 80;
  const midHz = 1100 + rng() * 150;
  const bumpGain = 0.2 + rng() * 0.06;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const ms = t * 1000;
    // 二段：4–8ms 小鼓包（模拟触底前凸起）
    let bump = 0;
    if (ms >= 3.5 && ms <= 9) {
      const u = (ms - 3.5) / 5.5;
      bump = Math.sin(Math.PI * u) * bumpGain;
    }
    const env = Math.exp(-t * 48);
    const thock = Math.sin(2 * Math.PI * thockHz * t) * env * 0.5;
    const mid = Math.sin(2 * Math.PI * midHz * t) * Math.exp(-t * 70) * 0.28;
    const grain = (rng() * 2 - 1) * Math.exp(-t * 90) * 0.35;
    const softAttack = t < 0.002 ? t / 0.002 : 1;
    out[i] = softAttack * env * (thock + mid + grain + bump * Math.sin(2 * Math.PI * 900 * t));
  }
  return out;
}

/**
 * 静音红：明显更轻、更短、以低频闷响为主，几乎无「脆」感
 */
function synthSilentRed(seed) {
  const rng = makeRng(seed);
  const durMs = 42 + (rng() * 6 - 3);
  const n = Math.floor((SAMPLE_RATE * durMs) / 1000);
  const out = new Float32Array(n);
  const lowHz = 320 + rng() * 60;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 58);
    const body = Math.sin(2 * Math.PI * lowHz * t) * env * 0.42;
    const dull = Math.sin(2 * Math.PI * 650 * t) * Math.exp(-t * 75) * 0.12;
    const felt = (rng() * 2 - 1) * Math.exp(-t * 100) * 0.12;
    // 强阻尼：高频极少
    out[i] = (body + dull + felt) * 0.38;
  }
  return out;
}

function synthBackspace(seed, kind) {
  const rng = makeRng(seed + 777);
  if (kind === "blue") {
    const s = synthClickyBlue(seed + 3);
    const out = new Float32Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s[i] * 0.92;
    return out;
  }
  if (kind === "brown") {
    const n = Math.floor((SAMPLE_RATE * 48) / 1000);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t * 42);
      const mix = bandMix(t, rng, 380, 900, 0.35, 0.15);
      out[i] = env * mix * 0.55;
    }
    return out;
  }
  // soft
  const n = Math.floor((SAMPLE_RATE * 55) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 50);
    out[i] = env * Math.sin(2 * Math.PI * 280 * t) * 0.22;
  }
  return out;
}

const presets = [
  {
    dir: "mx-brown",
    label: "茶轴·段落闷响",
    kind: "brown",
    keySeeds: [101, 202, 303, 404],
    bsSeed: 501
  },
  {
    dir: "mx-blue",
    label: "青轴·清脆咔哒",
    kind: "blue",
    keySeeds: [601, 702, 803, 904],
    bsSeed: 1001
  },
  {
    dir: "soft",
    label: "静音红·轻闷线性",
    kind: "soft",
    keySeeds: [1101, 1202, 1303, 1404],
    bsSeed: 1501
  }
];

mkdirSync(OUT, { recursive: true });

const manifest = { version: 1, errorSample: "error.wav", presets: [] };

function synthKey(seed, kind) {
  if (kind === "blue") return synthClickyBlue(seed);
  if (kind === "brown") return synthTactileBrown(seed);
  return synthSilentRed(seed);
}

for (const p of presets) {
  const presetDir = join(OUT, p.dir);
  mkdirSync(presetDir, { recursive: true });
  const keys = [];
  p.keySeeds.forEach((seed, i) => {
    const name = `key-${String(i + 1).padStart(2, "0")}.wav`;
    const fp = join(presetDir, name);
    writeWav(fp, synthKey(seed, p.kind));
    keys.push(`${p.dir}/${name}`);
  });
  const bsName = "backspace.wav";
  writeWav(join(presetDir, bsName), synthBackspace(p.bsSeed, p.kind));
  manifest.presets.push({
    id: p.dir,
    label: p.label,
    keys,
    backspace: `${p.dir}/${bsName}`
  });
}

writeWav(join(OUT, "error.wav"), synthErrorSamples());

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(`Wrote ${manifest.presets.length} presets + error.wav to ${OUT}`);

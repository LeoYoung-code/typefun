/**
 * 从网上下载 CC0 素材，生成 public/sounds 下的实录键声（需网络 + unzip + ffmpeg）。
 * 运行：node scripts/fetch-real-key-sounds.mjs
 *
 * 若需恢复程序合成占位，可改用：node scripts/generate-key-sounds.mjs
 */
import { execSync } from "node:child_process";
import { mkdirSync, existsSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TMP = join(ROOT, ".tmp", "key-sounds-fetch");
const OUT = join(ROOT, "public", "sounds");

const OGA_ZIP_URL = "https://opengameart.org/sites/default/files/unicae_games_keyboard_soundpack_1_0.zip";
const KENNEY_ZIP_URL = "https://opengameart.org/sites/default/files/kenney_interfaceSounds.zip";

function sh(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

async function download(url, dest) {
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log("Downloaded:", dest);
}

function ffmpegOggToWav(oggPath, wavPath) {
  sh(
    `ffmpeg -y -loglevel error -i "${oggPath}" -acodec pcm_s16le -ar 44100 -ac 1 "${wavPath}"`
  );
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  const ogaZip = join(TMP, "unicae_games_keyboard_soundpack_1_0.zip");
  const kenneyZip = join(TMP, "kenney_interfaceSounds.zip");
  await download(OGA_ZIP_URL, ogaZip);
  await download(KENNEY_ZIP_URL, kenneyZip);

  const ogaDir = join(TMP, "oga");
  const kenneyDir = join(TMP, "kenney");
  if (!existsSync(join(ogaDir, "Single Keys"))) {
    sh(`unzip -o "${ogaZip}" -d "${ogaDir}"`);
  }
  if (!existsSync(join(kenneyDir, "Audio"))) {
    sh(`unzip -o "${kenneyZip}" -d "${kenneyDir}"`);
  }

  const single = join(ogaDir, "Single Keys");
  mkdirSync(join(OUT, "mx-brown"), { recursive: true });
  mkdirSync(join(OUT, "mx-blue"), { recursive: true });
  mkdirSync(join(OUT, "soft"), { recursive: true });

  for (let i = 1; i <= 4; i++) {
    const n = String(i).padStart(3, "0");
    copyFileSync(join(single, `keypress-${n}.wav`), join(OUT, "mx-brown", `key-0${i}.wav`));
  }
  copyFileSync(join(single, "keypress-005.wav"), join(OUT, "mx-brown", "backspace.wav"));

  for (let i = 1; i <= 4; i++) {
    const src = String(16 + i).padStart(3, "0");
    copyFileSync(join(single, `keypress-${src}.wav`), join(OUT, "mx-blue", `key-0${i}.wav`));
  }
  copyFileSync(join(single, "keypress-021.wav"), join(OUT, "mx-blue", "backspace.wav"));

  const kAudio = join(kenneyDir, "Audio");
  ffmpegOggToWav(join(kAudio, "tick_001.ogg"), join(OUT, "soft", "key-01.wav"));
  ffmpegOggToWav(join(kAudio, "tick_002.ogg"), join(OUT, "soft", "key-02.wav"));
  ffmpegOggToWav(join(kAudio, "tick_004.ogg"), join(OUT, "soft", "key-03.wav"));
  ffmpegOggToWav(join(kAudio, "select_001.ogg"), join(OUT, "soft", "key-04.wav"));
  ffmpegOggToWav(join(kAudio, "back_001.ogg"), join(OUT, "soft", "backspace.wav"));

  sh(`node "${join(ROOT, "scripts", "generate-key-sounds.mjs")}" --error-only`);

  const manifest = {
    version: 1,
    errorSample: "error.wav",
    presets: [
      {
        id: "mx-brown",
        label: "茶轴向·KC1000 实录",
        keys: [
          "mx-brown/key-01.wav",
          "mx-brown/key-02.wav",
          "mx-brown/key-03.wav",
          "mx-brown/key-04.wav"
        ],
        backspace: "mx-brown/backspace.wav"
      },
      {
        id: "mx-blue",
        label: "青轴向·KC1000 实录",
        keys: [
          "mx-blue/key-01.wav",
          "mx-blue/key-02.wav",
          "mx-blue/key-03.wav",
          "mx-blue/key-04.wav"
        ],
        backspace: "mx-blue/backspace.wav"
      },
      {
        id: "soft",
        label: "轻触·Kenney UI",
        keys: [
          "soft/key-01.wav",
          "soft/key-02.wav",
          "soft/key-03.wav",
          "soft/key-04.wav"
        ],
        backspace: "soft/backspace.wav"
      }
    ]
  };
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log("Done. Output:", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

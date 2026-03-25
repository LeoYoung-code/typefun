import { extractCompletedHanzi } from "../packages/typing-core/dist/index.js";
import { createKeySoundEngine } from "../packages/key-sounds/dist/index.js";
import {
  buildSpeechVoicePickerOptions,
  createSpeechQueue,
  mergeOrphanSpeechVoiceOption,
  subscribeSpeechVoices
} from "../packages/speech-queue/dist/index.js";
import { poems } from "../data/poems.js";
import { flattenPoem, pinyinDisplayLetters } from "./pinyin.js";
import {
  loadSpeechEnabled,
  loadSpeechVoiceURI,
  saveSpeechEnabled,
  saveSpeechVoiceURI
} from "./speech-prefs.js";
import { calcStats, formatDuration, formatPercent, formatRate } from "./stats.js";
import { loadState, saveState, clearProgress } from "./storage.js";

const CATEGORY_ORDER = ["tang", "song_ci"];
const CATEGORY_LABEL = { tang: "唐诗", song_ci: "宋词" };

function poemCategory(poem) {
  return poem.category ?? "tang";
}

const els = {
  courseView: document.getElementById("course-view"),
  practiceView: document.getElementById("practice-view"),
  courseSections: document.getElementById("course-sections"),
  continueBox: document.getElementById("continue-box"),
  continueText: document.getElementById("continue-text"),
  btnContinue: document.getElementById("btn-continue"),
  btnCourse: document.getElementById("btn-course"),
  btnRestart: document.getElementById("btn-restart"),
  practiceTitle: document.getElementById("practice-title"),
  practiceAuthor: document.getElementById("practice-author"),
  practiceGenre: document.getElementById("practice-genre"),
  typingPanel: document.getElementById("typing-panel"),
  imeInput: document.getElementById("ime-input"),
  statElapsed: document.getElementById("stat-elapsed"),
  statAccuracy: document.getElementById("stat-accuracy"),
  statKpm: document.getElementById("stat-kpm"),
  statCpm: document.getElementById("stat-cpm"),
  statCorrectCpm: document.getElementById("stat-correct-cpm"),
  statProgress: document.getElementById("stat-progress"),
  finishDialog: document.getElementById("finish-dialog"),
  finishDialogSummary: document.getElementById("finish-dialog-summary"),
  finishDialogStars: document.getElementById("finish-dialog-stars"),
  finishDialogClose: document.getElementById("finish-dialog-close"),
  btnSpeech: document.getElementById("btn-speech"),
  speechVoice: document.getElementById("speech-voice"),
  speechHint: document.getElementById("speech-hint"),
  btnKeySound: document.getElementById("btn-key-sound"),
  keySoundPreset: document.getElementById("key-sound-preset")
};

const state = {
  saved: loadState(),
  currentPoem: null,
  units: [],
  cursor: 0,
  typedBuffer: "",
  currentError: false,
  failedSnapshots: {},
  composing: false,
  metrics: {
    startedAt: Date.now(),
    totalKeyCount: 0,
    correctKeyCount: 0,
    correctCharCount: 0,
    errorCount: 0
  },
  timer: null
};

const SPEECH_LANG = "zh-CN";

let speech = null;
let speechEnabled = loadSpeechEnabled();

let keySound = null;
let keySoundEnabled = loadKeySoundEnabled();

init();

function loadKeySoundEnabled() {
  try {
    const v = localStorage.getItem("typefun.keySound.enabled");
    if (v === null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

function saveKeySoundEnabled(enabled) {
  try {
    localStorage.setItem("typefun.keySound.enabled", enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function loadKeySoundPresetId() {
  try {
    const v = localStorage.getItem("typefun.keySound.presetId");
    if (v === null || v === "") return null;
    return v;
  } catch {
    return null;
  }
}

function saveKeySoundPresetId(id) {
  try {
    if (id === null || id === "") localStorage.removeItem("typefun.keySound.presetId");
    else localStorage.setItem("typefun.keySound.presetId", id);
  } catch {
    /* ignore */
  }
}

function updateKeySoundButton() {
  if (!els.btnKeySound) return;
  els.btnKeySound.setAttribute("aria-pressed", keySoundEnabled ? "true" : "false");
  els.btnKeySound.textContent = keySoundEnabled ? "键声：开" : "键声：关";
}

function playKeySound(kind) {
  if (!keySound || !keySoundEnabled) return;
  void keySound.unlock();
  keySound.play(kind);
}

async function initKeySound() {
  const manifestUrl = new URL("../public/sounds/manifest.json", import.meta.url);
  keySound = createKeySoundEngine({ manifestUrl, maxPolyphony: 12 });
  keySound.setEnabled(keySoundEnabled);
  keySound.setPresetId(loadKeySoundPresetId());
  updateKeySoundButton();
  try {
    await keySound.init();
    const res = await fetch(manifestUrl);
    if (!res.ok) return;
    const m = await res.json();
    if (els.keySoundPreset) {
      els.keySoundPreset.innerHTML = "";
      for (const p of m.presets) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        els.keySoundPreset.appendChild(opt);
      }
      const saved = loadKeySoundPresetId();
      const first = m.presets[0]?.id ?? "";
      els.keySoundPreset.value =
        saved && m.presets.some((x) => x.id === saved) ? saved : first;
      saveKeySoundPresetId(els.keySoundPreset.value || null);
      keySound.setPresetId(els.keySoundPreset.value || null);
    }
  } catch {
    /* ignore */
  }
}

function refreshSpeechVoiceSelect() {
  if (!els.speechVoice) return;
  let opts = buildSpeechVoicePickerOptions(SPEECH_LANG);
  opts = mergeOrphanSpeechVoiceOption(opts, loadSpeechVoiceURI(), SPEECH_LANG);
  const saved = loadSpeechVoiceURI() ?? "";
  els.speechVoice.innerHTML = "";
  for (const o of opts) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    if (o.value === saved) opt.selected = true;
    els.speechVoice.appendChild(opt);
  }
}

function initSpeech() {
  speech = createSpeechQueue({
    lang: SPEECH_LANG,
    voiceURI: loadSpeechVoiceURI(),
    onUnsupported: () => {
      if (els.speechHint) {
        els.speechHint.textContent = "当前环境不支持朗读（浏览器或系统未提供语音合成）。";
        els.speechHint.classList.remove("hidden");
      }
    }
  });
  speech.setEnabled(speechEnabled);
  updateSpeechButton();
  refreshSpeechVoiceSelect();
  subscribeSpeechVoices(refreshSpeechVoiceSelect);
  if (els.speechVoice) {
    els.speechVoice.addEventListener("change", () => {
      const v = els.speechVoice.value || null;
      saveSpeechVoiceURI(v);
      speech?.setVoiceURI(v);
    });
  }
}

function updateSpeechButton() {
  if (!els.btnSpeech) return;
  els.btnSpeech.setAttribute("aria-pressed", speechEnabled ? "true" : "false");
  els.btnSpeech.textContent = speechEnabled ? "朗读：开" : "朗读：关";
}

function practiceSnapshot() {
  return {
    cursor: state.cursor,
    metrics: { correctCharCount: state.metrics.correctCharCount },
    units: state.units
  };
}

function init() {
  initSpeech();
  void initKeySound();
  bindEvents();
  renderCourse();
  showContinueIfAny();
}

function bindEvents() {
  els.btnCourse.addEventListener("click", () => {
    showCourse();
  });

  els.btnRestart.addEventListener("click", () => {
    if (!state.currentPoem) return;
    clearProgress(state.currentPoem.id);
    startPractice(state.currentPoem.id, false);
  });

  els.btnContinue.addEventListener("click", () => {
    const id = state.saved.lastPoemId;
    if (!id) return;
    startPractice(id, true);
  });

  els.finishDialogClose.addEventListener("click", () => {
    els.finishDialog.close();
  });

  if (els.btnSpeech) {
    els.btnSpeech.addEventListener("click", () => {
      speechEnabled = !speechEnabled;
      saveSpeechEnabled(speechEnabled);
      speech?.setEnabled(speechEnabled);
      updateSpeechButton();
      if (speechEnabled && els.speechHint) {
        els.speechHint.classList.add("hidden");
      }
    });
  }

  if (els.btnKeySound) {
    els.btnKeySound.addEventListener("click", () => {
      keySoundEnabled = !keySoundEnabled;
      saveKeySoundEnabled(keySoundEnabled);
      keySound?.setEnabled(keySoundEnabled);
      updateKeySoundButton();
    });
  }

  if (els.keySoundPreset) {
    els.keySoundPreset.addEventListener("change", () => {
      const v = els.keySoundPreset.value || null;
      saveKeySoundPresetId(v);
      keySound?.setPresetId(v);
    });
  }

  window.addEventListener("keydown", () => {
    if (!state.currentPoem) return;
    focusInput();
  });
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !els.finishDialog.open) {
      if (!state.currentPoem) return;
      if (els.practiceView.classList.contains("hidden")) return;
      ev.preventDefault();
      speech?.cancel();
      showCourse();
      return;
    }
    if (!state.currentPoem) return;
    if (ev.key === "Backspace") {
      ev.preventDefault();
      processKey("backspace");
      return;
    }
    if (/^[a-zA-Z]$/.test(ev.key)) {
      ev.preventDefault();
      processKey(ev.key);
    }
  });

  els.imeInput.addEventListener("compositionstart", () => {
    state.composing = true;
  });

  els.imeInput.addEventListener("compositionend", (ev) => {
    state.composing = false;
    // 拼音校验统一按字母流处理，忽略汉字上屏提交值，避免“按汉字检测”
    els.imeInput.value = "";
  });

  els.imeInput.addEventListener("input", (ev) => {
    if (state.composing || ev.isComposing) return;
    const text = els.imeInput.value;
    if (!text) return;
    for (const ch of text) {
      processKey(ch);
    }
    els.imeInput.value = "";
  });
}

function showCourse() {
  speech?.cancel();
  els.courseView.classList.remove("hidden");
  els.practiceView.classList.add("hidden");
  clearInterval(state.timer);
  state.timer = null;
}

function showPractice() {
  els.practiceView.classList.remove("hidden");
  els.courseView.classList.add("hidden");
  focusInput();
  if (!state.timer) {
    state.timer = setInterval(renderStats, 300);
  }
}

function focusInput() {
  els.imeInput.focus({ preventScroll: true });
}

function renderCourse() {
  els.courseSections.innerHTML = "";
  const by = new Map();
  for (const c of CATEGORY_ORDER) by.set(c, []);
  for (const poem of poems) {
    const c = poemCategory(poem);
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(poem);
  }
  for (const c of CATEGORY_ORDER) {
    const items = by.get(c) ?? [];
    if (!items.length) continue;
    const section = document.createElement("section");
    section.className = "poem-section";
    const h = document.createElement("h2");
    h.className = "poem-section-title";
    h.textContent = CATEGORY_LABEL[c];
    const grid = document.createElement("div");
    grid.className = "course-grid";
    section.appendChild(h);
    section.appendChild(grid);
    for (const poem of items) {
      const card = document.createElement("article");
      card.className = "course-card";
      const best = state.saved.bestByPoem[poem.id];
      const stars = best?.stars ?? poem.stars ?? 0;
      card.innerHTML = `
      <div class="course-card-top">
        <span>${renderStars(stars)}</span>
        <span>可练习</span>
      </div>
      <div>
        <div class="course-card-title">《${poem.title}》</div>
        <div class="course-card-author">${poem.author}</div>
      </div>
    `;

      const btn = document.createElement("button");
      btn.className = "primary-btn";
      btn.textContent = "开始练习";
      btn.disabled = false;
      btn.addEventListener("click", () => startPractice(poem.id, true));
      card.appendChild(btn);
      grid.appendChild(card);
    }
    els.courseSections.appendChild(section);
  }
}

function showContinueIfAny() {
  const poemId = state.saved.lastPoemId;
  if (!poemId) {
    els.continueBox.classList.add("hidden");
    return;
  }
  const poem = poems.find((item) => item.id === poemId);
  const progress = state.saved.progressByPoem[poemId];
  if (!poem || !progress) {
    els.continueBox.classList.add("hidden");
    return;
  }
  els.continueText.textContent = `上次练习：${poem.title} · 进度 ${formatPercent(progress.progress)}`;
  els.continueBox.classList.remove("hidden");
}

function startPractice(poemId, restore = true) {
  speech?.cancel();
  if (els.speechHint) {
    els.speechHint.classList.add("hidden");
    els.speechHint.textContent = "";
  }
  const poem = poems.find((item) => item.id === poemId);
  if (!poem) return;
  const units = flattenPoem(poem);
  const totalChars = units.filter((u) => !u.isPunctuation).length;
  const savedProgress = state.saved.progressByPoem[poemId];

  state.currentPoem = poem;
  state.units = units;
  state.cursor = restore && savedProgress ? savedProgress.cursor : 0;
  state.typedBuffer = restore && savedProgress ? savedProgress.typedBuffer || "" : "";
  state.currentError = false;
  state.failedSnapshots =
    restore && savedProgress?.failedSnapshots && typeof savedProgress.failedSnapshots === "object"
      ? { ...savedProgress.failedSnapshots }
      : {};
  state.metrics = restore && savedProgress
    ? {
        startedAt: Date.now() - Math.max(0, savedProgress.elapsedSec || 0) * 1000,
        totalKeyCount: savedProgress.totalKeyCount || 0,
        correctKeyCount: savedProgress.correctKeyCount || 0,
        correctCharCount: savedProgress.correctCharCount || 0,
        errorCount: savedProgress.errorCount || 0
      }
    : {
        startedAt: Date.now(),
        totalKeyCount: 0,
        correctKeyCount: 0,
        correctCharCount: 0,
        errorCount: 0
      };

  skipPunctuation();
  refreshTypingStatus();
  els.practiceTitle.textContent = `《${poem.title}》`;
  els.practiceAuthor.textContent = poem.author;
  els.practiceGenre.textContent = CATEGORY_LABEL[poemCategory(poem)];
  renderTypingPanel();
  renderStats();
  showPractice();

  state.saved.lastPoemId = poemId;
  saveProgress(totalChars);
}

function processKey(char) {
  const snapBefore = practiceSnapshot();
  const key = char.toLowerCase();

  if (key === "backspace") {
    if (state.typedBuffer.length > 0) {
      state.typedBuffer = state.typedBuffer.slice(0, -1);
      refreshTypingStatus();
      playKeySound("backspace");
      afterInput(snapBefore);
    } else if (state.cursor > 0) {
      state.cursor -= 1;
      while (state.cursor > 0 && state.units[state.cursor].isPunctuation) {
        state.cursor -= 1;
      }
      const prevUnit = state.units[state.cursor];
      if (prevUnit && !prevUnit.isPunctuation) {
        const prevKey = String(state.cursor);
        const failSnap = state.failedSnapshots[prevKey];
        if (failSnap !== undefined) {
          delete state.failedSnapshots[prevKey];
          state.typedBuffer = failSnap.length <= 1 ? "" : failSnap.slice(0, -1);
        } else {
          state.typedBuffer = prevUnit.pinyinRaw.slice(0, -1);
          state.metrics.correctCharCount = Math.max(0, state.metrics.correctCharCount - 1);
        }
        state.currentError = false;
        playKeySound("backspace");
        afterInput(snapBefore);
      }
    }
    return;
  }

  const current = state.units[state.cursor];
  if (!current || current.isPunctuation) return;

  if (!/^[a-z]$/.test(key)) return;
  state.metrics.totalKeyCount += 1;
  state.typedBuffer += key;

  const expectedRaw = current.pinyinRaw;
  const pos = state.typedBuffer.length - 1;
  const keyOk = pos < expectedRaw.length && key === expectedRaw[pos];
  if (keyOk) {
    state.metrics.correctKeyCount += 1;
  } else {
    state.metrics.errorCount += 1;
  }

  if (state.typedBuffer.length >= expectedRaw.length) {
    let allOk = true;
    for (let i = 0; i < expectedRaw.length; i += 1) {
      if (state.typedBuffer[i] !== expectedRaw[i]) {
        allOk = false;
        break;
      }
    }
    if (allOk) {
      state.metrics.correctCharCount += 1;
    } else {
      state.failedSnapshots[String(state.cursor)] = state.typedBuffer;
    }
    state.cursor += 1;
    state.typedBuffer = "";
    state.currentError = false;
    skipPunctuation();
  } else {
    refreshTypingStatus();
  }
  if (keyOk) {
    playKeySound("key");
  } else {
    playKeySound("error");
  }
  afterInput(snapBefore);
}

function afterInput(snapBefore) {
  if (speech && speechEnabled) {
    const ch = extractCompletedHanzi(snapBefore, practiceSnapshot());
    if (ch) speech.enqueue(ch);
  }
  const totalChars = state.units.filter((u) => !u.isPunctuation).length;
  renderTypingPanel();
  renderStats();
  saveProgress(totalChars);
  if (state.cursor >= state.units.length) {
    finishPoem(totalChars);
  }
}

function skipPunctuation() {
  while (state.cursor < state.units.length && state.units[state.cursor].isPunctuation) {
    state.cursor += 1;
  }
}

function finishPoem(totalChars) {
  const showFinish = () => {
    clearInterval(state.timer);
    state.timer = null;
    const stats = calcStats(state.metrics, totalChars);
    const stars = scoreToStars(stats.accuracy, stats.cpm);
    state.saved.bestByPoem[state.currentPoem.id] = {
      stars,
      accuracy: stats.accuracy,
      cpm: stats.cpm,
      updatedAt: Date.now()
    };
    delete state.saved.progressByPoem[state.currentPoem.id];
    saveState(state.saved);
    renderCourse();
    showContinueIfAny();
    showCourse();
    const elapsedSec = (Date.now() - state.metrics.startedAt) / 1000;
    els.finishDialogSummary.textContent = `《${state.currentPoem.title}》\n准确率 ${formatPercent(stats.accuracy)} · 速度 ${formatRate(stats.cpm, "字/分钟")} · 用时 ${formatDuration(elapsedSec)}`;
    els.finishDialogStars.textContent = `${"★".repeat(stars)}${"☆".repeat(5 - stars)}`;
    els.finishDialog.showModal();
  };

  if (speech && speechEnabled) {
    void speech.waitUntilIdle().then(showFinish);
  } else {
    showFinish();
  }
}

function saveProgress(totalChars) {
  const stats = calcStats(state.metrics, totalChars);
  state.saved.progressByPoem[state.currentPoem.id] = {
    cursor: state.cursor,
    typedBuffer: state.typedBuffer,
    failedSnapshots: { ...state.failedSnapshots },
    totalKeyCount: state.metrics.totalKeyCount,
    correctKeyCount: state.metrics.correctKeyCount,
    correctCharCount: state.metrics.correctCharCount,
    errorCount: state.metrics.errorCount,
    elapsedSec: (Date.now() - state.metrics.startedAt) / 1000,
    progress: stats.progress
  };
  state.saved.lastPoemId = state.currentPoem.id;
  saveState(state.saved);
}

function refreshTypingStatus() {
  const current = state.units[state.cursor];
  if (!current || current.isPunctuation) {
    state.currentError = false;
    return;
  }
  if (!state.typedBuffer) {
    state.currentError = false;
    return;
  }
  const expectedRaw = current.pinyinRaw;
  state.currentError = false;
  for (let i = 0; i < state.typedBuffer.length; i += 1) {
    if (state.typedBuffer[i] !== expectedRaw[i]) {
      state.currentError = true;
      break;
    }
  }
}

function renderTypingPanel() {
  if (!state.currentPoem) return;
  els.typingPanel.innerHTML = "";
  const lines = state.currentPoem.lines;
  let globalIndex = 0;

  lines.forEach((line) => {
    const block = document.createElement("div");
    block.className = "line-block";
    const lineGrid = document.createElement("div");
    lineGrid.className = "line-grid";
    const colCount = line.hanzi.length;
    const columns = `repeat(${colCount}, minmax(1.2em, max-content))`;
    lineGrid.style.gridTemplateColumns = columns;

    line.hanzi.forEach((char, idx) => {
      const pinyin = line.pinyin[idx] || "";
      const cell = document.createElement("div");
      cell.className = "line-cell";
      const pySpan = document.createElement("span");
      const hzSpan = document.createElement("span");
      pySpan.className = "py-cell";
      hzSpan.className = "hz-cell";
      pySpan.textContent = pinyin || char;
      hzSpan.textContent = char;

      const unit = state.units[globalIndex];
      const isCurrent = globalIndex === state.cursor;
      const isDone = globalIndex < state.cursor && !unit.isPunctuation;
      const isPunct = unit.isPunctuation;
      const failTyped = state.failedSnapshots[String(globalIndex)];
      const isSkippedWrong = isDone && failTyped !== undefined;

      if (isPunct) {
        pySpan.classList.add("punct");
        hzSpan.classList.add("punct");
      }
      if (isSkippedWrong) {
        renderFailedPinyin(pySpan, unit.pinyinRaw, failTyped, unit.pinyin);
        hzSpan.classList.add("error");
      } else if (isDone) {
        pySpan.classList.add("done");
        hzSpan.classList.add("done");
      }
      if (isCurrent) {
        pySpan.classList.add("current");
        hzSpan.classList.add("current");
        if (state.currentError) {
          pySpan.classList.add("error");
          hzSpan.classList.add("error");
        }
        if (!isPunct) {
          renderCurrentPinyin(pySpan, unit.pinyinRaw, state.typedBuffer, unit.pinyin);
        }
      }

      cell.appendChild(pySpan);
      cell.appendChild(hzSpan);
      lineGrid.appendChild(cell);
      globalIndex += 1;
    });

    block.appendChild(lineGrid);
    els.typingPanel.appendChild(block);
  });
}

function renderCurrentPinyin(container, expectedRaw, typedBuffer, pinyinWithTone) {
  const expected = expectedRaw || "";
  const display = pinyinDisplayLetters(pinyinWithTone || "");
  container.textContent = "";

  for (let i = 0; i < expected.length; i += 1) {
    const letter = document.createElement("span");
    letter.className = "py-letter";
    const typed = typedBuffer[i];
    const current = expected[i];
    const showCh = display[i] ?? current;

    if (typed !== undefined) {
      if (typed === current) {
        letter.classList.add("ok");
        letter.textContent = showCh;
      } else {
        letter.classList.add("err");
        letter.textContent = typed;
      }
    } else {
      letter.classList.add("pending");
      letter.textContent = showCh;
      if (i === typedBuffer.length) {
        letter.classList.add("next");
      }
    }
    container.appendChild(letter);
  }

  if (typedBuffer.length > expected.length) {
    for (let i = expected.length; i < typedBuffer.length; i += 1) {
      const extra = document.createElement("span");
      extra.className = "py-letter err";
      extra.textContent = typedBuffer[i];
      container.appendChild(extra);
    }
  }
}

/** 已完成的字含错键：逐字母对错着色；快照短于音节时剩余字母按绿色展示 */
function renderFailedPinyin(container, expectedRaw, failTyped, pinyinWithTone) {
  const expected = expectedRaw || "";
  const display = pinyinDisplayLetters(pinyinWithTone || "");
  container.textContent = "";
  for (let i = 0; i < expected.length; i += 1) {
    const letter = document.createElement("span");
    letter.className = "py-letter";
    const showCh = display[i] ?? expected[i];
    if (i < failTyped.length) {
      const t = failTyped[i];
      const e = expected[i];
      if (t === e) {
        letter.classList.add("ok");
        letter.textContent = showCh;
      } else {
        letter.classList.add("err");
        letter.textContent = t;
      }
    } else {
      letter.classList.add("ok");
      letter.textContent = showCh;
    }
    container.appendChild(letter);
  }
  for (let i = expected.length; i < failTyped.length; i += 1) {
    const extra = document.createElement("span");
    extra.className = "py-letter err";
    extra.textContent = failTyped[i];
    container.appendChild(extra);
  }
}

function renderStats() {
  if (!state.currentPoem) return;
  const totalChars = state.units.filter((u) => !u.isPunctuation).length;
  const stats = calcStats(state.metrics, totalChars);
  const elapsedSec = (Date.now() - state.metrics.startedAt) / 1000;
  els.statElapsed.textContent = formatDuration(elapsedSec);
  els.statAccuracy.textContent = formatPercent(stats.accuracy);
  els.statKpm.textContent = formatRate(stats.kpm, "键/分钟");
  els.statCpm.textContent = formatRate(stats.cpm, "字/分钟");
  els.statCorrectCpm.textContent = formatRate(stats.correctCpm, "字/分钟");
  els.statProgress.textContent = formatPercent(stats.progress);
}

function renderStars(num) {
  const n = Math.max(0, Math.min(5, num));
  return `${"★".repeat(n)}${"☆".repeat(5 - n)}`;
}

function scoreToStars(accuracy, cpm) {
  if (accuracy >= 98 && cpm >= 45) return 5;
  if (accuracy >= 95 && cpm >= 35) return 4;
  if (accuracy >= 90 && cpm >= 25) return 3;
  if (accuracy >= 85 && cpm >= 18) return 2;
  return 1;
}

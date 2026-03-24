import { poems } from "../data/poems.js";
import { flattenPoem } from "./pinyin.js";
import { calcStats, formatPercent, formatRate } from "./stats.js";
import { loadState, saveState, clearProgress } from "./storage.js";

const els = {
  courseView: document.getElementById("course-view"),
  practiceView: document.getElementById("practice-view"),
  courseGrid: document.getElementById("course-grid"),
  continueBox: document.getElementById("continue-box"),
  continueText: document.getElementById("continue-text"),
  btnContinue: document.getElementById("btn-continue"),
  btnCourse: document.getElementById("btn-course"),
  btnRestart: document.getElementById("btn-restart"),
  practiceTitle: document.getElementById("practice-title"),
  practiceAuthor: document.getElementById("practice-author"),
  typingPanel: document.getElementById("typing-panel"),
  imeInput: document.getElementById("ime-input"),
  statAccuracy: document.getElementById("stat-accuracy"),
  statKpm: document.getElementById("stat-kpm"),
  statCpm: document.getElementById("stat-cpm"),
  statCorrectCpm: document.getElementById("stat-correct-cpm"),
  statProgress: document.getElementById("stat-progress")
};

const state = {
  saved: loadState(),
  currentPoem: null,
  units: [],
  cursor: 0,
  typedBuffer: "",
  currentError: false,
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

init();

function init() {
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

  window.addEventListener("keydown", () => {
    if (!state.currentPoem) return;
    focusInput();
  });
  window.addEventListener("keydown", (ev) => {
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
  els.courseGrid.innerHTML = "";
  for (const poem of poems) {
    const card = document.createElement("article");
    card.className = `course-card ${poem.unlocked ? "" : "locked"}`;
    const best = state.saved.bestByPoem[poem.id];
    const stars = best?.stars ?? poem.stars ?? 0;
    card.innerHTML = `
      <div class="course-card-top">
        <span>${renderStars(stars)}</span>
        <span>${poem.unlocked ? "可练习" : "🔒 未解锁"}</span>
      </div>
      <div>
        <div class="course-card-title">《${poem.title}》</div>
        <div class="course-card-author">${poem.author}</div>
      </div>
    `;

    const btn = document.createElement("button");
    btn.className = "primary-btn";
    btn.textContent = poem.unlocked ? "开始练习" : "已锁定";
    btn.disabled = !poem.unlocked;
    btn.addEventListener("click", () => startPractice(poem.id, true));
    card.appendChild(btn);
    els.courseGrid.appendChild(card);
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
  renderTypingPanel();
  renderStats();
  showPractice();

  state.saved.lastPoemId = poemId;
  saveProgress(totalChars);
}

function processKey(char) {
  const key = char.toLowerCase();
  const current = state.units[state.cursor];
  if (!current || current.isPunctuation) return;

  if (key === "backspace") {
    if (state.typedBuffer.length > 0) {
      state.typedBuffer = state.typedBuffer.slice(0, -1);
      refreshTypingStatus();
      afterInput();
    } else if (state.cursor > 0) {
      state.cursor -= 1;
      while (state.cursor > 0 && state.units[state.cursor].isPunctuation) {
        state.cursor -= 1;
      }
      const prev = state.units[state.cursor];
      if (prev && !prev.isPunctuation) {
        state.typedBuffer = prev.pinyinRaw.slice(0, -1);
        state.metrics.correctCharCount = Math.max(0, state.metrics.correctCharCount - 1);
        state.currentError = false;
        afterInput();
      }
    }
    return;
  }

  if (!/^[a-z]$/.test(key)) return;
  state.metrics.totalKeyCount += 1;
  state.typedBuffer += key;

  const expectedRaw = current.pinyinRaw;
  if (expectedRaw.startsWith(state.typedBuffer)) {
    state.metrics.correctKeyCount += 1;
    state.currentError = false;
    if (state.typedBuffer.length >= expectedRaw.length) {
      state.cursor += 1;
      state.metrics.correctCharCount += 1;
      state.typedBuffer = "";
      skipPunctuation();
    }
  } else {
    state.currentError = true;
    state.metrics.errorCount += 1;
  }
  afterInput();
}

function afterInput() {
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
  alert(`完成《${state.currentPoem.title}》\n准确率 ${formatPercent(stats.accuracy)} · 速度 ${formatRate(stats.cpm, "字/分钟")} · 星级 ${"★".repeat(stars)}`);
}

function saveProgress(totalChars) {
  const stats = calcStats(state.metrics, totalChars);
  state.saved.progressByPoem[state.currentPoem.id] = {
    cursor: state.cursor,
    typedBuffer: state.typedBuffer,
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
  state.currentError = !current.pinyinRaw.startsWith(state.typedBuffer);
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

      if (isPunct) {
        pySpan.classList.add("punct");
        hzSpan.classList.add("punct");
      }
      if (isDone) {
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
          renderCurrentPinyin(pySpan, unit.pinyinRaw, state.typedBuffer);
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

function renderCurrentPinyin(container, expectedRaw, typedBuffer) {
  const expected = expectedRaw || "";
  container.textContent = "";

  for (let i = 0; i < expected.length; i += 1) {
    const letter = document.createElement("span");
    letter.className = "py-letter";
    const typed = typedBuffer[i];
    const current = expected[i];

    if (typed !== undefined) {
      if (typed === current) {
        letter.classList.add("ok");
        letter.textContent = current;
      } else {
        letter.classList.add("err");
        letter.textContent = typed;
      }
    } else {
      letter.classList.add("pending");
      letter.textContent = current;
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

function renderStats() {
  if (!state.currentPoem) return;
  const totalChars = state.units.filter((u) => !u.isPunctuation).length;
  const stats = calcStats(state.metrics, totalChars);
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

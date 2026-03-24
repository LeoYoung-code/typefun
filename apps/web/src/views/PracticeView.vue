<script setup lang="ts">
import {
  applyPracticeKey,
  buildProgressSnapshot,
  calcStats,
  createPracticeState,
  formatDuration,
  formatPercent,
  formatRate,
  isPracticeComplete,
  scoreToStars,
  type Poem,
  type PracticeState
} from "@typefun/typing-core";
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import TypingPanel from "../components/TypingPanel.vue";
import { clearProgress, loadState, saveState } from "../lib/storage";

const props = defineProps<{ id: string }>();
const router = useRouter();

const poem = ref<Poem | null>(null);
const loadError = ref<string | null>(null);
const practice = ref<PracticeState | null>(null);
const saved = ref(loadState());

const imeInput = ref<HTMLInputElement | null>(null);
const composing = ref(false);

let statsTimer: ReturnType<typeof setInterval> | null = null;
const displayNow = ref(Date.now());

function totalChars(state: PracticeState) {
  return state.units.filter((u) => !u.isPunctuation).length;
}

function focusInput() {
  imeInput.value?.focus({ preventScroll: true });
}

async function loadPoem() {
  loadError.value = null;
  poem.value = null;
  practice.value = null;
  try {
    const res = await fetch(`/api/poems/${encodeURIComponent(props.id)}`);
    if (res.status === 404) {
      loadError.value = "未找到该篇";
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const p = (await res.json()) as Poem;
    poem.value = p;
    saved.value = loadState();
    const restore = saved.value.progressByPoem[p.id] ?? null;
    const now = Date.now();
    practice.value = createPracticeState(p, restore, now);
    await nextTick();
    focusInput();
    startStatsTimer();
  } catch {
    loadError.value = "载入失败，请检查网络或 API 是否已启动。";
  }
}

function startStatsTimer() {
  stopStatsTimer();
  statsTimer = setInterval(() => {
    displayNow.value = Date.now();
  }, 300);
}

function stopStatsTimer() {
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
}

function persistProgress() {
  if (!practice.value || !poem.value) return;
  const now = Date.now();
  const snap = buildProgressSnapshot(practice.value, now);
  saved.value.progressByPoem[poem.value.id] = snap;
  saved.value.lastPoemId = poem.value.id;
  saveState(saved.value);
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === "Escape") {
    if (!practice.value) return;
    ev.preventDefault();
    stopStatsTimer();
    router.push("/");
    return;
  }
  if (!practice.value) return;
  if (ev.key === "Backspace") {
    ev.preventDefault();
    practice.value = applyPracticeKey(practice.value, "backspace", Date.now());
    afterInput();
    return;
  }
  if (/^[a-zA-Z]$/.test(ev.key)) {
    ev.preventDefault();
    practice.value = applyPracticeKey(practice.value, ev.key, Date.now());
    afterInput();
  }
}

function onWindowKey() {
  if (practice.value) focusInput();
}

function onCompositionStart() {
  composing.value = true;
}

function onCompositionEnd() {
  composing.value = false;
  if (imeInput.value) imeInput.value.value = "";
}

function onImeInput(ev: Event) {
  const inputEv = ev as InputEvent;
  if (composing.value || inputEv.isComposing) return;
  const el = imeInput.value;
  if (!el || !practice.value) return;
  const text = el.value;
  if (!text) return;
  for (const ch of text) {
    practice.value = applyPracticeKey(practice.value, ch, Date.now());
    afterInput();
  }
  el.value = "";
}

function afterInput() {
  if (!practice.value) return;
  persistProgress();
  const tc = totalChars(practice.value);
  if (isPracticeComplete(practice.value)) {
    finishPractice(tc);
  }
}

function finishPractice(tc: number) {
  if (!practice.value || !poem.value) return;
  stopStatsTimer();
  const now = Date.now();
  const stats = calcStats(practice.value.metrics, tc, now);
  const stars = scoreToStars(stats.accuracy, stats.cpm);
  saved.value.bestByPoem[poem.value.id] = {
    stars,
    accuracy: stats.accuracy,
    cpm: stats.cpm,
    updatedAt: now
  };
  delete saved.value.progressByPoem[poem.value.id];
  saveState(saved.value);
  const elapsedSec = (now - practice.value.metrics.startedAt) / 1000;
  const summary = `《${poem.value.title}》\n准确率 ${formatPercent(stats.accuracy)} · 速度 ${formatRate(stats.cpm, "字/分钟")} · 用时 ${formatDuration(elapsedSec)}`;
  const starsStr = `${"★".repeat(stars)}${"☆".repeat(5 - stars)}`;
  sessionStorage.setItem(
    "TYPEFUN_FINISH_V1",
    JSON.stringify({ summary, stars: starsStr })
  );
  router.push("/");
}

function goCourse() {
  stopStatsTimer();
  router.push("/");
}

function restart() {
  if (!poem.value) return;
  clearProgress(poem.value.id);
  saved.value = loadState();
  practice.value = createPracticeState(poem.value, null, Date.now());
  focusInput();
  startStatsTimer();
}

const statsDisplay = ref({
  elapsed: "0:00",
  accuracy: "0%",
  kpm: "0 键/分钟",
  cpm: "0 字/分钟",
  correctCpm: "0 字/分钟",
  progress: "0%"
});

watch(
  [practice, displayNow],
  () => {
    if (!practice.value) return;
    const tc = totalChars(practice.value);
    const s = calcStats(practice.value.metrics, tc, displayNow.value);
    const elapsedSec = (displayNow.value - practice.value.metrics.startedAt) / 1000;
    statsDisplay.value = {
      elapsed: formatDuration(elapsedSec),
      accuracy: formatPercent(s.accuracy),
      kpm: formatRate(s.kpm, "键/分钟"),
      cpm: formatRate(s.cpm, "字/分钟"),
      correctCpm: formatRate(s.correctCpm, "字/分钟"),
      progress: formatPercent(s.progress)
    };
  },
  { deep: true }
);

onMounted(() => {
  loadPoem();
  window.addEventListener("keydown", onWindowKey);
  window.addEventListener("keydown", onKey);
});

onUnmounted(() => {
  stopStatsTimer();
  window.removeEventListener("keydown", onWindowKey);
  window.removeEventListener("keydown", onKey);
});

watch(
  () => props.id,
  () => {
    loadPoem();
  }
);
</script>

<template>
  <div>
    <header class="topbar">
      <RouterLink class="logo" to="/">Typefun</RouterLink>
      <div class="top-actions">
        <button type="button" class="ghost-btn" @click="goCourse">课程页</button>
        <button type="button" class="ghost-btn" @click="restart">重打</button>
      </div>
    </header>

    <main v-if="loadError">
      <p class="load-error">{{ loadError }}</p>
      <button type="button" class="primary-btn" @click="router.push('/')">
        回课程
      </button>
    </main>

    <main v-else-if="poem && practice">
      <div class="practice-header">
        <h2>《{{ poem.title }}》</h2>
        <p class="practice-author">{{ poem.author }}</p>
      </div>

      <TypingPanel
        :poem="poem"
        :units="practice.units"
        :cursor="practice.cursor"
        :typed-buffer="practice.typedBuffer"
        :current-error="practice.currentError"
      />

      <div class="footer-stats" aria-live="polite">
        <span>用时 <b>{{ statsDisplay.elapsed }}</b></span>
        <span>准确率 <b>{{ statsDisplay.accuracy }}</b></span>
        <span>按键速度 <b>{{ statsDisplay.kpm }}</b></span>
        <span>打字速度 <b>{{ statsDisplay.cpm }}</b></span>
        <span>正确打字速度 <b>{{ statsDisplay.correctCpm }}</b></span>
        <span>进度 <b>{{ statsDisplay.progress }}</b></span>
      </div>
      <p class="hint-kbd">练习时按 Esc 返回课程；使用键盘输入拼音。</p>

      <input
        ref="imeInput"
        class="ime-input"
        type="text"
        aria-hidden="true"
        tabindex="-1"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @input="onImeInput"
      />
    </main>

    <main v-else>
      <p class="subtitle">载入中…</p>
    </main>

  </div>
</template>

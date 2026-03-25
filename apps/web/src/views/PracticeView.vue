<script setup lang="ts">
import {
  applyPracticeKey,
  buildProgressSnapshot,
  calcStats,
  createPracticeState,
  extractCompletedHanzi,
  formatDuration,
  formatPercent,
  formatRate,
  isPracticeComplete,
  scoreToStars,
  POEM_CATEGORY_LABELS,
  type Poem,
  type PoemCategory,
  type PracticeState
} from "@typefun/typing-core";
import {
  buildSpeechVoicePickerOptions,
  createSpeechQueue,
  mergeOrphanSpeechVoiceOption,
  subscribeSpeechVoices,
  type SpeechVoiceOption
} from "@typefun/speech-queue";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import TypingPanel from "../components/TypingPanel.vue";
import {
  loadSpeechEnabled,
  loadSpeechVoiceURI,
  saveSpeechEnabled,
  saveSpeechVoiceURI
} from "../lib/speech-prefs";
import { clearProgress, loadState, saveState } from "../lib/storage";

const props = defineProps<{ id: string }>();
const router = useRouter();

const poem = ref<Poem | null>(null);
const loadError = ref<string | null>(null);
const practice = ref<PracticeState | null>(null);
const saved = ref(loadState());

function resolveCategory(c?: PoemCategory): PoemCategory {
  return c ?? "tang";
}

const practiceGenreLabel = computed(() => {
  if (!poem.value) return "";
  return POEM_CATEGORY_LABELS[resolveCategory(poem.value.category)];
});

const imeInput = ref<HTMLInputElement | null>(null);
const composing = ref(false);

const SPEECH_LANG = "zh-CN";

const speech = ref<ReturnType<typeof createSpeechQueue> | null>(null);
const speechEnabled = ref(loadSpeechEnabled());
const speechVoiceURI = ref(loadSpeechVoiceURI() ?? "");
const voiceOptions = ref<SpeechVoiceOption[]>([]);
const speechUnsupported = ref(false);

function refreshSpeechVoiceOptions() {
  let opts = buildSpeechVoicePickerOptions(SPEECH_LANG);
  opts = mergeOrphanSpeechVoiceOption(opts, loadSpeechVoiceURI(), SPEECH_LANG);
  voiceOptions.value = opts;
}

function onSpeechVoiceChange(ev: Event) {
  const el = ev.target as HTMLSelectElement;
  speechVoiceURI.value = el.value;
  saveSpeechVoiceURI(el.value || null);
  speech.value?.setVoiceURI(el.value || null);
}

let statsTimer: ReturnType<typeof setInterval> | null = null;
let unsubSpeechVoices: (() => void) | null = null;
const displayNow = ref(Date.now());

function totalChars(state: PracticeState) {
  return state.units.filter((u) => !u.isPunctuation).length;
}

function focusInput() {
  imeInput.value?.focus({ preventScroll: true });
}

async function loadPoem() {
  speech.value?.cancel();
  speechUnsupported.value = false;
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
    speech.value?.cancel();
    router.push("/");
    return;
  }
  if (!practice.value) return;
  if (ev.key === "Backspace") {
    ev.preventDefault();
    const prev = practice.value;
    practice.value = applyPracticeKey(practice.value, "backspace", Date.now());
    afterInput(prev);
    return;
  }
  if (/^[a-zA-Z]$/.test(ev.key)) {
    ev.preventDefault();
    const prev = practice.value;
    practice.value = applyPracticeKey(practice.value, ev.key, Date.now());
    afterInput(prev);
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
    const prev = practice.value;
    practice.value = applyPracticeKey(practice.value, ch, Date.now());
    afterInput(prev);
  }
  el.value = "";
}

function afterInput(prev: PracticeState | null) {
  if (!practice.value) return;
  if (prev && speech.value?.getEnabled()) {
    const ch = extractCompletedHanzi(prev, practice.value);
    if (ch) speech.value.enqueue(ch);
  }
  persistProgress();
  const tc = totalChars(practice.value);
  if (isPracticeComplete(practice.value)) {
    finishPractice(tc);
  }
}

function toggleSpeech() {
  speechEnabled.value = !speechEnabled.value;
  saveSpeechEnabled(speechEnabled.value);
  speech.value?.setEnabled(speechEnabled.value);
  if (speechEnabled.value) speechUnsupported.value = false;
}

function finishPractice(tc: number) {
  if (!practice.value || !poem.value) return;
  stopStatsTimer();
  speech.value?.cancel();
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
  speech.value?.cancel();
  router.push("/");
}

function restart() {
  if (!poem.value) return;
  speech.value?.cancel();
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
  unsubSpeechVoices = subscribeSpeechVoices(refreshSpeechVoiceOptions);
  refreshSpeechVoiceOptions();
  speech.value = createSpeechQueue({
    lang: SPEECH_LANG,
    voiceURI: speechVoiceURI.value || null,
    onUnsupported: () => {
      speechUnsupported.value = true;
    }
  });
  speech.value.setEnabled(speechEnabled.value);
  loadPoem();
  window.addEventListener("keydown", onWindowKey);
  window.addEventListener("keydown", onKey);
});

onUnmounted(() => {
  unsubSpeechVoices?.();
  unsubSpeechVoices = null;
  stopStatsTimer();
  window.removeEventListener("keydown", onWindowKey);
  window.removeEventListener("keydown", onKey);
  speech.value?.destroy();
  speech.value = null;
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
        <button
          type="button"
          class="ghost-btn"
          :aria-pressed="speechEnabled"
          aria-label="朗读开关"
          @click="toggleSpeech"
        >
          {{ speechEnabled ? "朗读：开" : "朗读：关" }}
        </button>
        <label class="speech-voice-wrap">
          <span class="speech-voice-label">音色</span>
          <select
            class="speech-voice-select"
            aria-label="朗读音色"
            :value="speechVoiceURI"
            @change="onSpeechVoiceChange"
          >
            <option
              v-for="opt in voiceOptions"
              :key="opt.value === '' ? 'default' : opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </label>
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
        <p class="practice-genre">{{ practiceGenreLabel }}</p>
      </div>

      <TypingPanel
        :poem="poem"
        :units="practice.units"
        :cursor="practice.cursor"
        :typed-buffer="practice.typedBuffer"
        :current-error="practice.currentError"
        :failed-snapshots="practice.failedSnapshots"
      />

      <div class="footer-stats" aria-live="polite">
        <span>用时 <b>{{ statsDisplay.elapsed }}</b></span>
        <span>准确率 <b>{{ statsDisplay.accuracy }}</b></span>
        <span>按键速度 <b>{{ statsDisplay.kpm }}</b></span>
        <span>打字速度 <b>{{ statsDisplay.cpm }}</b></span>
        <span>正确打字速度 <b>{{ statsDisplay.correctCpm }}</b></span>
        <span>进度 <b>{{ statsDisplay.progress }}</b></span>
      </div>
      <p v-if="speechUnsupported" class="speech-hint" role="status">
        当前环境不支持朗读（浏览器或系统未提供语音合成）。
      </p>
      <p class="hint-kbd">
        练习时按 Esc 返回课程；使用键盘输入拼音。开启顶栏「朗读」可听字音（默认关）。
      </p>

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

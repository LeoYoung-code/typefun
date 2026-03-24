<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { Poem } from "@typefun/typing-core";
import { formatPercent } from "@typefun/typing-core";

import { loadState, type SavedState } from "../lib/storage";

const router = useRouter();
const poems = ref<Poem[] | null>(null);
const loadError = ref<string | null>(null);
const saved = ref<SavedState>(loadState());

const finishDialog = ref<HTMLDialogElement | null>(null);
const finishSummary = ref("");
const finishStars = ref("");

function tryOpenFinishDialog() {
  const raw = sessionStorage.getItem("TYPEFUN_FINISH_V1");
  if (!raw) return;
  sessionStorage.removeItem("TYPEFUN_FINISH_V1");
  try {
    const data = JSON.parse(raw) as { summary: string; stars: string };
    finishSummary.value = data.summary;
    finishStars.value = data.stars;
    void nextTick(() => finishDialog.value?.showModal());
  } catch {
    /* ignore */
  }
}

function closeFinishDialog() {
  finishDialog.value?.close();
}

async function fetchPoems() {
  loadError.value = null;
  poems.value = null;
  try {
    const res = await fetch("/api/poems");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    poems.value = (await res.json()) as Poem[];
  } catch {
    loadError.value = "载入诗词失败，请确认已启动 API（pnpm dev:api）后重试。";
  }
}

onMounted(() => {
  fetchPoems();
  saved.value = loadState();
  tryOpenFinishDialog();
});

function renderStars(num: number) {
  const n = Math.max(0, Math.min(5, num));
  return `${"★".repeat(n)}${"☆".repeat(5 - n)}`;
}

const continueVisible = computed(() => {
  const id = saved.value.lastPoemId;
  if (!id) return false;
  const poem = poems.value?.find((p) => p.id === id);
  const progress = saved.value.progressByPoem[id];
  return Boolean(poem && progress);
});

const continueText = computed(() => {
  const id = saved.value.lastPoemId;
  if (!id) return "";
  const poem = poems.value?.find((p) => p.id === id);
  const progress = saved.value.progressByPoem[id];
  if (!poem || !progress) return "";
  return `上次练习：${poem.title} · 进度 ${formatPercent(progress.progress)}`;
});

function startPractice(id: string) {
  router.push({ name: "practice", params: { id } });
}

function continuePractice() {
  const id = saved.value.lastPoemId;
  if (id) startPractice(id);
}
</script>

<template>
  <header class="topbar">
    <RouterLink class="logo" to="/">Typefun</RouterLink>
    <div class="top-actions" />
  </header>

  <main>
    <h1 class="title">经典唐诗必背</h1>
    <p class="subtitle">Vue + Node（MVS）· 打开即练</p>

    <div v-if="loadError" class="load-error">
      <p>{{ loadError }}</p>
      <button type="button" class="primary-btn" @click="fetchPoems">重试</button>
    </div>

    <template v-else-if="poems">
      <div v-if="continueVisible" class="continue-box">
        <div class="continue-text">{{ continueText }}</div>
        <button type="button" class="primary-btn" @click="continuePractice">
          继续上次练习
        </button>
      </div>

      <div class="course-grid">
        <article
          v-for="poem in poems"
          :key="poem.id"
          class="course-card"
          :class="{ locked: !poem.unlocked }"
        >
          <div class="course-card-top">
            <span>{{ renderStars(saved.bestByPoem[poem.id]?.stars ?? poem.stars ?? 0) }}</span>
            <span>{{ poem.unlocked ? "可练习" : "🔒 未解锁" }}</span>
          </div>
          <div>
            <div class="course-card-title">《{{ poem.title }}》</div>
            <div class="course-card-author">{{ poem.author }}</div>
          </div>
          <button
            type="button"
            class="primary-btn"
            :disabled="!poem.unlocked"
            @click="startPractice(poem.id)"
          >
            {{ poem.unlocked ? "开始练习" : "已锁定" }}
          </button>
        </article>
      </div>
    </template>

    <p v-else class="subtitle">载入诗词…</p>
  </main>

  <dialog
    ref="finishDialog"
    class="finish-dialog"
    aria-labelledby="finish-dialog-title-home"
  >
    <div class="finish-dialog-inner">
      <h3 id="finish-dialog-title-home" class="finish-dialog-title">练习完成</h3>
      <p class="finish-dialog-summary">{{ finishSummary }}</p>
      <p class="finish-dialog-stars" aria-live="polite">{{ finishStars }}</p>
      <button type="button" class="primary-btn finish-dialog-btn" @click="closeFinishDialog">
        回到课程
      </button>
    </div>
  </dialog>
</template>

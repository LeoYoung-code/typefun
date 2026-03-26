<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch
} from "vue";
import { useRouter } from "vue-router";
import type { PoemCategory, PoemListItem } from "@typefun/typing-core";
import { POEM_CATEGORY_LABELS, formatPercent } from "@typefun/typing-core";

import { loadState, type SavedState } from "../lib/storage";

const router = useRouter();
const loadError = ref<string | null>(null);
const saved = ref<SavedState>(loadState());

const featured = ref<PoemListItem | null>(null);

type PageResponse = {
  items: PoemListItem[];
  total: number;
  page: number;
  pageSize: number;
};

const tangPage = ref<PageResponse | null>(null);
const songPage = ref<PageResponse | null>(null);
const tangPageNum = ref(1);
const songPageNum = ref(1);
const pageSize = 6;

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_LEN = 2;
const searchPageSize = 18;

const searchInput = ref("");
const debouncedQ = ref("");
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const searchCategory = ref<"all" | PoemCategory>("all");
const searchPage = ref<PageResponse | null>(null);
const searchLoading = ref(false);
let searchAbort: AbortController | null = null;

watch(searchInput, (v) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debouncedQ.value = v.trim();
    debounceTimer = null;
  }, SEARCH_DEBOUNCE_MS);
});

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  searchAbort?.abort();
});

const isSearchMode = computed(() => debouncedQ.value.length >= SEARCH_MIN_LEN);

async function loadSearchPage(page: number) {
  const q = debouncedQ.value;
  if (q.length < SEARCH_MIN_LEN) {
    searchPage.value = null;
    searchLoading.value = false;
    return;
  }
  searchAbort?.abort();
  searchAbort = new AbortController();
  const signal = searchAbort.signal;
  searchLoading.value = true;
  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(searchPageSize),
      category: searchCategory.value,
      q
    });
    const res = await fetch(`/api/poems?${params}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as PageResponse;
    searchPage.value = data;
  } catch {
    if (signal.aborted) return;
    searchPage.value = null;
  } finally {
    searchLoading.value = false;
  }
}

watch(debouncedQ, () => {
  void loadSearchPage(1);
});

watch(searchCategory, () => {
  if (debouncedQ.value.length < SEARCH_MIN_LEN) return;
  void loadSearchPage(1);
});

function clearSearch() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  searchAbort?.abort();
  searchInput.value = "";
  debouncedQ.value = "";
  searchPage.value = null;
  searchLoading.value = false;
}

async function goSearchPage(page: number) {
  const data = searchPage.value;
  if (!data) return;
  const max = Math.max(1, Math.ceil(data.total / data.pageSize));
  const next = Math.min(max, Math.max(1, page));
  await loadSearchPage(next);
}

function setSearchCategory(cat: "all" | PoemCategory) {
  searchCategory.value = cat;
}

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

async function fetchFeatured() {
  try {
    const res = await fetch("/api/poems/random");
    if (!res.ok) {
      featured.value = null;
      return;
    }
    featured.value = (await res.json()) as PoemListItem;
  } catch {
    featured.value = null;
  }
}

async function fetchSection(
  category: PoemCategory,
  page: number
): Promise<PageResponse> {
  const res = await fetch(
    `/api/poems?category=${category}&page=${page}&pageSize=${pageSize}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as PageResponse;
}

async function loadHome() {
  loadError.value = null;
  clearSearch();
  tangPage.value = null;
  songPage.value = null;
  featured.value = null;
  try {
    await Promise.all([
      fetchFeatured(),
      fetchSection("tang", tangPageNum.value).then((r) => {
        tangPage.value = r;
      }),
      fetchSection("song_ci", songPageNum.value).then((r) => {
        songPage.value = r;
      })
    ]);
  } catch {
    loadError.value =
      "载入诗词失败，请确认已启动 API（pnpm dev:api）后重试。";
  }
}

async function goToPage(category: PoemCategory, page: number) {
  const data = category === "tang" ? tangPage.value : songPage.value;
  if (!data) return;
  const max = Math.max(1, Math.ceil(data.total / data.pageSize));
  const next = Math.min(max, Math.max(1, page));
  if (category === "tang") tangPageNum.value = next;
  else songPageNum.value = next;
  try {
    const res = await fetchSection(category, next);
    if (category === "tang") tangPage.value = res;
    else songPage.value = res;
  } catch {
    /* ignore */
  }
}

function maxPage(d: PageResponse | null): number {
  if (!d) return 1;
  return Math.max(1, Math.ceil(d.total / d.pageSize));
}

onMounted(() => {
  void loadHome();
  saved.value = loadState();
  tryOpenFinishDialog();
});

const lastPoemMeta = ref<{ title: string; author: string } | null>(null);

watch(
  () => saved.value.lastPoemId,
  async (id) => {
    if (!id) {
      lastPoemMeta.value = null;
      return;
    }
    try {
      const res = await fetch(`/api/poems/${encodeURIComponent(id)}`);
      if (!res.ok) {
        lastPoemMeta.value = null;
        return;
      }
      const p = (await res.json()) as { title: string; author: string };
      lastPoemMeta.value = { title: p.title, author: p.author };
    } catch {
      lastPoemMeta.value = null;
    }
  },
  { immediate: true }
);

function renderStars(num: number) {
  const n = Math.max(0, Math.min(5, num));
  return `${"★".repeat(n)}${"☆".repeat(5 - n)}`;
}

/** 列表卡片左上角：未练过显示「未练习」，避免整行空心星噪音 */
function starLine(poem: PoemListItem): {
  text: string;
  empty: boolean;
  aria: string;
} {
  const n = Math.max(
    0,
    Math.min(5, saved.value.bestByPoem[poem.id]?.stars ?? poem.stars ?? 0)
  );
  if (n === 0) {
    return { text: "未练习", empty: true, aria: "尚未练习" };
  }
  return {
    text: renderStars(n),
    empty: false,
    aria: `已获 ${n} 星`
  };
}

const continueVisible = computed(() => {
  const id = saved.value.lastPoemId;
  if (!id) return false;
  const progress = saved.value.progressByPoem[id];
  return Boolean(progress && lastPoemMeta.value);
});

const continueText = computed(() => {
  const id = saved.value.lastPoemId;
  if (!id || !lastPoemMeta.value) return "";
  const progress = saved.value.progressByPoem[id];
  if (!progress) return "";
  return `上次练习：${lastPoemMeta.value.title} · 进度 ${formatPercent(progress.progress)}`;
});

function startPractice(id: string) {
  router.push({ name: "practice", params: { id } });
}

function continuePractice() {
  const id = saved.value.lastPoemId;
  if (id) startPractice(id);
}

const listReady = computed(
  () => tangPage.value !== null && songPage.value !== null
);

const poemSections = computed(() => {
  const out: {
    key: PoemCategory;
    label: string;
    data: PageResponse;
  }[] = [];
  if (tangPage.value && tangPage.value.total > 0) {
    out.push({
      key: "tang",
      label: POEM_CATEGORY_LABELS.tang,
      data: tangPage.value
    });
  }
  if (songPage.value && songPage.value.total > 0) {
    out.push({
      key: "song_ci",
      label: POEM_CATEGORY_LABELS.song_ci,
      data: songPage.value
    });
  }
  return out;
});
</script>

<template>
  <header class="topbar">
    <RouterLink class="logo" to="/">Typefun</RouterLink>
    <div class="top-actions" />
  </header>

  <main>
    <h1 class="title">经典古诗词</h1>
    <p class="subtitle">Vue + Node（MVS）· 唐诗与宋词 · 打开即练</p>

    <div v-if="loadError" class="load-error">
      <p>{{ loadError }}</p>
      <button type="button" class="primary-btn" @click="loadHome">重试</button>
    </div>

    <template v-else-if="listReady">
      <div class="poem-search-bar">
        <input
          id="poem-search"
          v-model="searchInput"
          type="search"
          class="poem-search-input"
          placeholder="搜索标题或作者（至少 2 字）"
          aria-label="搜索诗词标题或作者"
          autocomplete="off"
          enterkeyhint="search"
        />
        <button
          v-if="searchInput.trim()"
          type="button"
          class="ghost-btn"
          @click="clearSearch"
        >
          清空
        </button>
      </div>

      <template v-if="isSearchMode">
        <div class="search-category-row" role="group" aria-label="搜索范围">
          <button
            type="button"
            class="ghost-btn search-cat-btn"
            :class="{ active: searchCategory === 'all' }"
            @click="setSearchCategory('all')"
          >
            全部
          </button>
          <button
            type="button"
            class="ghost-btn search-cat-btn"
            :class="{ active: searchCategory === 'tang' }"
            @click="setSearchCategory('tang')"
          >
            {{ POEM_CATEGORY_LABELS.tang }}
          </button>
          <button
            type="button"
            class="ghost-btn search-cat-btn"
            :class="{ active: searchCategory === 'song_ci' }"
            @click="setSearchCategory('song_ci')"
          >
            {{ POEM_CATEGORY_LABELS.song_ci }}
          </button>
        </div>

        <section class="poem-section" aria-labelledby="search-results-title">
          <h2 id="search-results-title" class="poem-section-title">搜索结果</h2>
          <p v-if="searchLoading" class="search-loading">搜索中…</p>
          <template v-else-if="searchPage">
            <p v-if="searchPage.total === 0" class="search-empty">
              未找到匹配的诗词。
            </p>
            <template v-else>
              <div class="course-grid">
                <article
                  v-for="poem in searchPage.items"
                  :key="poem.id"
                  class="course-card"
                >
                  <div class="course-card-top">
                    <template v-for="line in [starLine(poem)]" :key="poem.id">
                      <span
                        class="course-card-stars"
                        :class="{ 'course-card-stars--empty': line.empty }"
                        :aria-label="line.aria"
                        >{{ line.text }}</span
                      >
                    </template>
                    <span>可练习</span>
                  </div>
                  <div>
                    <div class="course-card-title">《{{ poem.title }}》</div>
                    <div class="course-card-author">{{ poem.author }}</div>
                  </div>
                  <button
                    type="button"
                    class="primary-btn"
                    @click="startPractice(poem.id)"
                  >
                    开始练习
                  </button>
                </article>
              </div>
              <div class="section-pager">
                <button
                  type="button"
                  class="ghost-btn"
                  :disabled="searchPage.page <= 1"
                  @click="goSearchPage(searchPage.page - 1)"
                >
                  上一页
                </button>
                <span class="pager-meta"
                  >第 {{ searchPage.page }} / {{ maxPage(searchPage) }} 页 · 共
                  {{ searchPage.total }} 首</span
                >
                <button
                  type="button"
                  class="ghost-btn"
                  :disabled="searchPage.page >= maxPage(searchPage)"
                  @click="goSearchPage(searchPage.page + 1)"
                >
                  下一页
                </button>
              </div>
            </template>
          </template>
          <p v-else class="search-empty">未能载入搜索结果。</p>
        </section>
      </template>

      <template v-else>
        <section v-if="featured" class="featured-poem" aria-labelledby="feat-title">
          <h2 id="feat-title" class="poem-section-title">随机一首</h2>
          <p class="featured-title">《{{ featured.title }}》</p>
          <p class="featured-author">{{ featured.author }}</p>
          <button
            type="button"
            class="primary-btn"
            @click="startPractice(featured.id)"
          >
            开始练习
          </button>
        </section>

        <div v-if="continueVisible" class="continue-box">
          <div class="continue-text">{{ continueText }}</div>
          <button type="button" class="primary-btn" @click="continuePractice">
            继续上次练习
          </button>
        </div>

        <section
          v-for="section in poemSections"
          :key="section.key"
          class="poem-section"
        >
          <h2 class="poem-section-title">{{ section.label }}</h2>
          <div class="course-grid">
            <article
              v-for="poem in section.data.items"
              :key="poem.id"
              class="course-card"
            >
              <div class="course-card-top">
                <template v-for="line in [starLine(poem)]" :key="poem.id">
                  <span
                    class="course-card-stars"
                    :class="{ 'course-card-stars--empty': line.empty }"
                    :aria-label="line.aria"
                    >{{ line.text }}</span
                  >
                </template>
                <span>可练习</span>
              </div>
              <div>
                <div class="course-card-title">《{{ poem.title }}》</div>
                <div class="course-card-author">{{ poem.author }}</div>
              </div>
              <button
                type="button"
                class="primary-btn"
                @click="startPractice(poem.id)"
              >
                开始练习
              </button>
            </article>
          </div>
          <div class="section-pager">
            <button
              type="button"
              class="ghost-btn"
              :disabled="section.data.page <= 1"
              @click="goToPage(section.key, section.data.page - 1)"
            >
              上一页
            </button>
            <span class="pager-meta"
              >第 {{ section.data.page }} / {{ maxPage(section.data) }} 页 · 共
              {{ section.data.total }} 首</span
            >
            <button
              type="button"
              class="ghost-btn"
              :disabled="section.data.page >= maxPage(section.data)"
              @click="goToPage(section.key, section.data.page + 1)"
            >
              下一页
            </button>
          </div>
        </section>
      </template>
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

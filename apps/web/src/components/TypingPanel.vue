<script setup lang="ts">
import { computed } from "vue";
import type { Poem, Unit } from "@typefun/typing-core";

const props = defineProps<{
  poem: Poem;
  units: Unit[];
  cursor: number;
  typedBuffer: string;
  currentError: boolean;
  failedSnapshots: Record<string, string>;
}>();

const lineStarts = computed(() => {
  const starts: number[] = [];
  let acc = 0;
  for (const line of props.poem.lines) {
    starts.push(acc);
    acc += line.hanzi.length;
  }
  return starts;
});

function pyLetters(expectedRaw: string, typedBuffer: string) {
  const expected = expectedRaw || "";
  const items: { ch: string; cls: string }[] = [];
  for (let i = 0; i < expected.length; i += 1) {
    const typed = typedBuffer[i];
    const current = expected[i];
    if (typed !== undefined) {
      items.push({
        ch: typed === current ? current : typed,
        cls: typed === current ? "ok" : "err"
      });
    } else {
      const cls = i === typedBuffer.length ? "pending next" : "pending";
      items.push({ ch: current, cls });
    }
  }
  if (typedBuffer.length > expected.length) {
    for (let i = expected.length; i < typedBuffer.length; i += 1) {
      items.push({ ch: typedBuffer[i], cls: "err" });
    }
  }
  return items;
}

/** 已完成字含错键：逐字母着色；快照较短时剩余字母按绿色展示 */
function pyLettersFailed(expectedRaw: string, failTyped: string) {
  const expected = expectedRaw || "";
  const items: { ch: string; cls: string }[] = [];
  for (let i = 0; i < expected.length; i += 1) {
    if (i < failTyped.length) {
      const t = failTyped[i];
      const e = expected[i];
      items.push({
        ch: t === e ? e : t,
        cls: t === e ? "ok" : "err"
      });
    } else {
      items.push({ ch: expected[i], cls: "ok" });
    }
  }
  if (failTyped.length > expected.length) {
    for (let i = expected.length; i < failTyped.length; i += 1) {
      items.push({ ch: failTyped[i], cls: "err" });
    }
  }
  return items;
}
</script>

<template>
  <div class="typing-panel">
    <div
      v-for="(line, lineIndex) in poem.lines"
      :key="lineIndex"
      class="line-block"
    >
      <div
        class="line-grid"
        :style="{
          gridTemplateColumns: `repeat(${line.hanzi.length}, minmax(1.2em, max-content))`
        }"
      >
        <div
          v-for="(char, idx) in line.hanzi"
          :key="`${lineIndex}-${idx}`"
          class="line-cell"
        >
          <span
            class="py-cell"
            :class="{
              punct: units[lineStarts[lineIndex] + idx].isPunctuation,
              done:
                lineStarts[lineIndex] + idx < cursor &&
                !units[lineStarts[lineIndex] + idx].isPunctuation &&
                failedSnapshots[String(lineStarts[lineIndex] + idx)] === undefined,
              current: lineStarts[lineIndex] + idx === cursor,
              error: lineStarts[lineIndex] + idx === cursor && currentError
            }"
          >
            <template
              v-if="
                lineStarts[lineIndex] + idx < cursor &&
                !units[lineStarts[lineIndex] + idx].isPunctuation &&
                failedSnapshots[String(lineStarts[lineIndex] + idx)] !== undefined
              "
            >
              <span
                v-for="(pl, pi) in pyLettersFailed(
                  units[lineStarts[lineIndex] + idx].pinyinRaw,
                  failedSnapshots[String(lineStarts[lineIndex] + idx)]!
                )"
                :key="pi"
                class="py-letter"
                :class="pl.cls"
                >{{ pl.ch }}</span
              >
            </template>
            <template
              v-else-if="
                lineStarts[lineIndex] + idx === cursor &&
                !units[lineStarts[lineIndex] + idx].isPunctuation
              "
            >
              <span
                v-for="(pl, pi) in pyLetters(
                  units[lineStarts[lineIndex] + idx].pinyinRaw,
                  typedBuffer
                )"
                :key="pi"
                class="py-letter"
                :class="pl.cls"
                >{{ pl.ch }}</span
              >
            </template>
            <template v-else>
              {{ line.pinyin[idx] || char }}
            </template>
          </span>
          <span
            class="hz-cell"
            :class="{
              punct: units[lineStarts[lineIndex] + idx].isPunctuation,
              done:
                lineStarts[lineIndex] + idx < cursor &&
                !units[lineStarts[lineIndex] + idx].isPunctuation &&
                failedSnapshots[String(lineStarts[lineIndex] + idx)] === undefined,
              current: lineStarts[lineIndex] + idx === cursor,
              error:
                (lineStarts[lineIndex] + idx === cursor && currentError) ||
                (lineStarts[lineIndex] + idx < cursor &&
                  !units[lineStarts[lineIndex] + idx].isPunctuation &&
                  failedSnapshots[String(lineStarts[lineIndex] + idx)] !== undefined)
            }"
            >{{ char }}</span
          >
        </div>
      </div>
    </div>
  </div>
</template>

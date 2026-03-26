<script setup lang="ts">
import { computed } from "vue";
import { pinyinDisplayLetters, type Poem, type Unit } from "@typefun/typing-core";

const props = defineProps<{
  poem: Poem;
  units: Unit[];
  cursor: number;
  typedBuffer: string;
  currentError: boolean;
  failedSnapshots: Record<string, string>;
  /** 当前音节内曾打错过、现已打对的位置（与 engine syllableEverWrong 对齐） */
  syllableEverWrong: boolean[];
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

function pyLetters(
  pinyinTone: string,
  expectedRaw: string,
  typedBuffer: string,
  everWrong: boolean[]
) {
  const expected = expectedRaw || "";
  const display = pinyinDisplayLetters(pinyinTone || "");
  const items: { ch: string; cls: string }[] = [];
  for (let i = 0; i < expected.length; i += 1) {
    const typed = typedBuffer[i];
    const current = expected[i];
    const showCh = display[i] ?? current;
    if (typed !== undefined) {
      if (typed !== current) {
        items.push({ ch: typed, cls: "err" });
      } else {
        const wasRetried = everWrong[i] === true;
        items.push({ ch: showCh, cls: wasRetried ? "fixed" : "ok" });
      }
    } else {
      const cls = i === typedBuffer.length ? "pending next" : "pending";
      items.push({ ch: showCh, cls });
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
function pyLettersFailed(pinyinTone: string, expectedRaw: string, failTyped: string) {
  const expected = expectedRaw || "";
  const display = pinyinDisplayLetters(pinyinTone || "");
  const items: { ch: string; cls: string }[] = [];
  for (let i = 0; i < expected.length; i += 1) {
    const showCh = display[i] ?? expected[i];
    if (i < failTyped.length) {
      const t = failTyped[i];
      const e = expected[i];
      items.push({
        ch: t === e ? showCh : t,
        cls: t === e ? "ok" : "err"
      });
    } else {
      items.push({ ch: showCh, cls: "ok" });
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
          /* 每列按内容撑开，避免长拼音被压窄后与相邻列叠在一起 */
          gridTemplateColumns: `repeat(${line.hanzi.length}, max-content)`
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
                  units[lineStarts[lineIndex] + idx].pinyin,
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
                  units[lineStarts[lineIndex] + idx].pinyin,
                  units[lineStarts[lineIndex] + idx].pinyinRaw,
                  typedBuffer,
                  syllableEverWrong
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

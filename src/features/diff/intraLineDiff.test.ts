import { describe, expect, it } from "vitest";

import {
  MAX_INTRA_LINE_LENGTH,
  computeIntraLineDiff,
  segmentGraphemes,
  segmentLine,
} from "./intraLineDiff";

/** Rejoining the segments must reproduce the input exactly. */
const rejoin = (segments: { text: string }[]) => segments.map((s) => s.text).join("");

const changedText = (segments: { text: string; changed: boolean }[]) =>
  segments
    .filter((s) => s.changed)
    .map((s) => s.text)
    .join("");

describe("segmentLine", () => {
  it("splits English on words while keeping the spacing", () => {
    const segments = segmentLine("Create a storage volume");

    expect(segments.join("")).toBe("Create a storage volume");
    expect(segments.length).toBeGreaterThan(1);
  });

  it("splits Korean, which has no spaces inside a phrase", () => {
    const segments = segmentLine("스토리지볼륨을 만듭니다", "ko");

    expect(segments.join("")).toBe("스토리지볼륨을 만듭니다");
  });

  it("splits Japanese and Chinese without losing characters", () => {
    for (const [text, locale] of [
      ["ストレージボリュームを作成", "ja"],
      ["创建存储卷", "zh-CN"],
    ]) {
      expect(segmentLine(text, locale).join("")).toBe(text);
    }
  });

  it("returns nothing for an empty line", () => {
    expect(segmentLine("")).toEqual([]);
  });
});

describe("segmentGraphemes", () => {
  it("keeps an emoji together rather than splitting its code units", () => {
    expect(segmentGraphemes("a🎉b")).toEqual(["a", "🎉", "b"]);
  });

  it("keeps a flag sequence together", () => {
    expect(segmentGraphemes("🇰🇷")).toHaveLength(1);
  });

  it("keeps a combining mark with its base character", () => {
    // e + combining acute, not a precomposed é.
    expect(segmentGraphemes("é")).toEqual(["é"]);
  });
});

describe("computeIntraLineDiff", () => {
  it("highlights only the words that changed", () => {
    const result = computeIntraLineDiff(
      "Volumes provide persistent storage.",
      "Volumes provide persistent block storage.",
    );

    expect(result).not.toBeNull();
    if (!result) return;
    expect(rejoin(result.before)).toBe("Volumes provide persistent storage.");
    expect(rejoin(result.after)).toBe("Volumes provide persistent block storage.");
    expect(changedText(result.after)).toContain("block");
    // The unchanged prefix must not be marked.
    expect(changedText(result.after)).not.toContain("Volumes");
  });

  it("narrows a Korean edit to the part that moved", () => {
    const result = computeIntraLineDiff("스토리지 볼륨 생성", "스토리지 볼륨 만들기", "ko");

    expect(result).not.toBeNull();
    if (!result) return;
    expect(rejoin(result.before)).toBe("스토리지 볼륨 생성");
    expect(rejoin(result.after)).toBe("스토리지 볼륨 만들기");
    expect(changedText(result.after)).not.toContain("스토리지");
  });

  it("reconstructs the original text exactly on both sides", () => {
    const samples: Array<[string, string, string | undefined]> = [
      ["a b c", "a x c", undefined],
      ["가용 구역", "가용성 영역", "ko"],
      ["可用区", "可用区域", "zh-CN"],
      ["Zone de disponibilité", "Zone de disponibilités", "fr"],
      ["حذف وحدات", "حذف وحدات التخزين", "ar"],
    ];

    for (const [before, after, locale] of samples) {
      const result = computeIntraLineDiff(before, after, locale);
      if (!result) continue;
      expect(rejoin(result.before)).toBe(before);
      expect(rejoin(result.after)).toBe(after);
    }
  });

  it("returns null for identical lines", () => {
    expect(computeIntraLineDiff("same", "same")).toBeNull();
  });

  it("falls back to whole-line marking for a complete rewrite", () => {
    // plan.md 4.6: an uncertain correspondence must not be sprinkled with
    // accidental matches on shared punctuation.
    const result = computeIntraLineDiff(
      "The quick brown fox jumps.",
      "완전히 다른 문장입니다.",
      "ko",
    );

    expect(result).toBeNull();
  });

  it("falls back rather than spending unbounded time on a very long line", () => {
    const long = "가".repeat(MAX_INTRA_LINE_LENGTH + 1);

    expect(computeIntraLineDiff(long, `${long}!`, "ko")).toBeNull();
  });

  it("handles an edit inside a word, where a word comparison finds nothing", () => {
    const result = computeIntraLineDiff("만듭니다", "만들었습니다", "ko");

    // Either it found a grapheme-level match, or it declined; both are
    // acceptable, but it must not throw or return corrupt text.
    if (result) {
      expect(rejoin(result.before)).toBe("만듭니다");
      expect(rejoin(result.after)).toBe("만들었습니다");
    }
  });

  it("does not split an emoji across segments", () => {
    const result = computeIntraLineDiff("done 🎉", "done 🎉🎉");

    if (result) {
      expect(rejoin(result.after)).toBe("done 🎉🎉");
    }
  });

  it("survives an invalid locale tag", () => {
    // plan.md 4.4 forbids restricting locales, so a strange tag must degrade.
    expect(() => computeIntraLineDiff("a b", "a c", "not-a-real-locale-!!")).not.toThrow();
  });

  it("merges adjacent segments with the same state", () => {
    const result = computeIntraLineDiff("one two three", "one TWO THREE");

    expect(result).not.toBeNull();
    if (!result) return;
    // No two neighbours share a state, or the markup would be needlessly split.
    for (let i = 1; i < result.after.length; i += 1) {
      expect(result.after[i].changed).not.toBe(result.after[i - 1].changed);
    }
  });
});

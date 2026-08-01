import { describe, expect, it } from "vitest";

import { scrollRatio, scrollTopForRatio, shouldApplyScroll } from "./scrollSync";

const metrics = (scrollTop: number, scrollHeight: number, clientHeight = 500) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

describe("scrollRatio", () => {
  it("is 0 at the top and 1 at the bottom", () => {
    expect(scrollRatio(metrics(0, 1500))).toBe(0);
    expect(scrollRatio(metrics(1000, 1500))).toBe(1);
  });

  it("is proportional in between", () => {
    expect(scrollRatio(metrics(500, 1500))).toBeCloseTo(0.5);
  });

  it("is 0 when the content fits, rather than dividing by zero", () => {
    expect(scrollRatio(metrics(0, 400, 500))).toBe(0);
    expect(scrollRatio(metrics(0, 500, 500))).toBe(0);
  });

  it("clamps an overscrolled position", () => {
    // Momentum scrolling can report a scrollTop past the end.
    expect(scrollRatio(metrics(2000, 1500))).toBe(1);
    expect(scrollRatio(metrics(-50, 1500))).toBe(0);
  });
});

describe("scrollTopForRatio", () => {
  it("maps a ratio onto a panel's own scrollable range", () => {
    // plan.md 4.6: panels align by proportion, not by line number, because a
    // translation rarely has the same line count as its source.
    expect(scrollTopForRatio(metrics(0, 1500), 0.5)).toBe(500);
    expect(scrollTopForRatio(metrics(0, 3500), 0.5)).toBe(1500);
  });

  it("maps the ends exactly", () => {
    expect(scrollTopForRatio(metrics(0, 1500), 0)).toBe(0);
    expect(scrollTopForRatio(metrics(0, 1500), 1)).toBe(1000);
  });

  it("returns 0 for a panel with nothing to scroll", () => {
    expect(scrollTopForRatio(metrics(0, 400, 500), 0.5)).toBe(0);
  });

  it("clamps a ratio outside the range", () => {
    expect(scrollTopForRatio(metrics(0, 1500), 2)).toBe(1000);
    expect(scrollTopForRatio(metrics(0, 1500), -1)).toBe(0);
  });

  it("round-trips a ratio back to the same position", () => {
    const source = metrics(750, 2500);
    const target = metrics(0, 4000);
    const applied = scrollTopForRatio(target, scrollRatio(source));

    expect(scrollRatio({ ...target, scrollTop: applied })).toBeCloseTo(scrollRatio(source), 3);
  });
});

describe("shouldApplyScroll", () => {
  it("ignores a sub-pixel difference", () => {
    // Writing scrollTop fires another scroll event, so without a threshold two
    // panels would push each other back and forth.
    expect(shouldApplyScroll(500, 500)).toBe(false);
    expect(shouldApplyScroll(500, 500.5)).toBe(false);
  });

  it("applies a real difference", () => {
    expect(shouldApplyScroll(500, 520)).toBe(true);
    expect(shouldApplyScroll(520, 500)).toBe(true);
  });
});

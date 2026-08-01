/**
 * Proportional scroll synchronisation (plan.md 4.6).
 *
 * Panels are matched by how far through their own content each is, not by line
 * number. A translation rarely has the same line count as its source, so
 * aligning line numbers would drift further apart the longer the file.
 */

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

/** How far through the scrollable range a panel is, from 0 to 1. */
export function scrollRatio(metrics: ScrollMetrics): number {
  const scrollable = metrics.scrollHeight - metrics.clientHeight;
  // A panel shorter than its viewport has nothing to scroll; treat it as at the
  // start rather than dividing by zero.
  if (scrollable <= 0) return 0;
  return clamp(metrics.scrollTop / scrollable, 0, 1);
}

/** The scrollTop that puts a panel at the given ratio through its own content. */
export function scrollTopForRatio(metrics: ScrollMetrics, ratio: number): number {
  const scrollable = metrics.scrollHeight - metrics.clientHeight;
  if (scrollable <= 0) return 0;
  return Math.round(clamp(ratio, 0, 1) * scrollable);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Below this difference in pixels a panel is left alone.
 *
 * Writing a scrollTop fires another scroll event, so without a threshold two
 * panels rounding to different pixels would push each other back and forth.
 */
export const SYNC_EPSILON_PX = 1;

export function shouldApplyScroll(current: number, target: number): boolean {
  return Math.abs(current - target) > SYNC_EPSILON_PX;
}

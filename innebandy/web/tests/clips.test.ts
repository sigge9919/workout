import { describe, expect, it } from "vitest";
import { clampClip, clipForEvent, clipWindow, mergeIntervals } from "@/lib/clips";

describe("clipWindow", () => {
  it("defaults to 5 s before and after", () => {
    expect(clipWindow(null, null)).toEqual({ pre: 5, post: 5 });
  });
  it("uses team defaults, then per-type presets", () => {
    const team = { clip_pre_s: 6, clip_post_s: 4 };
    expect(clipWindow({ clip_pre_s: null, clip_post_s: null }, team)).toEqual({ pre: 6, post: 4 });
    expect(clipWindow({ clip_pre_s: 10, clip_post_s: null }, team)).toEqual({ pre: 10, post: 4 });
  });
});

describe("clampClip", () => {
  it("does not start before the video", () => {
    expect(clampClip(-3, 7, 100)).toEqual({ start: 0, end: 7 });
  });
  it("does not end after the video", () => {
    expect(clampClip(95, 105, 100)).toEqual({ start: 95, end: 100 });
  });
  it("keeps a minimal clip at the very end", () => {
    expect(clampClip(105, 110, 100)).toEqual({ start: 99.9, end: 100 });
  });
  it("only clamps at 0 when the duration is unknown", () => {
    expect(clampClip(95, 105, null)).toEqual({ start: 95, end: 105 });
  });
});

describe("clipForEvent", () => {
  it("matches the database rule", () => {
    expect(clipForEvent(100, { clip_pre_s: 10, clip_post_s: null }, { clip_pre_s: 5, clip_post_s: 5 }, 3600))
      .toEqual({ start: 90, end: 105 });
    expect(clipForEvent(2, null, null, 3600)).toEqual({ start: 0, end: 7 });
  });
});

describe("mergeIntervals", () => {
  it("merges overlapping clips into one sequence", () => {
    const m = mergeIntervals([
      { start: 20, end: 30, id: "b" },
      { start: 0, end: 10, id: "a" },
      { start: 25, end: 35, id: "c" },
    ]);
    expect(m.map(({ start, end }) => [start, end])).toEqual([[0, 10], [20, 35]]);
    expect(m[1].items.map((i) => i.id)).toEqual(["b", "c"]);
  });
  it("optionally merges near-touching clips", () => {
    const items = [{ start: 0, end: 10 }, { start: 11, end: 20 }];
    expect(mergeIntervals(items).length).toBe(2);
    expect(mergeIntervals(items, 1).length).toBe(1);
  });
});

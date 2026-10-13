import { describe, expect, it } from "vitest";
import { nextRate, resolveHotkey } from "@/lib/hotkeys";
import { fmtClock, fmtGameState, fmtVideo, parseClock } from "@/lib/time";

const cfg = {
  tagKeys: new Map([["s", "shot-id"], ["t", "turnover-id"]]),
  lineKeys: new Map([["1", "line-1"], ["2", "line-2"]]),
};

describe("resolveHotkey", () => {
  it("maps player controls", () => {
    expect(resolveHotkey({ key: " " }, cfg)).toEqual({ kind: "togglePlay" });
    expect(resolveHotkey({ key: "ArrowLeft" }, cfg)).toEqual({ kind: "seek", delta: -2 });
    expect(resolveHotkey({ key: "ArrowRight", shiftKey: true }, cfg)).toEqual({ kind: "seek", delta: 5 });
    expect(resolveHotkey({ key: "." }, cfg)).toEqual({ kind: "frame", dir: 1 });
    expect(resolveHotkey({ key: "[" }, cfg)).toEqual({ kind: "rate", dir: -1 });
  });
  it("maps tag keys case-insensitively", () => {
    expect(resolveHotkey({ key: "S" }, cfg)).toEqual({ kind: "tag", eventTypeId: "shot-id" });
    expect(resolveHotkey({ key: "q" }, cfg)).toBeNull();
  });
  it("maps lines and game states", () => {
    expect(resolveHotkey({ key: "2", code: "Digit2" }, cfg)).toEqual({ kind: "line", lineId: "line-2" });
    expect(resolveHotkey({ key: "0", code: "Digit0" }, cfg)).toEqual({ kind: "line", lineId: null });
    expect(resolveHotkey({ key: "!", code: "Digit1", shiftKey: true }, cfg)).toEqual({ kind: "gameState", index: 0 });
    expect(resolveHotkey({ key: "9", code: "Digit9" }, cfg)).toBeNull();
  });
  it("ignores browser shortcuts but supports undo", () => {
    expect(resolveHotkey({ key: "s", ctrlKey: true }, cfg)).toBeNull();
    expect(resolveHotkey({ key: "z", metaKey: true }, cfg)).toEqual({ kind: "undo" });
  });
});

describe("rates and formatting", () => {
  it("steps playback rate within bounds", () => {
    expect(nextRate(1, 1)).toBe(1.5);
    expect(nextRate(1, -1)).toBe(0.5);
    expect(nextRate(0.25, -1)).toBe(0.25);
    expect(nextRate(4, 1)).toBe(4);
  });
  it("formats and parses times", () => {
    expect(fmtVideo(3725.44)).toBe("1:02:05.4");
    expect(fmtVideo(65)).toBe("1:05.0");
    expect(fmtClock(754.9)).toBe("12:34");
    expect(parseClock("12:34")).toBe(754);
    expect(parseClock("0:05")).toBe(5);
    expect(parseClock("abc")).toBeNull();
    expect(fmtGameState("5v5")).toBe("5 mot 5");
    expect(fmtGameState("pp")).toBe("PP");
  });
});

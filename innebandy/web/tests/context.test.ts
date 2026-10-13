import { describe, expect, it } from "vitest";
import { activeAt, gameStateKey, matchTimeAt, toIntervals } from "@/lib/context";
import type { ClockAnchor } from "@/lib/types";

const anchor = (video_t: number, period: number, clock_s: number, kind: ClockAnchor["kind"] = "sync"): ClockAnchor =>
  ({ id: `${video_t}`, video_id: "v", video_t, period, clock_s, kind });

describe("matchTimeAt (mirrors SQL match_time_at)", () => {
  const anchors = [anchor(60, 1, 0, "period_start"), anchor(400, 1, 180)];
  it("is null before the first anchor", () => {
    expect(matchTimeAt(anchors, 30)).toBeNull();
  });
  it("runs the clock from the last anchor", () => {
    expect(matchTimeAt(anchors, 100)).toEqual({ period: 1, clock_s: 40 });
  });
  it("caps at the next anchor in the period (clock was stopped)", () => {
    expect(matchTimeAt(anchors, 260)).toEqual({ period: 1, clock_s: 180 });
  });
  it("caps at the period length and freezes at period end", () => {
    expect(matchTimeAt([anchor(0, 1, 1190)], 100)).toEqual({ period: 1, clock_s: 1200 });
    expect(matchTimeAt([anchor(0, 1, 1200, "period_end")], 100)).toEqual({ period: 1, clock_s: 1200 });
  });
});

describe("change points", () => {
  it("picks the latest change at or before t", () => {
    const c = [{ video_t: 10, id: "a" }, { video_t: 50, id: "b" }, { video_t: 30, id: "c" }];
    expect(activeAt(c, 40)?.id).toBe("c");
    expect(activeAt(c, 5)).toBeNull();
  });
  it("builds intervals", () => {
    const iv = toIntervals([{ video_t: 50 }, { video_t: 10 }], 100);
    expect(iv.map((i) => [i.start, i.end])).toEqual([[10, 50], [50, 100]]);
  });
  it("labels game states like the database view", () => {
    expect(gameStateKey(null)).toBe("5v5");
    expect(gameStateKey({ own_skaters: 5, opp_skaters: 4, own_goalie: true, opp_goalie: true })).toBe("pp");
    expect(gameStateKey({ own_skaters: 6, opp_skaters: 5, own_goalie: false, opp_goalie: true })).toBe("en_own");
    expect(gameStateKey({ own_skaters: 4, opp_skaters: 4, own_goalie: true, opp_goalie: true })).toBe("4v4");
  });
});

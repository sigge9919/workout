/**
 * Keyboard map for the tagging workspace. Pure function so it is unit-tested
 * and the same rules apply everywhere.
 *
 * Fixed keys (player):
 *   Space            play / pause
 *   ← / →            −2 s / +2 s
 *   Shift + ← / →    −5 s / +5 s
 *   , / .            one frame back / forward
 *   [ / ]            slower / faster
 *   Ctrl/Cmd + Z     undo last tag
 *   Escape           close the detail panel
 * Configurable:
 *   letters          tag types (event_types.hotkey)
 *   digits           own lines (lines.hotkey); 0 = no line on court
 *   Shift + 1..6     game state
 */

export type HotkeyAction =
  | { kind: "togglePlay" }
  | { kind: "seek"; delta: number }
  | { kind: "frame"; dir: 1 | -1 }
  | { kind: "rate"; dir: 1 | -1 }
  | { kind: "undo" }
  | { kind: "escape" }
  | { kind: "tag"; eventTypeId: string }
  | { kind: "line"; lineId: string | null }
  | { kind: "gameState"; index: number };

export interface KeyLike {
  key: string;
  code?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface HotkeyConfig {
  tagKeys: Map<string, string>; // lower-case key -> event type id
  lineKeys: Map<string, string>; // digit -> line id
}

export function resolveHotkey(e: KeyLike, cfg: HotkeyConfig): HotkeyAction | null {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z") return { kind: "undo" };
  if (mod || e.altKey) return null;

  switch (e.key) {
    case " ":
      return { kind: "togglePlay" };
    case "ArrowLeft":
      return { kind: "seek", delta: e.shiftKey ? -5 : -2 };
    case "ArrowRight":
      return { kind: "seek", delta: e.shiftKey ? 5 : 2 };
    case ",":
      return { kind: "frame", dir: -1 };
    case ".":
      return { kind: "frame", dir: 1 };
    case "[":
      return { kind: "rate", dir: -1 };
    case "]":
      return { kind: "rate", dir: 1 };
    case "Escape":
      return { kind: "escape" };
  }

  // Shift+digit: use the physical key, since Shift+1 yields "!" etc.
  const digit = /^Digit([0-9])$/.exec(e.code ?? "")?.[1] ?? (/^[0-9]$/.test(e.key) ? e.key : null);
  if (digit != null) {
    if (e.shiftKey) {
      const i = Number(digit);
      return i >= 1 && i <= GAME_STATES.length ? { kind: "gameState", index: i - 1 } : null;
    }
    if (digit === "0") return { kind: "line", lineId: null };
    const line = cfg.lineKeys.get(digit);
    return line ? { kind: "line", lineId: line } : null;
  }

  const tag = cfg.tagKeys.get(e.key.toLowerCase());
  return tag ? { kind: "tag", eventTypeId: tag } : null;
}

/** Game states reachable with Shift+1..6. */
export const GAME_STATES = [
  { label: "5 mot 5", own_skaters: 5, opp_skaters: 5, own_goalie: true, opp_goalie: true },
  { label: "PP (5 mot 4)", own_skaters: 5, opp_skaters: 4, own_goalie: true, opp_goalie: true },
  { label: "BP (4 mot 5)", own_skaters: 4, opp_skaters: 5, own_goalie: true, opp_goalie: true },
  { label: "4 mot 4", own_skaters: 4, opp_skaters: 4, own_goalie: true, opp_goalie: true },
  { label: "Tom kasse (vi, 6 mot 5)", own_skaters: 6, opp_skaters: 5, own_goalie: false, opp_goalie: true },
  { label: "Tom kasse (de, 5 mot 6)", own_skaters: 5, opp_skaters: 6, own_goalie: true, opp_goalie: false },
] as const;

export const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2, 4];

export function nextRate(current: number, dir: 1 | -1): number {
  const i = PLAYBACK_RATES.findIndex((r) => r >= current - 1e-9);
  const idx = i === -1 ? PLAYBACK_RATES.length - 1 : i;
  return PLAYBACK_RATES[Math.min(Math.max(idx + dir, 0), PLAYBACK_RATES.length - 1)];
}

/** Keys that cannot be assigned to tag types or lines. */
export const RESERVED_KEYS = new Set([" ", ",", ".", "[", "]", "0"]);

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

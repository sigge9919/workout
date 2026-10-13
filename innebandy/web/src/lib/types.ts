export type Side = "own" | "opp";
export type TeamRole = "owner" | "coach" | "analyst" | "player";

export interface Team {
  id: string;
  name: string;
  short_name: string | null;
}

export interface TeamSettings {
  team_id: string;
  clip_pre_s: number;
  clip_post_s: number;
  period_length_s: number;
  periods: number;
}

export interface Opponent {
  id: string;
  team_id: string;
  name: string;
  short_name: string | null;
}

export interface Player {
  id: string;
  team_id: string;
  opponent_id: string | null;
  name: string;
  jersey_number: number | null;
  position: "F" | "C" | "B" | "MV" | null;
  active: boolean;
}

export interface Season {
  id: string;
  team_id: string;
  name: string;
}

export interface Match {
  id: string;
  team_id: string;
  season_id: string | null;
  opponent_id: string | null;
  played_at: string;
  is_home: boolean;
  competition: string | null;
  venue: string | null;
  notes: string | null;
  opponent?: Opponent | null;
}

export interface Line {
  id: string;
  team_id: string;
  match_id: string;
  side: Side;
  name: string;
  hotkey: string | null;
  sort: number;
  line_members?: { player_id: string; slot: string | null }[];
}

export type VideoStatus = "created" | "uploading" | "uploaded" | "processing" | "ready" | "failed";

export interface Video {
  id: string;
  team_id: string;
  match_id: string;
  title: string | null;
  part_index: number;
  source_type: "fixed" | "auto_cam" | "broadcast" | "unknown";
  status: VideoStatus;
  original_bytes: number | null;
  duration_s: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  error: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  video_id: string | null;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  message: string | null;
  created_at: string;
}

export interface AttributeOption {
  value: string;
  label: string;
}

export interface AttributeField {
  key: string;
  label: string;
  type: "choice" | "text";
  options?: AttributeOption[];
}

export interface AttributeSchema {
  fields: AttributeField[];
  free_label?: boolean;
}

export interface EventType {
  id: string;
  team_id: string;
  key: string;
  name: string;
  category: string | null;
  hotkey: string | null;
  color: string;
  default_side: Side;
  asks_side: boolean;
  asks_position: boolean;
  player_role_label: string | null;
  attribute_schema: AttributeSchema;
  clip_pre_s: number | null;
  clip_post_s: number | null;
  is_auto: boolean;
  is_active: boolean;
  sort: number;
}

export type GameStateKey = "5v5" | "4v4" | "3v3" | "pp" | "bp" | "en_own" | "en_opp" | string;

/** Row of the v_events view. */
export interface TagEvent {
  id: string;
  team_id: string;
  match_id: string;
  video_id: string;
  event_type_id: string;
  origin: "manual" | "auto";
  video_t: number;
  side: Side;
  period: number | null;
  clock_s: number | null;
  own_skaters: number | null;
  opp_skaters: number | null;
  own_goalie: boolean | null;
  opp_goalie: boolean | null;
  x_m: number | null;
  y_m: number | null;
  zone: "def" | "mid" | "off" | null;
  attributes: Record<string, string>;
  label: string | null;
  note: string | null;
  confidence: number | null;
  review_status: string;
  type_key: string;
  type_name: string;
  type_color: string;
  clip_id: string | null;
  clip_start_s: number | null;
  clip_end_s: number | null;
  clip_adjusted: boolean | null;
  game_state: GameStateKey | null;
  created_at: string;
}

export interface EventPlayer {
  event_id: string;
  player_id: string;
  role: "primary" | "secondary" | "involved" | "goalie";
}

export interface OnIce {
  event_id: string;
  player_id: string;
  side: Side;
  is_goalie: boolean;
}

export interface ClockAnchor {
  id: string;
  video_id: string;
  video_t: number;
  period: number;
  clock_s: number;
  kind: "period_start" | "sync" | "period_end";
}

export interface LineChange {
  id: string;
  video_id: string;
  side: Side;
  video_t: number;
  line_id: string | null;
}

export interface GoalieChange {
  id: string;
  video_id: string;
  side: Side;
  video_t: number;
  player_id: string | null;
}

export interface GameStateChange {
  id: string;
  video_id: string;
  video_t: number;
  own_skaters: number;
  opp_skaters: number;
  own_goalie: boolean;
  opp_goalie: boolean;
}

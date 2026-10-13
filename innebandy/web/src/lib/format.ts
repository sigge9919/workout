import type { Match, Opponent } from "./types";

export function matchTitle(teamName: string, m: Pick<Match, "is_home"> & { opponent?: Opponent | null }) {
  const opp = m.opponent?.name ?? "Okänd motståndare";
  return m.is_home ? `${teamName} – ${opp}` : `${opp} – ${teamName}`;
}

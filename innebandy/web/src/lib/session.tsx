"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { must, supabase } from "./supabase";
import type { Team, TeamRole, TeamSettings } from "./types";

interface Membership {
  team: Team;
  role: TeamRole;
}

interface SessionState {
  loading: boolean;
  session: Session | null;
  memberships: Membership[];
  team: Team | null;
  role: TeamRole | null;
  canEdit: boolean;
  settings: TeamSettings | null;
  selectTeam: (id: string) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);
const TEAM_KEY = "innebandy.team";

function readStoredTeam(): string | null {
  try {
    return localStorage.getItem(TEAM_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [settings, setSettings] = useState<TeamSettings | null>(null);

  const loadTeams = useCallback(async (s: Session | null) => {
    if (!s) {
      setMemberships([]);
      return;
    }
    const rows = must(
      await supabase()
        .from("team_members")
        .select("role, team:teams(id, name, short_name)")
        .eq("user_id", s.user.id),
    ) as unknown as { role: TeamRole; team: Team }[];
    const ms = rows.filter((r) => r.team).map((r) => ({ team: r.team, role: r.role }));
    setMemberships(ms);
    const stored = readStoredTeam();
    setTeamId(ms.find((m) => m.team.id === stored)?.team.id ?? ms[0]?.team.id ?? null);
  }, []);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadTeams(data.session).catch(console.error);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") loadTeams(s).catch(console.error);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadTeams]);

  useEffect(() => {
    if (!teamId) {
      setSettings(null);
      return;
    }
    supabase()
      .from("team_settings")
      .select("*")
      .eq("team_id", teamId)
      .maybeSingle()
      .then(({ data }) => setSettings(data as TeamSettings | null));
  }, [teamId]);

  const value = useMemo<SessionState>(() => {
    const m = memberships.find((x) => x.team.id === teamId) ?? null;
    return {
      loading,
      session,
      memberships,
      team: m?.team ?? null,
      role: m?.role ?? null,
      canEdit: m ? m.role !== "player" : false,
      settings,
      selectTeam: (id) => {
        setTeamId(id);
        try {
          localStorage.setItem(TEAM_KEY, id);
        } catch {}
      },
      reload: () => loadTeams(session),
    };
  }, [loading, session, memberships, teamId, settings, loadTeams]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession utanför SessionProvider");
  return v;
}

/** Same as useSession but asserts a selected team (inside AppShell). */
export function useTeam() {
  const s = useSession();
  if (!s.team) throw new Error("Inget lag valt");
  return { ...s, team: s.team };
}

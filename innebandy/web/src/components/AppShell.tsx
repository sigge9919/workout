"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { must, supabase } from "@/lib/supabase";

const NAV = [
  { href: "/matcher", label: "Matcher" },
  { href: "/lag", label: "Lag & spelare" },
  { href: "/installningar", label: "Taggar & inställningar" },
];

/** Auth guard + team onboarding + top navigation for all app pages. */
export function AppShell({ children, fullBleed = false }: { children: React.ReactNode; fullBleed?: boolean }) {
  const s = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!s.loading && !s.session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [s.loading, s.session, router, pathname]);

  if (s.loading || !s.session) {
    return <div className="p-8 text-sm text-slate-500">Laddar…</div>;
  }
  if (!s.team) return <CreateTeam />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 py-2">
          <Link href="/matcher" className="font-semibold tracking-tight">
            Innebandyanalys
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded px-2.5 py-1.5 ${pathname.startsWith(n.href) ? "bg-slate-100 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {s.memberships.length > 1 ? (
              <select className="input w-auto" value={s.team.id} onChange={(e) => s.selectTeam(e.target.value)}>
                {s.memberships.map((m) => (
                  <option key={m.team.id} value={m.team.id}>
                    {m.team.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-medium">{s.team.name}</span>
            )}
            <span className="text-slate-400">{s.session.user.email}</span>
            <button className="btn btn-sm" onClick={() => supabase().auth.signOut()}>
              Logga ut
            </button>
          </div>
        </div>
      </header>
      <main className={fullBleed ? "" : "mx-auto max-w-6xl px-4 py-6"}>{children}</main>
    </div>
  );
}

function CreateTeam() {
  const s = useSession();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = must(await supabase().rpc("create_team", { p_name: name.trim() })) as string;
      await s.reload();
      s.selectTeam(id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-md card">
      <h1 className="text-lg font-semibold">Skapa ditt lag</h1>
      <p className="mt-1 text-sm text-slate-600">
        Laget får standardtaggarna (skott, bollvinst, bolltapp, zoninträde …) som du kan ändra senare.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <label className="label" htmlFor="team-name">Lagets namn</label>
          <input id="team-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          Skapa lag
        </button>
      </form>
    </div>
  );
}

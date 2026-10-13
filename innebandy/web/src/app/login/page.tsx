"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const s = useSession();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const next = params.get("next") || "/matcher";

  useEffect(() => {
    if (s.session) router.replace(next);
  }, [s.session, router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const auth = supabase().auth;
    const { data, error } =
      mode === "in"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setMsg({ kind: "error", text: translate(error.message) });
    } else if (mode === "up" && !data.session) {
      setMsg({ kind: "info", text: "Kontot är skapat. Bekräfta via länken i e-posten och logga sedan in." });
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm card">
      <h1 className="text-lg font-semibold">Innebandyanalys</h1>
      <p className="mt-1 text-sm text-slate-600">{mode === "in" ? "Logga in" : "Skapa konto"}</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <label className="label" htmlFor="email">E-post</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Lösenord</label>
          <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} />
        </div>
        {msg && <p className={`text-sm ${msg.kind === "error" ? "text-red-700" : "text-slate-700"}`}>{msg.text}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {mode === "in" ? "Logga in" : "Skapa konto"}
        </button>
      </form>
      <button className="mt-3 text-sm text-blue-700 hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Inget konto? Skapa ett" : "Har du redan ett konto? Logga in"}
      </button>
    </div>
  );
}

function translate(m: string): string {
  if (/invalid login/i.test(m)) return "Fel e-post eller lösenord.";
  if (/already registered/i.test(m)) return "E-postadressen är redan registrerad.";
  if (/password/i.test(m) && /least/i.test(m)) return "Lösenordet är för kort.";
  return m;
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

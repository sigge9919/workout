"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RESERVED_KEYS } from "@/lib/hotkeys";
import { useTeam } from "@/lib/session";
import { must, supabase } from "@/lib/supabase";
import type { AttributeField, EventType, TeamSettings } from "@/lib/types";

export default function SettingsPage() {
  return (
    <AppShell>
      <Settings />
    </AppShell>
  );
}

function Settings() {
  const { team, canEdit, settings } = useTeam();
  const [types, setTypes] = useState<EventType[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTypes(must(await supabase().from("event_types").select("*").eq("team_id", team.id).order("sort")) as EventType[]);
  }, [team.id]);

  useEffect(() => {
    load().catch((e) => setMsg({ kind: "error", text: e.message }));
  }, [load]);

  async function save(id: string, patch: Partial<EventType>) {
    setMsg(null);
    const r = await supabase().from("event_types").update(patch).eq("id", id);
    if (r.error) {
      setMsg({ kind: "error", text: r.error.code === "23505" ? "Tangenten används redan av en annan tagg." : r.error.message });
    }
    await load();
  }

  async function addType() {
    const base = "egen_" + Date.now().toString(36);
    const r = await supabase().from("event_types").insert({
      team_id: team.id, key: base, name: "Ny tagg", color: "#0f766e", sort: (types.at(-1)?.sort ?? 0) + 10,
      attribute_schema: { fields: [], free_label: true }, asks_position: true,
    }).select("id").single();
    if (r.error) setMsg({ kind: "error", text: r.error.message });
    else setEditing((r.data as { id: string }).id);
    await load();
  }

  async function reapply(typeId: string | null) {
    const r = await supabase().rpc("reapply_clip_presets", { p_team_id: team.id, p_event_type_id: typeId });
    if (r.error) setMsg({ kind: "error", text: r.error.message });
    else setMsg({ kind: "ok", text: `${r.data} klipp uppdaterades (manuellt justerade klipp lämnades orörda).` });
  }

  return (
    <div className="space-y-8">
      {settings && <ClipDefaults settings={settings} canEdit={canEdit} onReapply={() => reapply(null)} />}

      <section>
        <div className="flex items-center">
          <div>
            <h2 className="text-lg font-semibold">Taggtyper och knappsats</h2>
            <p className="text-sm text-slate-600">
              Varje taggtyp har en kortkommando-tangent och kan ha egen klipplängd, t.ex. 10 s före för skott så att uppbyggnaden syns.
            </p>
          </div>
          {canEdit && <button className="btn btn-primary ml-auto" onClick={addType}>Ny taggtyp</button>}
        </div>
        {msg && <p className={`mt-2 text-sm ${msg.kind === "error" ? "text-red-700" : "text-green-700"}`}>{msg.text}</p>}
        <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {types.map((t) => (
            <div key={t.id} className={`p-3 ${t.is_active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-4 w-4 rounded" style={{ background: t.color }} />
                <span className="w-40 font-medium">{t.name}</span>
                <span className="kbd uppercase">{t.hotkey ?? "–"}</span>
                <span className="text-xs text-slate-500">
                  Klipp: {t.clip_pre_s ?? `${settings?.clip_pre_s ?? 5} (std)`} s före / {t.clip_post_s ?? `${settings?.clip_post_s ?? 5} (std)`} s efter
                </span>
                {!t.is_active && <span className="text-xs text-slate-500">Inaktiv</span>}
                {canEdit && (
                  <button className="btn btn-sm ml-auto" onClick={() => setEditing(editing === t.id ? null : t.id)}>
                    {editing === t.id ? "Stäng" : "Redigera"}
                  </button>
                )}
              </div>
              {editing === t.id && <TypeEditor type={t} onSave={(p) => save(t.id, p)} onReapply={() => reapply(t.id)} />}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ClipDefaults({ settings, canEdit, onReapply }: { settings: TeamSettings; canEdit: boolean; onReapply: () => void }) {
  const [pre, setPre] = useState(String(settings.clip_pre_s));
  const [post, setPost] = useState(String(settings.clip_post_s));
  const [periodMin, setPeriodMin] = useState(String(settings.period_length_s / 60));
  const [keepAll, setKeepAll] = useState(settings.keep_originals == null);
  const [keep, setKeep] = useState(String(settings.keep_originals ?? 5));
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await supabase().from("team_settings").update({
      clip_pre_s: Number(pre), clip_post_s: Number(post), period_length_s: Math.round(Number(periodMin) * 60),
      keep_originals: keepAll ? null : Math.max(0, Math.round(Number(keep))), updated_at: new Date().toISOString(),
    }).eq("team_id", settings.team_id);
    setSaved(!r.error);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Klipp och match</h2>
      <form onSubmit={save} className="card mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="pre">Sekunder före taggen</label>
          <input id="pre" className="input w-24" type="number" min={0} max={120} step={0.5} value={pre} onChange={(e) => setPre(e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <label className="label" htmlFor="post">Sekunder efter taggen</label>
          <input id="post" className="input w-24" type="number" min={0} max={120} step={0.5} value={post} onChange={(e) => setPost(e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <label className="label" htmlFor="plen">Periodlängd (min)</label>
          <input id="plen" className="input w-24" type="number" min={1} max={60} value={periodMin} onChange={(e) => setPeriodMin(e.target.value)} disabled={!canEdit} />
        </div>
        <div className="w-full border-t border-slate-100 pt-3">
          <div className="label">Originalfiler</div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={keepAll} disabled={!canEdit} onChange={(e) => setKeepAll(e.target.checked)} />
              Spara alla
            </label>
            {!keepAll && (
              <>
                <span>eller spara för de senaste</span>
                <input aria-label="Antal matcher med originalfil" className="input w-20" type="number" min={0} max={1000} value={keep} onChange={(e) => setKeep(e.target.value)} disabled={!canEdit} />
                <span>matcherna</span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Proxyvideon (1080p) sparas alltid och räcker för taggning, klipp och export. Originalen ger något bättre underlag för den automatiska analysen men dubblar lagringskostnaden. Äldre original raderas automatiskt när en ny video har bearbetats.
          </p>
        </div>
        {canEdit && <button className="btn btn-primary">Spara</button>}
        {canEdit && <button type="button" className="btn" onClick={onReapply}>Uppdatera befintliga klipp</button>}
        {saved && <span className="text-sm text-green-700">Sparat. Nya taggar använder de nya värdena.</span>}
      </form>
    </section>
  );
}

function TypeEditor({ type, onSave, onReapply }: { type: EventType; onSave: (p: Partial<EventType>) => void; onReapply: () => void }) {
  const [name, setName] = useState(type.name);
  const [hotkey, setHotkey] = useState(type.hotkey ?? "");
  const [color, setColor] = useState(type.color);
  const [pre, setPre] = useState(type.clip_pre_s?.toString() ?? "");
  const [post, setPost] = useState(type.clip_post_s?.toString() ?? "");
  const [asksSide, setAsksSide] = useState(type.asks_side);
  const [asksPos, setAsksPos] = useState(type.asks_position);
  const [roleLabel, setRoleLabel] = useState(type.player_role_label ?? "");
  const [fields, setFields] = useState<AttributeField[]>(type.attribute_schema?.fields ?? []);
  const [freeLabel, setFreeLabel] = useState(!!type.attribute_schema?.free_label);
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const k = hotkey.toLowerCase();
    if (k && (RESERVED_KEYS.has(k) || /[0-9]/.test(k))) {
      return setErr("Siffror, mellanslag och , . [ ] är reserverade för spelaren och femmorna.");
    }
    setErr(null);
    onSave({
      name: name.trim() || type.name,
      hotkey: k || null,
      color,
      clip_pre_s: pre === "" ? null : Number(pre),
      clip_post_s: post === "" ? null : Number(post),
      asks_side: asksSide,
      asks_position: asksPos,
      player_role_label: roleLabel || null,
      attribute_schema: { fields: fields.filter((f) => f.label.trim()), free_label: freeLabel },
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="label">Namn</label>
          <input className="input w-48" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Tangent</label>
          <input className="input w-14 uppercase" maxLength={1} value={hotkey} onChange={(e) => setHotkey(e.target.value)} />
        </div>
        <div>
          <label className="label">Färg</label>
          <input type="color" className="h-8 w-14 rounded border border-slate-300" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div>
          <label className="label">Sek före (tomt = std)</label>
          <input className="input w-24" type="number" min={0} max={120} step={0.5} value={pre} onChange={(e) => setPre(e.target.value)} />
        </div>
        <div>
          <label className="label">Sek efter (tomt = std)</label>
          <input className="input w-24" type="number" min={0} max={120} step={0.5} value={post} onChange={(e) => setPost(e.target.value)} />
        </div>
        <div>
          <label className="label">Spelarroll</label>
          <input className="input w-32" placeholder="Spelare" value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={asksSide} onChange={(e) => setAsksSide(e.target.checked)} /> Fråga för/emot</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={asksPos} onChange={(e) => setAsksPos(e.target.checked)} /> Visa planskiss</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={freeLabel} onChange={(e) => setFreeLabel(e.target.checked)} /> Fri etikett</label>
      </div>

      <div>
        <div className="label">Detaljer (val som visas efter taggning)</div>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                className="input w-40"
                placeholder="Rubrik, t.ex. Utfall"
                value={f.label}
                onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <input
                className="input min-w-64 flex-1"
                placeholder="Alternativ, kommaseparerade (tomt = fritext)"
                defaultValue={(f.options ?? []).map((o) => o.label).join(", ")}
                onBlur={(e) => {
                  const labels = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                  setFields(fields.map((x, j) => (j === i
                    ? {
                        ...x,
                        type: labels.length ? "choice" : "text",
                        options: labels.map((l) => ({ label: l, value: x.options?.find((o) => o.label === l)?.value ?? slug(l) })),
                      }
                    : x)));
                }}
              />
              <button type="button" className="btn btn-sm btn-danger" onClick={() => setFields(fields.filter((_, j) => j !== i))}>Ta bort</button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setFields([...fields, { key: `f${Date.now().toString(36)}`, label: "", type: "choice", options: [] }])}
          >
            Lägg till detalj
          </button>
        </div>
      </div>

      {err && <p className="text-red-700">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary">Spara</button>
        <button type="button" className="btn" onClick={onReapply}>Uppdatera befintliga klipp av typen</button>
        <button type="button" className="btn" onClick={() => onSave({ is_active: !type.is_active })}>
          {type.is_active ? "Inaktivera" : "Aktivera"}
        </button>
      </div>
    </form>
  );
}

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "v";
}

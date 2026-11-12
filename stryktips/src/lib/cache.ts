// Cache för källsvar. Nyckeln innehåller omgångsnumret där det är relevant,
// så att varje omgång får egen data och kan visa när den senast hämtades.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface CacheEntry<T> {
  value: T;
  fetchedAt: string;
}

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
}

export class MemoryCache implements CacheStore {
  private map = new Map<string, CacheEntry<unknown>>();
  async get<T>(key: string) {
    return (this.map.get(key) as CacheEntry<T> | undefined) ?? null;
  }
  async set<T>(key: string, entry: CacheEntry<T>) {
    this.map.set(key, entry);
  }
}

export class FileCache implements CacheStore {
  constructor(private dir = path.join(process.cwd(), "data", "cache")) {}

  private file(key: string) {
    return path.join(this.dir, `${key.replace(/[^a-zA-Z0-9_.-]+/g, "_")}.json`);
  }

  async get<T>(key: string) {
    try {
      return JSON.parse(await readFile(this.file(key), "utf8")) as CacheEntry<T>;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, entry: CacheEntry<T>) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(key), JSON.stringify(entry));
  }
}

/** Tabellen source_cache, se supabase/migrations. */
export class SupabaseCache implements CacheStore {
  constructor(private db: SupabaseClient) {}

  async get<T>(key: string) {
    const { data, error } = await this.db
      .from("source_cache")
      .select("payload, fetched_at")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return { value: data.payload as T, fetchedAt: data.fetched_at as string };
  }

  async set<T>(key: string, entry: CacheEntry<T>) {
    const drawNumber = Number(key.match(/^draw(\d+):/)?.[1]) || null;
    const { error } = await this.db.from("source_cache").upsert({
      key,
      draw_number: drawNumber,
      payload: entry.value,
      fetched_at: entry.fetchedAt,
    });
    if (error) throw new Error(`Cache-skrivning misslyckades: ${error.message}`);
  }
}

let defaultStore: CacheStore | null = null;

export function getCache(): CacheStore {
  if (defaultStore) return defaultStore;
  const backend = process.env.CACHE_BACKEND ?? "file";
  if (backend === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("CACHE_BACKEND=supabase kräver SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY");
    defaultStore = new SupabaseCache(createClient(url, key, { auth: { persistSession: false } }));
  } else if (backend === "memory") {
    defaultStore = new MemoryCache();
  } else {
    defaultStore = new FileCache();
  }
  return defaultStore;
}

export interface Cached<T> {
  value: T;
  fetchedAt: string;
  fromCache: boolean;
}

export interface CachedOptions {
  /** Hur länge ett svar är färskt, i minuter. */
  ttlMinutes: number;
  /** Hämta nytt även om cachen är färsk. */
  force?: boolean;
  store?: CacheStore;
  now?: () => Date;
}

/**
 * Returnerar cachat värde om det är färskt, annars hämtas nytt. Om hämtningen
 * misslyckas används ett gammalt cachat värde hellre än inget alls.
 */
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  { ttlMinutes, force = false, store = getCache(), now = () => new Date() }: CachedOptions,
): Promise<Cached<T>> {
  const hit = await store.get<T>(key).catch(() => null);
  const age = hit ? now().getTime() - new Date(hit.fetchedAt).getTime() : Infinity;
  if (hit && !force && age < ttlMinutes * 60_000) {
    return { value: hit.value, fetchedAt: hit.fetchedAt, fromCache: true };
  }
  try {
    const value = await load();
    const fetchedAt = now().toISOString();
    await store.set(key, { value, fetchedAt }).catch((e) => {
      console.warn(`[cache] ${key}: ${(e as Error).message}`);
    });
    return { value, fetchedAt, fromCache: false };
  } catch (e) {
    if (hit) {
      console.warn(`[cache] ${key}: använder gammal data (${(e as Error).message})`);
      return { value: hit.value, fetchedAt: hit.fetchedAt, fromCache: true };
    }
    throw e;
  }
}

// Tunn fetch-wrapper med timeout och begripliga felmeddelanden.

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "stryktipsanalys/0.1" },
    });
  } catch (e) {
    throw new HttpError(`Kunde inte nå ${redact(url)}: ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new HttpError(`${redact(url)} svarade ${res.status}`, res.status);
  }
  return res.text();
}

export async function fetchJson<T = unknown>(url: string, timeoutMs?: number): Promise<T> {
  const text = await fetchText(url, timeoutMs);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(`${redact(url)} svarade inte med JSON`);
  }
}

/** Tar bort API-nycklar ur URL:er innan de hamnar i loggar och felmeddelanden. */
export function redact(url: string): string {
  return url.replace(/((?:api_?key|accesskey)=)[^&]+/gi, "$1***");
}

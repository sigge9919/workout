import garminConnectPkg from 'garmin-connect';
const { GarminConnect } = garminConnectPkg;
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const credentialsPath = join(dataDir, 'garmin-credentials.json');
const tokenDir = join(dataDir, 'garmin-tokens');
const analysisPath = join(dataDir, 'running-analysis.json');
const rateLimitPath = join(dataDir, 'garmin-ratelimit.json');

mkdirSync(dataDir, { recursive: true });

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

// Garmin's SSO throttles/blocks automated logins (429s), especially from
// datacenter IPs, and repeated retries while blocked only extend the block.
// This tracks that state across attempts (and process restarts) so we stop
// hammering Garmin once we've been rate-limited, and back off harder each
// time it happens again.
const MIN_BACKOFF_MIN = 15;
const MAX_BACKOFF_MIN = 360;

// Only matches the raw "ERROR: (429), ..." format the garmin-connect library
// throws, never our own translated messages below - so an already-friendly
// error can't get re-caught downstream and re-wrapped/re-counted.
function isRateLimitError(err) {
  return /\(429\)/.test(err?.message || '');
}

function assertNotRateLimited() {
  const state = readJson(rateLimitPath, null);
  if (!state?.blockedUntil) return;
  const remainingMs = new Date(state.blockedUntil).getTime() - Date.now();
  if (remainingMs <= 0) return;
  const minutes = Math.ceil(remainingMs / 60000);
  throw new Error(
    `Garmin is rate-limiting logins from this server (too many attempts). Wait about ${minutes} more minute${minutes === 1 ? '' : 's'} before trying again - retrying sooner will extend the block.`
  );
}

function recordRateLimitHit() {
  const state = readJson(rateLimitPath, { strikes: 0 });
  const strikes = (state.strikes || 0) + 1;
  const backoffMin = Math.min(MIN_BACKOFF_MIN * 2 ** (strikes - 1), MAX_BACKOFF_MIN);
  const blockedUntil = new Date(Date.now() + backoffMin * 60000).toISOString();
  writeFileSync(rateLimitPath, JSON.stringify({ strikes, blockedUntil }, null, 2));
  return backoffMin;
}

function clearRateLimit() {
  if (existsSync(rateLimitPath)) rmSync(rateLimitPath);
}

/** Logs in, translating Garmin's raw errors into clearer, actionable ones. */
async function loginWithRateLimitHandling(client) {
  assertNotRateLimited();
  try {
    await client.login();
  } catch (err) {
    if (isRateLimitError(err)) {
      const backoffMin = recordRateLimitHit();
      throw new Error(
        `Garmin rejected the login with "Too Many Requests" - it's rate-limiting this server's IP. This is common on cloud/datacenter hosts. Wait at least ${backoffMin} minutes before trying again (repeated retries make it worse); if it keeps happening, try connecting from a residential network instead.`
      );
    }
    throw err;
  }
  clearRateLimit();
}

function loadCredentials() {
  return readJson(credentialsPath, null);
}

function saveCredentials(creds) {
  writeFileSync(credentialsPath, JSON.stringify(creds, null, 2));
}

export function hasCredentials() {
  return existsSync(credentialsPath);
}

export function getStatus() {
  const creds = loadCredentials();
  const analysis = readJson(analysisPath, null);
  return {
    connected: !!creds,
    displayName: creds?.displayName || null,
    lastSyncedAt: analysis?.syncedAt || null,
  };
}

export function disconnect() {
  if (existsSync(credentialsPath)) rmSync(credentialsPath);
  if (existsSync(tokenDir)) rmSync(tokenDir, { recursive: true, force: true });
  if (existsSync(analysisPath)) rmSync(analysisPath);
  clearRateLimit();
}

async function buildClient(username, password) {
  const client = new GarminConnect({ username, password });
  if (existsSync(tokenDir)) {
    try {
      client.loadTokenByFile(tokenDir);
      await client.getUserProfile();
      return client;
    } catch (err) {
      // A rate-limit hit here means Garmin is blocking this IP outright -
      // a fresh login would just get rate-limited too, so surface it as-is
      // instead of masking it with a confusing second failure.
      if (isRateLimitError(err)) throw err;
      // otherwise the stored session is stale/expired - fall through to a fresh login
    }
  }
  await loginWithRateLimitHandling(client);
  mkdirSync(tokenDir, { recursive: true });
  client.exportTokenToFile(tokenDir);
  return client;
}

/**
 * Verifies credentials against Garmin, persists them + a reusable session, and
 * returns the account display name. Throws with a Garmin-provided message on
 * bad credentials/MFA/locked accounts.
 */
export async function connect({ username, password }) {
  if (!username || !password) throw new Error('Garmin email and password are required.');
  const client = new GarminConnect({ username, password });
  await loginWithRateLimitHandling(client);
  mkdirSync(tokenDir, { recursive: true });
  client.exportTokenToFile(tokenDir);

  let displayName = username;
  try {
    const profile = await client.getUserProfile();
    displayName = profile?.displayName || profile?.userName || username;
  } catch {
    // profile lookup is best-effort only
  }

  saveCredentials({ username, password, displayName });
  return { displayName };
}

function isRunningActivity(activity) {
  const key = activity?.activityType?.typeKey || '';
  return key.includes('running');
}

/**
 * Fetches the most recent running activities (any sub-type: road, trail,
 * treadmill) with their running-dynamics summary metrics.
 */
export async function fetchRecentRunningActivities(limit = 20) {
  const creds = loadCredentials();
  if (!creds) throw new Error('Garmin is not connected yet.');
  assertNotRateLimited();
  try {
    const client = await buildClient(creds.username, creds.password);

    const runs = [];
    const pageSize = 25;
    let start = 0;
    // Garmin's feed is mixed-sport, so page through it until we have enough runs.
    while (runs.length < limit && start < 200) {
      const page = await client.getActivities(start, pageSize);
      if (!page || page.length === 0) break;
      runs.push(...page.filter(isRunningActivity));
      start += pageSize;
    }
    return runs.slice(0, limit);
  } catch (err) {
    if (isRateLimitError(err)) {
      const backoffMin = recordRateLimitHit();
      throw new Error(
        `Garmin rejected this request with "Too Many Requests" - it's rate-limiting this server's IP. Wait at least ${backoffMin} minutes before syncing again.`
      );
    }
    throw err;
  }
}

export function getCachedAnalysis() {
  return readJson(analysisPath, null);
}

export function saveAnalysis(analysis) {
  const withMeta = { ...analysis, syncedAt: new Date().toISOString() };
  writeFileSync(analysisPath, JSON.stringify(withMeta, null, 2));
  return withMeta;
}

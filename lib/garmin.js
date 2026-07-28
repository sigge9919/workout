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

mkdirSync(dataDir, { recursive: true });

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
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
}

async function buildClient(username, password) {
  const client = new GarminConnect({ username, password });
  if (existsSync(tokenDir)) {
    try {
      client.loadTokenByFile(tokenDir);
      await client.getUserProfile();
      return client;
    } catch {
      // stored session is stale/expired - fall through to a fresh login
    }
  }
  await client.login();
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
  await client.login();
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
}

export function getCachedAnalysis() {
  return readJson(analysisPath, null);
}

export function saveAnalysis(analysis) {
  const withMeta = { ...analysis, syncedAt: new Date().toISOString() };
  writeFileSync(analysisPath, JSON.stringify(withMeta, null, 2));
  return withMeta;
}

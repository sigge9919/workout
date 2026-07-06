import 'dotenv/config';
import express from 'express';
import webpush from 'web-push';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
const dbPath = join(dataDir, 'subscriptions.json');
mkdirSync(dataDir, { recursive: true });
if (!existsSync(dbPath)) writeFileSync(dbPath, '[]');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT = process.env.VAPID_CONTACT || 'mailto:admin@example.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn(
    '\n[daily-coach] No VAPID keys configured - push reminders are disabled.\n' +
    'Run `npm run generate-vapid` and put the keys in a .env file (see .env.example).\n'
  );
} else {
  webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function loadSubs() {
  try { return JSON.parse(readFileSync(dbPath, 'utf8')); } catch { return []; }
}
function saveSubs(subs) {
  writeFileSync(dbPath, JSON.stringify(subs, null, 2));
}

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/api/vapid-public-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push not configured on this server.' });
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/subscribe', (req, res) => {
  const { subscription, reminderTime, timezone } = req.body || {};
  if (!subscription?.endpoint || !reminderTime || !timezone) {
    return res.status(400).json({ error: 'subscription, reminderTime and timezone are required.' });
  }
  const subs = loadSubs();
  const existing = subs.find((s) => s.subscription.endpoint === subscription.endpoint);
  if (existing) {
    existing.reminderTime = reminderTime;
    existing.timezone = timezone;
  } else {
    subs.push({ subscription, reminderTime, timezone, lastSentDate: null });
  }
  saveSubs(subs);
  res.json({ ok: true });
});

app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint required.' });
  const subs = loadSubs().filter((s) => s.subscription.endpoint !== endpoint);
  saveSubs(subs);
  res.json({ ok: true });
});

function currentHmInTz(timezone) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  } catch {
    return null;
  }
}

function currentDateInTz(timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()); // YYYY-MM-DD
  } catch {
    return null;
  }
}

async function checkAndSendReminders() {
  if (!VAPID_PUBLIC_KEY) return;
  const subs = loadSubs();
  if (subs.length === 0) return;
  let changed = false;

  for (const entry of subs) {
    const hm = currentHmInTz(entry.timezone);
    const today = currentDateInTz(entry.timezone);
    if (!hm || !today) continue;
    if (hm !== entry.reminderTime) continue;
    if (entry.lastSentDate === today) continue;

    try {
      await webpush.sendNotification(entry.subscription, JSON.stringify({
        title: 'Daily Coach',
        body: 'Time for your 15-minute strength & flexibility session.',
      }));
      entry.lastSentDate = today;
      changed = true;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        entry.expired = true; // subscription gone; will be pruned below
      } else {
        console.error('Push send failed for', entry.subscription.endpoint, err.statusCode || err.message);
      }
    }
  }

  const pruned = subs.filter((s) => !s.expired);
  if (pruned.length !== subs.length || changed) saveSubs(pruned);
}

setInterval(checkAndSendReminders, 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Daily Coach running at http://localhost:${PORT}`);
});

# Daily Coach

A 15-minute daily strength & flexibility coach you install straight to your iPhone home screen. It's built to be the *third pillar* alongside running and the gym: mobility, injury-prevention, core stability and flexibility - never more heavy strength volume, so it never adds fatigue on top of your training.

## What it does

- **A different 15-minutes-or-less session every day** on a 7-day rotation: hip/ankle mobility (running prehab), upper body & core stability, full-body flexibility flow, balance & single-leg stability, shoulder/thoracic mobility, core & anti-rotation strength, and a deep-stretch recovery day.
- **A "legs already fatigued?" toggle** - flip it on days you ran or did leg day at the gym, and every leg-strength move in that day's plan is automatically swapped for a low-fatigue stretch equivalent.
- **A voice coach** (on-device speech synthesis) that announces each move and its cue out loud, plus countdown beeps, so you don't need to keep looking at the screen.
- **A real daily push notification** at a time you choose - works even when the app is closed, once installed to your Home Screen (iOS 16.4+).
- **Streaks and history**, stored locally on your phone.
- Works **fully offline** once installed (service worker caches the app shell).
- **Running technique analysis** - connect your Garmin account, sync your recent runs, and get a technique score, benchmarked running-dynamics metrics, trends, and targeted drills for the issues it finds (see [Running technique analysis](#running-technique-analysis) below).

## Run it locally

```bash
npm install
npm run generate-vapid        # prints a VAPID public/private key pair
cp .env.example .env          # paste the keys into .env
npm start                     # serves the app at http://localhost:3000
```

## Install it on your iPhone

1. Deploy the app somewhere reachable over HTTPS (see below) - iOS requires HTTPS (or `localhost`) for both "Add to Home Screen" install and push notifications.
2. Open the deployed URL in **Safari** on your iPhone.
3. Tap the **Share** button, then **Add to Home Screen**.
4. Open the app from the Home Screen icon you just created (not from Safari) - this is required for iOS to treat it as an installed app and allow notifications.
5. On the home tab, tap **Enable reminders**, choose your time, and allow notifications when prompted.

## Deploying so you can install it

This is a single small Node/Express app (serves the frontend *and* the push API), so any Node host works: [Render](https://render.com), [Railway](https://railway.app), [Fly.io](https://fly.io), or your own server/VPS.

1. Push this repo to your host of choice.
2. Set environment variables on the host: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT` (an email, e.g. `mailto:you@example.com`), and optionally `PORT`.
3. Start command: `npm start`.
4. Visit the resulting HTTPS URL from your iPhone and install it as above.

Subscriptions are stored in `data/subscriptions.json` on the server. A background loop checks every minute and sends a push at each subscriber's chosen time in their own timezone.

## How the fatigue-avoidance logic works

Every exercise in `public/js/exercises.js` is tagged with a body `region` (legs, upper, core, shoulders, spine, full, ankles). Leg-region strength/mobility moves carry a `sub` field pointing at a seated or lying low-fatigue substitute. When you flip "legs already fatigued" before starting, `buildSession()` in `public/js/program.js` swaps every such move for its substitute for that session only - the weekly rotation itself is unaffected.

## Running technique analysis

The **Running** tab connects to your Garmin Connect account and turns your recent runs into a technique report.

### How it works

1. Open the **Running** tab and enter your Garmin email/password, then tap **Connect Garmin**.
2. Tap **Sync latest runs**. The server logs into Garmin Connect, pulls your ~20 most recent running activities (road, trail, or treadmill), and reads each run's running-dynamics summary: cadence, vertical oscillation, ground contact time, vertical ratio, and left/right ground-contact balance.
3. Each metric is compared against published running-dynamics benchmark bands (excellent/good/average/below average/poor) to produce a 0-100 **technique score**, a list of **trends** (recent runs vs. earlier ones), and a list of detected **issues** (e.g. low cadence, excess vertical bounce, overstriding).
4. Each issue maps to a small set of concrete **drills** (with cues, dosage, and why it helps) pulled from `lib/drills.js`.

Re-run **Sync latest runs** any time you want a fresh report from your latest runs; the last report is cached on the server so it loads instantly without hitting Garmin again.

### Setup notes

- This uses the **unofficial** [`garmin-connect`](https://www.npmjs.com/package/garmin-connect) package (there is no public Garmin Connect API for individual accounts). It can break if Garmin changes their login flow, and it does **not** support accounts with MFA enabled.
- Your Garmin email/password are sent only to this app's own server (never a third party) and stored in `data/garmin-credentials.json` so it can re-sync later; the Garmin session token is cached in `data/garmin-tokens/`. Both are `.gitignore`d - never commit them. Treat them like the `.env` secrets: fine for a personal single-user deployment, but don't deploy this publicly without adding real auth in front of it.
- Running-dynamics metrics (vertical oscillation, ground contact time, vertical ratio, ground-contact balance) require a compatible chest strap or running watch (e.g. HRM-Pro/Run/Tri, or a wrist watch with built-in running dynamics). Runs without that data still get scored on cadence alone.
- Use **Disconnect** in the Running tab to delete the stored credentials, session, and cached report from the server.

## Project structure

```
server.js              Express app: static hosting + push subscription API + reminder scheduler + Garmin API routes
lib/
  garmin.js              Garmin Connect login/session persistence + fetching recent runs
  runningAnalysis.js      Normalizes runs, benchmarks running-dynamics metrics, detects issues/trends
  drills.js               Drill library, mapped from detected issues
public/
  index.html            Single-page app shell
  css/style.css          Styling (dark by default, adapts to light mode)
  js/
    exercises.js          Exercise database + the 7-day program
    program.js             Builds today's session, applies fatigue substitutions
    timer.js               Session runner: countdown, voice cues, pause/skip
    storage.js             localStorage: history, streak, settings
    notifications.js       Push subscription flow (client side)
    running.js             Running tab: connect/sync Garmin, render the technique report
    app.js                 UI wiring, tab navigation
  sw.js                  Service worker: offline caching + push/notificationclick handling
  manifest.webmanifest   PWA manifest
  icons/                 App icons (generated by scripts/generate-icons.js)
scripts/generate-icons.js  Regenerates the icon set (no external deps)
```

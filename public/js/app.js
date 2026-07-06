import { buildSession, formatMinutes, getTodayProgram } from './program.js';
import { WEEK_PROGRAM } from './exercises.js';
import * as storage from './storage.js';
import * as notif from './notifications.js';
import { SessionRunner } from './timer.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const el = (id) => document.getElementById(id);
const views = {
  home: el('homeView'),
  session: el('sessionView'),
  done: el('doneView'),
};

let currentSession = null;
let runner = null;

function showView(name) {
  for (const [key, node] of Object.entries(views)) node.hidden = key !== name;
}

function renderHome() {
  const settings = storage.getSettings();
  const now = new Date();
  currentSession = buildSession({ date: now, legsFatigued: settings.legsFatigued });

  el('dateLabel').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  el('themeTitle').textContent = currentSession.theme;
  el('themeSubtitle').textContent = currentSession.subtitle;
  el('durationLabel').textContent = formatMinutes(currentSession.totalSeconds);
  el('stepCountLabel').textContent = `${currentSession.steps.length} moves`;

  const streak = storage.computeStreak(now);
  el('streakValue').textContent = streak;
  el('totalValue').textContent = storage.totalSessionsCompleted();
  const badge = el('streakBadge');
  if (streak > 0) {
    badge.hidden = false;
    badge.textContent = `🔥 ${streak}`;
  } else {
    badge.hidden = true;
  }

  const todayEntry = storage.getTodayEntry(now);
  el('startBtn').textContent = todayEntry?.completed ? "Do it again" : "Start today's session";

  el('legsFatiguedToggle').checked = settings.legsFatigued;
  el('coachVoiceToggle').checked = settings.coachVoice;
  el('reminderTimeInput').value = settings.reminderTime;

  renderWeekList(now);
}

function renderWeekList(now) {
  const list = el('weekList');
  list.innerHTML = '';
  const todayIdx = now.getDay();
  WEEK_PROGRAM.forEach((day, idx) => {
    const li = document.createElement('li');
    if (idx === todayIdx) li.classList.add('is-today');
    li.innerHTML = `<span class="day-name">${DAY_NAMES[idx]}</span><span>${day.theme}</span>`;
    list.appendChild(li);
  });
}

function startSession() {
  const settings = storage.getSettings();
  showView('session');
  el('progressFill').style.width = '0%';

  runner = new SessionRunner(currentSession, {
    coachVoice: settings.coachVoice,
    onPhaseChange: ({ phase, index, totalPhases }) => {
      el('phaseCounter').textContent = `${index + 1} / ${totalPhases}`;
      el('timeRemaining').textContent = phase.duration;
      if (phase.type === 'work') {
        el('phaseKind').textContent = phase.step.exercise.category === 'flexibility' ? 'STRETCH' : 'MOVE';
        el('exerciseName').textContent = phase.step.exercise.name;
        el('sideLabel').textContent = phase.step.sideLabel || '';
        el('cueText').textContent = phase.step.exercise.cue;
      } else {
        el('phaseKind').textContent = 'REST';
        el('exerciseName').textContent = 'Rest & reset';
        el('sideLabel').textContent = '';
        const next = currentSession.steps[Math.min(currentSession.steps.length - 1, Math.ceil((index + 1) / 2))];
        el('cueText').textContent = next ? `Up next: ${next.exercise.name}` : '';
      }
    },
    onTick: ({ remaining, index, totalPhases }) => {
      el('timeRemaining').textContent = remaining;
      el('progressFill').style.width = `${Math.round(((index) / totalPhases) * 100)}%`;
    },
    onComplete: ({ completedSeconds, totalSeconds }) => {
      storage.recordSession({
        theme: currentSession.theme,
        completedSeconds,
        totalSeconds,
        completed: true, // reached the end of the flow naturally (skips allowed)
      });
      el('doneTitle').textContent = 'Nice work';
      el('doneSummary').textContent = `You completed ${currentSession.theme} - ${Math.round(completedSeconds / 60)} min of movement.`;
      showView('done');
    },
  });
  runner.start();
}

function exitSession(recordPartial = true) {
  if (!runner) { showView('home'); return; }
  const completedSeconds = runner.completedSeconds;
  const totalSeconds = runner.totalSeconds;
  runner.stop();
  if (recordPartial && completedSeconds > 0) {
    storage.recordSession({
      theme: currentSession.theme,
      completedSeconds,
      totalSeconds,
      completed: completedSeconds >= currentSession.totalWorkSeconds * 0.85,
    });
  }
  runner = null;
  renderHome();
  showView('home');
}

function wireEvents() {
  el('startBtn').addEventListener('click', startSession);
  el('exitSessionBtn').addEventListener('click', () => exitSession(true));
  el('doneHomeBtn').addEventListener('click', () => { renderHome(); showView('home'); });

  el('pauseBtn').addEventListener('click', () => {
    if (!runner) return;
    if (runner.running) {
      runner.pause();
      el('pauseBtn').textContent = 'Resume';
    } else {
      runner.resume();
      el('pauseBtn').textContent = 'Pause';
    }
  });

  el('skipBtn').addEventListener('click', () => runner?.skip());

  el('legsFatiguedToggle').addEventListener('change', (e) => {
    storage.saveSettings({ legsFatigued: e.target.checked });
    renderHome();
  });

  el('coachVoiceToggle').addEventListener('change', (e) => {
    storage.saveSettings({ coachVoice: e.target.checked });
  });

  el('reminderTimeInput').addEventListener('change', async (e) => {
    storage.saveSettings({ reminderTime: e.target.value });
    const state = await notif.getPermissionState();
    if (state === 'granted') {
      await notif.updateReminderTime(e.target.value);
      el('notifStatus').textContent = `Reminder time updated to ${e.target.value}.`;
    }
  });

  el('enableNotifBtn').addEventListener('click', async () => {
    const time = el('reminderTimeInput').value || '07:30';
    el('notifStatus').textContent = 'Requesting permission...';
    try {
      await notif.requestAndSubscribe(time);
      storage.saveSettings({ reminderTime: time });
      el('notifStatus').textContent = `Daily reminder set for ${time}. ✓`;
      el('enableNotifBtn').textContent = 'Reminders enabled';
      el('enableNotifBtn').disabled = true;
    } catch (err) {
      el('notifStatus').textContent = err.message;
    }
  });
}

async function initNotifStatus() {
  const state = await notif.getPermissionState();
  if (state === 'granted') {
    el('enableNotifBtn').textContent = 'Reminders enabled';
    el('enableNotifBtn').disabled = true;
    el('notifStatus').textContent = 'Daily reminders are on.';
  } else if (state === 'denied') {
    el('notifStatus').textContent = 'Notifications are blocked in Settings. Enable them for this app to get reminders.';
  } else if (state === 'unsupported') {
    el('notifStatus').textContent = 'Add this app to your Home Screen, then open it from there to enable reminders (iOS requirement).';
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('Service worker registration failed', err);
  }
}

function init() {
  wireEvents();
  renderHome();
  showView('home');
  registerServiceWorker();
  initNotifStatus();
}

init();

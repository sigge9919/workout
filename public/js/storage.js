const KEYS = {
  history: 'dc_history',       // array of { date: 'YYYY-MM-DD', theme, completedSeconds, totalSeconds, completed }
  settings: 'dc_settings',     // { reminderTime, legsFatigued, coachVoice }
};

const DEFAULT_SETTINGS = {
  reminderTime: '07:30',
  legsFatigued: false,
  coachVoice: true,
};

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEYS.settings) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  localStorage.setItem(KEYS.settings, JSON.stringify(next));
  return next;
}

export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.history) || '[]');
  } catch {
    return [];
  }
}

export function getTodayEntry(date = new Date()) {
  return getHistory().find((h) => h.date === todayKey(date));
}

export function recordSession({ date = new Date(), theme, completedSeconds, totalSeconds, completed }) {
  const history = getHistory();
  const key = todayKey(date);
  const existing = history.find((h) => h.date === key);
  const entry = { date: key, theme, completedSeconds, totalSeconds, completed };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    history.push(entry);
  }
  history.sort((a, b) => (a.date < b.date ? 1 : -1));
  localStorage.setItem(KEYS.history, JSON.stringify(history.slice(0, 400)));
  return entry;
}

export function computeStreak(date = new Date()) {
  const history = getHistory();
  const doneDates = new Set(history.filter((h) => h.completed).map((h) => h.date));
  let streak = 0;
  const cursor = new Date(date);
  while (doneDates.has(todayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function totalSessionsCompleted() {
  return getHistory().filter((h) => h.completed).length;
}

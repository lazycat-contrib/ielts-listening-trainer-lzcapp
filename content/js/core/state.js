/**
 * Global State Manager
 * Lightweight pub/sub state with localStorage persistence for settings.
 */

import { saveBackup, loadBackup, loadSettings, saveSetting } from './storage.js';

const _state = {
  questions: [],
  progress: {},
  settings: {
    dailyGoal: 3,
    theme: 'light'
  },
  currentRoute: 'dashboard',
  filters: {
    part: 'all',
    frequency: 'all',
    questionType: 'all',
    status: 'all',
    search: ''
  }
};

const _listeners = new Map();

export function getState() {
  return _state;
}

export function updateState(key, value) {
  const keys = key.split('.');
  let obj = _state;
  for (let i = 0; i < keys.length - 1; i++) {
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;

  // Auto-persist settings to localStorage
  if (key === 'settings' || key.startsWith('settings.')) {
    saveSetting('dailyGoal', _state.settings.dailyGoal);
    saveSetting('theme', _state.settings.theme);
  }

  // Auto-backup progress to localStorage
  if (key === 'progress') {
    saveBackup(value);
  }

  _notify(key, value);
}

export function onStateChange(key, fn) {
  if (!_listeners.has(key)) _listeners.set(key, []);
  _listeners.get(key).push(fn);
}

function _notify(key, value) {
  const fns = _listeners.get(key) || [];
  fns.forEach(fn => fn(value));
}

/**
 * Load full state from IndexedDB at startup.
 * Also restores settings from localStorage.
 */
export async function loadState(dbGetAll) {
  const [questions, progressArr, settingsArr] = await Promise.all([
    dbGetAll('questions'),
    dbGetAll('progress'),
    dbGetAll('settings')
  ]);

  _state.questions = questions;

  const progressMap = {};
  progressArr.forEach(p => { progressMap[p.questionId] = p; });
  _state.progress = progressMap;

  // Merge DB settings with localStorage settings (localStorage wins for UI prefs)
  const lsSettings = loadSettings();
  settingsArr.forEach(s => {
    _state.settings[s.key] = s.value;
  });
  if (lsSettings.dailyGoal) _state.settings.dailyGoal = lsSettings.dailyGoal;
  if (lsSettings.theme) _state.settings.theme = lsSettings.theme;

  // Initial backup
  saveBackup(progressMap);

  return _state;
}

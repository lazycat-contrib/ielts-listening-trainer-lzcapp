/**
 * Analysis Service
 * Computes statistics and recommendations from progress data.
 * Phase 2 — handles edge cases, improved calendar, streak detection.
 */

import { getState } from '../core/state.js';

/**
 * Dashboard summary stats.
 */
export function computeDashboardStats(questions, progressMap) {
  const progressArr = Object.values(progressMap);
  const completed = progressArr.filter(p => p.completed);
  const total = questions.length;

  // Average accuracy
  const avgAccuracy = completed.length > 0
    ? Math.round(completed.reduce((sum, p) => sum + (p.accuracy || 0), 0) / completed.length * 100)
    : 0;

  // Today's count
  const today = new Date().toISOString().split('T')[0];
  const todayCount = progressArr.filter(p => {
    const lp = p.lastPractice;
    return lp && lp.startsWith(today);
  }).length;

  // Streak
  const streak = computeStreak(progressArr);

  // Total study time
  const totalSeconds = progressArr.reduce((sum, p) => sum + (p.elapsedSeconds || 0), 0);
  const totalHours = Math.round(totalSeconds / 3600 * 10) / 10;

  return { total, completedCount: completed.length, avgAccuracy, todayCount, streak, totalHours };
}

function computeStreak(progressArr) {
  const dates = new Set(
    progressArr
      .filter(p => p.lastPractice)
      .map(p => p.lastPractice.split('T')[0])
  );
  const sorted = [...dates].sort().reverse();
  if (sorted.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check from today backwards
  // If today hasn't been practiced yet, still count from yesterday
  for (let i = 0; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    if (dates.has(ds)) {
      streak++;
    } else if (i === 0) {
      // Today not yet practiced — continue checking from yesterday
      continue;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Weekly stats — last 7 days.
 */
export function computeWeeklyStats(progressMap) {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = dayNames[d.getDay()];

    const dayAttempts = [];
    Object.values(progressMap).forEach(p => {
      // Check history entries
      (p.history || []).forEach(h => {
        if (h.date && h.date.startsWith(ds)) {
          dayAttempts.push(h);
        }
      });
      // Also check if lastPractice falls on this day but no history entry (edge case)
      if (p.lastPractice && p.lastPractice.startsWith(ds) && dayAttempts.length === 0 && p.attemptCount > 0) {
        dayAttempts.push({
          date: p.lastPractice,
          score: 0,
          total: 0,
          accuracy: p.accuracy || 0,
          duration: 0
        });
      }
    });

    const count = dayAttempts.length;
    const accuracy = count > 0
      ? Math.round(dayAttempts.reduce((sum, h) => sum + (h.accuracy || 0), 0) / count * 100)
      : 0;

    days.push({ date: ds, day: dayName, count, accuracy, isToday: i === 0 });
  }

  return days;
}

/**
 * Part-based ability analysis.
 */
export function computePartStats(questions, progressMap) {
  const parts = { 'Part 1': [], 'Part 2': [], 'Part 3': [], 'Part 4': [] };

  questions.forEach(q => {
    const p = progressMap[q.id];
    if (p && p.completed && p.attemptCount > 0 && parts[q.part]) {
      parts[q.part].push(p.accuracy || 0);
    }
  });

  return Object.entries(parts).map(([part, accuracies]) => {
    const count = accuracies.length;
    const avg = count > 0
      ? Math.round(accuracies.reduce((a, b) => a + b, 0) / count * 100)
      : 0;
    return { part, count, accuracy: avg };
  });
}

/**
 * Question-type ability analysis.
 */
export function computeTypeStats(questions, progressMap) {
  const typeMap = {};

  questions.forEach(q => {
    const p = progressMap[q.id];
    if (!p || !p.completed || p.attemptCount === 0) return;

    const types = q.questionTypes || [];
    types.forEach(t => {
      if (!typeMap[t]) typeMap[t] = [];
      typeMap[t].push(p.accuracy || 0);
    });
  });

  const typeOrder = ['fill', 'single', 'multiple', 'matching', 'map'];

  return Object.entries(typeMap)
    .sort((a, b) => typeOrder.indexOf(a[0]) - typeOrder.indexOf(b[0]))
    .map(([type, accuracies]) => {
      const count = accuracies.length;
      const avg = count > 0
        ? Math.round(accuracies.reduce((a, b) => a + b, 0) / count * 100)
        : 0;
      return { type, count, accuracy: avg };
    });
}

/**
 * 90-day study calendar.
 */
export function computeCalendar(progressMap) {
  const calendar = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Initialize 90 days
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    calendar[ds] = 0;
  }

  // Count practice events per day
  Object.values(progressMap).forEach(p => {
    // Count from history entries
    (p.history || []).forEach(h => {
      if (h.date) {
        const ds = h.date.split('T')[0];
        if (calendar[ds] !== undefined) {
          calendar[ds]++;
        }
      }
    });
  });

  return Object.entries(calendar).map(([date, count]) => ({ date, count }));
}

/**
 * Smart recommendations for dashboard.
 */
export function getRecommendations(questions, progressMap, limit = 4) {
  const merged = questions.map(q => ({ ...q, progress: progressMap[q.id] }));

  // 1. High-frequency, not completed (or not started)
  const highFreqNew = merged
    .filter(q => q.frequency === '高频' && !q.progress?.completed)
    .sort((a, b) => {
      // Prefer completely new over partially practiced
      const aNew = !a.progress?.lastPractice;
      const bNew = !b.progress?.lastPractice;
      if (aNew !== bNew) return aNew ? -1 : 1;
      return 0;
    })
    .slice(0, limit);

  // 2. Items with mistakes that need review
  const recentMistakes = merged
    .filter(q => q.progress?.wrongCount > 0 && q.progress?.learningStatus !== 'mastered')
    .sort((a, b) => (b.progress?.wrongCount || 0) - (a.progress?.wrongCount || 0))
    .slice(0, limit);

  // 3. Favorites
  const favorites = merged
    .filter(q => q.progress?.favorite)
    .slice(0, limit);

  return { highFreqNew, recentMistakes, favorites };
}

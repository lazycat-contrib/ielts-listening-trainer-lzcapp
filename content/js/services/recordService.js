/**
 * Record Service
 * CRUD operations for user learning progress.
 * Phase 2 — refined state machine, integrity checks, data verification.
 */

import { getOne, putOne, getAll, count } from '../core/database.js';
import { updateState, getState } from '../core/state.js';

/* ═══════════════════════════════════════
   LEARNING STATUS STATE MACHINE
   ═══════════════════════════════════════

   new       — never practiced
   learning  — practiced at least once
   review    — has made mistakes, needs review
   mastered  — user confirmed mastery (manual), or 3+ perfect attempts

   Transitions:
   new → learning           (first attempt recorded)
   learning → review        (made errors)
   learning → mastered      (3+ consecutive perfect scores)
   review → learning        (perfect score on re-attempt)
   review → mastered        (manual mark, or 2+ perfect review attempts)
   mastered → review        (new errors on mastered item)
*/

const STATUS = {
  NEW: 'new',
  LEARNING: 'learning',
  REVIEW: 'review',
  MASTERED: 'mastered'
};

/**
 * Create a default progress record.
 */
function createDefaultProgress(questionId) {
  return {
    questionId,
    completed: false,
    attemptCount: 0,
    history: [],
    accuracy: 0,
    lastPractice: null,
    lastOpened: null,
    wrongCount: 0,
    wrongDetails: {},
    favorite: false,
    learningStatus: STATUS.NEW,
    audioPosition: 0,
    elapsedSeconds: 0,
    createdAt: new Date().toISOString()
  };
}

/**
 * Get or create a progress record.
 */
export async function getProgress(questionId) {
  let p = await getOne('progress', questionId);
  if (!p) {
    p = createDefaultProgress(questionId);
    await putOne('progress', p);
  }
  // Ensure all Phase 2 fields exist (migration)
  let updated = false;
  if (!p.lastOpened) { p.lastOpened = null; updated = true; }
  if (!p.learningStatus) { p.learningStatus = STATUS.NEW; updated = true; }
  if (!p.createdAt) { p.createdAt = p.lastPractice || new Date().toISOString(); updated = true; }
  if (!p.wrongDetails) { p.wrongDetails = {}; updated = true; }
  if (!p.elapsedSeconds) { p.elapsedSeconds = 0; updated = true; }
  if (updated) await putOne('progress', p);
  return p;
}

/**
 * Record that user started practicing (opened the HTML).
 */
export async function startPractice(questionId) {
  const p = await getProgress(questionId);
  p.lastOpened = new Date().toISOString();
  await putOne('progress', p);
  _updateMemoryState(questionId, p);
  return p;
}

/**
 * Compute learning status based on history.
 */
function computeStatus(p, currentScore, currentTotal) {
  const currentAccuracy = currentTotal > 0 ? currentScore / currentTotal : 0;
  const currentPerfect = currentScore === currentTotal;

  // Count consecutive perfect attempts (looking backwards from most recent)
  let consecutivePerfect = 0;
  const allHistory = [...(p.history || [])];
  // We're computing BEFORE adding current attempt, so look at existing history
  for (let i = allHistory.length - 1; i >= 0; i--) {
    if (allHistory[i].score === allHistory[i].total) {
      consecutivePerfect++;
    } else {
      break;
    }
  }

  // If this attempt is perfect, it would be added to consecutive
  if (currentPerfect) consecutivePerfect++;

  switch (p.learningStatus) {
    case STATUS.NEW:
      // First attempt
      return currentPerfect ? STATUS.LEARNING : STATUS.REVIEW;

    case STATUS.LEARNING:
      if (currentPerfect && consecutivePerfect >= 3) return STATUS.MASTERED;
      if (!currentPerfect) return STATUS.REVIEW;
      return STATUS.LEARNING;

    case STATUS.REVIEW:
      if (currentPerfect && consecutivePerfect >= 2) return STATUS.LEARNING;
      return STATUS.REVIEW;

    case STATUS.MASTERED:
      // If mastered but user makes errors, drop back to review
      if (!currentPerfect && currentAccuracy < 0.8) return STATUS.REVIEW;
      if (!currentPerfect) return STATUS.LEARNING;
      return STATUS.MASTERED;

    default:
      return currentPerfect ? STATUS.LEARNING : STATUS.REVIEW;
  }
}

/**
 * Record a completed practice attempt.
 *
 * @param {string} questionId
 * @param {object} result
 *   { score: number, total: number, answers: [{questionId, userAnswer, correctAnswer, isCorrect}], duration: seconds }
 */
export async function recordAttempt(questionId, result) {
  const p = await getProgress(questionId);

  const accuracy = result.total > 0 ? result.score / result.total : 0;
  const now = new Date().toISOString();
  const duration = result.duration || 0;

  // ── Build answer records ──
  const wrongAnswers = (result.answers || []).filter(a => !a.isCorrect);

  // ── Append to history ──
  p.history.push({
    date: now,
    score: result.score,
    total: result.total,
    accuracy: Math.round(accuracy * 10000) / 10000,
    duration: duration,
    wrongQuestions: wrongAnswers.map(a => String(a.questionId))
  });

  // ── Update wrong details (per-question error tracking) ──
  wrongAnswers.forEach(a => {
    const qNum = String(a.questionId);
    p.wrongDetails[qNum] = (p.wrongDetails[qNum] || 0) + 1;
  });

  // ── Recalculate aggregate stats ──
  p.completed = true;
  p.attemptCount = p.history.length;
  p.accuracy = p.history.reduce((sum, h) => sum + h.accuracy, 0) / p.history.length;
  p.lastPractice = now;
  p.wrongCount = Object.values(p.wrongDetails).reduce((a, b) => a + b, 0);
  p.elapsedSeconds = (p.elapsedSeconds || 0) + duration;

  // ── Compute learning status ──
  p.learningStatus = computeStatus(p, result.score, result.total);

  // ── Persist ──
  await putOne('progress', p);

  // ── Update in-memory state ──
  _updateMemoryState(questionId, p);

  return p;
}

/**
 * Toggle favorite status.
 */
export async function toggleFavorite(questionId) {
  const p = await getProgress(questionId);
  p.favorite = !p.favorite;
  await putOne('progress', p);
  _updateMemoryState(questionId, p);
  return p;
}

/**
 * Mark a question as mastered (manual override).
 */
export async function markMastered(questionId) {
  const p = await getProgress(questionId);
  p.learningStatus = STATUS.MASTERED;
  await putOne('progress', p);
  _updateMemoryState(questionId, p);
  return p;
}

/**
 * Mark a question for review (un-master / reset).
 */
export async function markReview(questionId) {
  const p = await getProgress(questionId);
  p.learningStatus = STATUS.REVIEW;
  await putOne('progress', p);
  _updateMemoryState(questionId, p);
  return p;
}

/**
 * Reset all progress for a question (fresh start).
 */
export async function resetProgress(questionId) {
  const p = createDefaultProgress(questionId);
  await putOne('progress', p);
  _updateMemoryState(questionId, p);
  return p;
}

/**
 * Delete a single history entry and recalculate stats.
 * @param {string} questionId
 * @param {number} historyIndex — index in the history array to remove
 */
export async function deleteHistoryEntry(questionId, historyIndex) {
  const p = await getProgress(questionId);
  if (!p.history || historyIndex < 0 || historyIndex >= p.history.length) {
    throw new Error('Invalid history index');
  }

  const removed = p.history[historyIndex];

  // Remove from wrongDetails if this entry had wrong answers
  (removed.wrongQuestions || []).forEach(qNum => {
    if (p.wrongDetails[qNum]) {
      p.wrongDetails[qNum]--;
      if (p.wrongDetails[qNum] <= 0) delete p.wrongDetails[qNum];
    }
  });

  // Remove history entry
  p.history.splice(historyIndex, 1);

  // Recalculate stats
  p.attemptCount = p.history.length;
  p.completed = p.history.length > 0;
  p.wrongCount = Object.values(p.wrongDetails).reduce((a, b) => a + b, 0);

  if (p.history.length === 0) {
    p.accuracy = 0;
    p.lastPractice = null;
    p.learningStatus = STATUS.NEW;
    p.elapsedSeconds = 0;
  } else {
    p.accuracy = p.history.reduce((sum, h) => sum + h.accuracy, 0) / p.history.length;
    p.lastPractice = p.history[p.history.length - 1].date;
    p.elapsedSeconds = p.history.reduce((sum, h) => sum + (h.duration || 0), 0);
    p.learningStatus = computeStatus(p, p.history[p.history.length - 1].score, p.history[p.history.length - 1].total);
  }

  await putOne('progress', p);
  _updateMemoryState(questionId, p);
  return p;
}

/**
 * Save audio position for continue-listening.
 */
export async function saveAudioPosition(questionId, seconds) {
  const p = await getProgress(questionId);
  p.audioPosition = seconds;
  await putOne('progress', p);
  _updateMemoryState(questionId, p);
}

/**
 * Get all questions with errors (for mistakes page).
 */
export async function getMistakeQuestions() {
  const allProgress = await getAll('progress');
  return allProgress
    .filter(p => p.wrongCount > 0 && p.learningStatus !== STATUS.MASTERED)
    .sort((a, b) => b.wrongCount - a.wrongCount);
}

/**
 * Get most recently opened/practiced question (for continue-learning).
 */
export async function getContinueLearning() {
  const allProgress = await getAll('progress');
  let best = null;
  let bestDate = '';
  for (const p of allProgress) {
    const d = p.lastOpened || p.lastPractice;
    if (d && (!bestDate || d > bestDate)) {
      bestDate = d;
      best = p;
    }
  }
  return best;
}

/**
 * Merge questions with their progress data.
 */
export function mergeQuestionsWithProgress(questions, progressMap) {
  return questions.map(q => {
    const p = progressMap[q.id];
    return {
      ...q,
      completed: p?.completed || false,
      attemptCount: p?.attemptCount || 0,
      accuracy: p?.accuracy || 0,
      lastPractice: p?.lastPractice || null,
      lastOpened: p?.lastOpened || null,
      wrongCount: p?.wrongCount || 0,
      wrongDetails: p?.wrongDetails || {},
      favorite: p?.favorite || false,
      learningStatus: p?.learningStatus || STATUS.NEW,
      audioPosition: p?.audioPosition || 0,
      elapsedSeconds: p?.elapsedSeconds || 0
    };
  });
}

/**
 * Verify data integrity — check all progress records are valid.
 * Returns { ok: true } or { ok: false, issues: [...] }
 */
export async function verifyAllData() {
  const issues = [];
  const allProgress = await getAll('progress');

  for (const p of allProgress) {
    if (!p.questionId) issues.push({ type: 'missing_id', record: p });
    if (typeof p.completed !== 'boolean') issues.push({ type: 'invalid_completed', id: p.questionId });
    if (typeof p.attemptCount !== 'number' || p.attemptCount < 0) issues.push({ type: 'invalid_attemptCount', id: p.questionId });
    if (typeof p.accuracy !== 'number') issues.push({ type: 'invalid_accuracy', id: p.questionId });
    if (p.attemptCount > 0 && !p.lastPractice) issues.push({ type: 'missing_lastPractice', id: p.questionId });
    if (p.attemptCount !== (p.history || []).length) issues.push({
      type: 'history_mismatch',
      id: p.questionId,
      expected: p.attemptCount,
      actual: (p.history || []).length
    });
    if (![STATUS.NEW, STATUS.LEARNING, STATUS.REVIEW, STATUS.MASTERED].includes(p.learningStatus)) {
      issues.push({ type: 'invalid_status', id: p.questionId, status: p.learningStatus });
    }
  }

  const questionCount = await count('questions');
  const progressCount = allProgress.length;

  return {
    ok: issues.length === 0,
    stats: {
      totalQuestions: questionCount,
      totalProgress: progressCount,
      completed: allProgress.filter(p => p.completed).length,
      mastered: allProgress.filter(p => p.learningStatus === STATUS.MASTERED).length,
      reviewing: allProgress.filter(p => p.learningStatus === STATUS.REVIEW).length,
      newItems: allProgress.filter(p => p.learningStatus === STATUS.NEW).length,
      learning: allProgress.filter(p => p.learningStatus === STATUS.LEARNING).length,
      totalMistakes: allProgress.reduce((s, p) => s + p.wrongCount, 0),
      totalPracticeTime: allProgress.reduce((s, p) => s + (p.elapsedSeconds || 0), 0),
    },
    issues
  };
}

/**
 * Create test data — simulate completing N questions.
 * Useful for verifying dashboard/stats before real practice.
 */
export async function createTestData(questionIds, baseAccuracy = 0.8) {
  const results = [];
  for (const qid of questionIds) {
    const total = 10; // most questions have 10 items
    const score = Math.max(1, Math.round(total * (baseAccuracy + (Math.random() - 0.5) * 0.3)));
    const answers = [];
    for (let i = 0; i < total; i++) {
      const isCorrect = i < score;
      answers.push({
        questionId: String(i + 1),
        userAnswer: isCorrect ? 'correct' : 'wrong',
        correctAnswer: 'correct',
        isCorrect
      });
    }
    const result = await recordAttempt(qid, {
      score,
      total,
      answers,
      duration: Math.floor(300 + Math.random() * 600)
    });
    results.push(result);
  }
  return results;
}

/* ── Internal ── */

function _updateMemoryState(questionId, progress) {
  const state = getState();
  state.progress[questionId] = progress;
  updateState('progress', state.progress);
}

/**
 * Import Service
 * Loads questions.json into IndexedDB on first run or manual re-import.
 */

import { openDB, putAll, getAll, count } from '../core/database.js';
import { updateState } from '../core/state.js';

const QUESTIONS_JSON_PATH = './data/questions.json';

/**
 * Load questions.json from disk and import into IndexedDB.
 * Skips if DB already has records (idempotent).
 * Returns import stats.
 */
export async function importQuestions() {
  await openDB();

  const existing = await count('questions');
  if (existing > 0) {
    console.log(`Import skipped: ${existing} questions already in DB.`);
    return { total: existing, new: 0, skipped: existing, errors: [] };
  }

  console.log('Importing questions from questions.json ...');
  const resp = await fetch(QUESTIONS_JSON_PATH);
  if (!resp.ok) throw new Error(`Failed to load questions.json: ${resp.status}`);

  const data = await resp.json();
  const items = data.items || [];
  const meta = data.meta || {};

  // Transform keys to match DB schema
  const records = items.map(item => ({
    id: item.id,
    stableId: item.stableId,
    title: item.title,
    part: item.part,
    frequency: item.frequency,
    cambridge: item.cambridge || '',
    difficulty: item.difficulty || '',
    tags: item.tags || [],
    questionTypes: item.questionTypes || [],
    questionCount: item.questionCount || 0,
    htmlPath: item.htmlPath,
    audioPath: item.audioPath,
    pdfPath: item.pdfPath || null,
    hasTranscript: item.hasTranscript || false,
    importedAt: new Date().toISOString()
  }));

  await putAll('questions', records);

  const result = {
    total: records.length,
    new: records.length,
    skipped: 0,
    errors: meta.errors || []
  };

  // Update global state
  updateState('questions', records);

  console.log(`Import complete: ${records.length} questions imported.`);
  return result;
}

/**
 * Force re-import (clears then imports).
 */
export async function reimportQuestions() {
  const db = await openDB();
  const tx = db.transaction('questions', 'readwrite');
  const store = tx.objectStore('questions');
  await new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = resolve;
    req.onerror = reject;
  });

  return importQuestions();
}

/**
 * Get import status — total items, part breakdown.
 */
export async function getImportStatus() {
  const questions = await getAll('questions');
  const parts = {};
  const freqs = {};
  questions.forEach(q => {
    parts[q.part] = (parts[q.part] || 0) + 1;
    freqs[q.frequency] = (freqs[q.frequency] || 0) + 1;
  });

  return {
    total: questions.length,
    parts,
    frequencies: freqs
  };
}

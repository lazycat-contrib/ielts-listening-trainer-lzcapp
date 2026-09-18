/**
 * LocalStorage Backup Layer
 * Provides a secondary persistence layer for critical user data.
 * IndexedDB is primary; localStorage serves as backup and cross-session checksum.
 */

const BACKUP_KEY = 'ielts_trainer_ls_backup';
const BACKUP_VERSION = 1;

/**
 * Save a snapshot of progress data to localStorage.
 * Called after each significant data change.
 */
export function saveBackup(progressMap) {
  try {
    const snapshot = {
      version: BACKUP_VERSION,
      updatedAt: new Date().toISOString(),
      count: Object.keys(progressMap).length,
      data: progressMap
    };
    localStorage.setItem(BACKUP_KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    console.warn('localStorage backup failed:', e.message);
    return false;
  }
}

/**
 * Load backup from localStorage.
 * Used to verify IndexedDB hasn't lost data.
 */
export function loadBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('localStorage load failed:', e.message);
    return null;
  }
}

/**
 * Compare IndexedDB progress count with localStorage backup.
 * Returns { synced: true } if counts match, or { synced: false, ... } with diff.
 */
export function verifyBackupSync(progressMap) {
  const backup = loadBackup();
  if (!backup) {
    return { synced: true, message: 'No backup exists yet' };
  }

  const dbCount = Object.keys(progressMap).length;
  const backupCount = backup.count;

  if (dbCount === backupCount) {
    return { synced: true, message: `Synced: ${dbCount} records` };
  }

  return {
    synced: false,
    message: `Mismatch: DB has ${dbCount} records, backup has ${backupCount}`,
    dbCount,
    backupCount,
    backupDate: backup.updatedAt
  };
}

/**
 * Save a simple setting to localStorage.
 */
export function saveSetting(key, value) {
  try {
    const settings = JSON.parse(localStorage.getItem('ielts_trainer_settings') || '{}');
    settings[key] = value;
    localStorage.setItem('ielts_trainer_settings', JSON.stringify(settings));
  } catch (e) {
    console.warn('saveSetting failed:', e.message);
  }
}

/**
 * Load all settings from localStorage.
 */
export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem('ielts_trainer_settings') || '{}');
  } catch (e) {
    return {};
  }
}

/**
 * Clear all trainer-related localStorage data.
 */
export function clearAllStorage() {
  localStorage.removeItem(BACKUP_KEY);
  localStorage.removeItem('ielts_trainer_settings');
}

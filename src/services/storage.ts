/**
 * Accès chrome.storage.local — enveloppe sûre et testable (Étape 9).
 *
 * Toutes les lectures/écritures passent par ici afin que :
 *  - l'UI ne dépende jamais de chrome.* directement (testable sans chrome) ;
 *  - une indisponibilité du stockage n'empêche jamais l'audit de fonctionner.
 */

const NAMESPACE = 'a11yLens:';

/** Vrai si l'API de stockage est disponible dans ce contexte. */
export function storageAvailable(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    chrome.storage != null &&
    chrome.storage.local != null
  );
}

/** Lit une valeur JSON ; `null` si absente, illisible ou stockage indisponible. */
export async function readJson<T = unknown>(key: string): Promise<T | null> {
  if (!storageAvailable()) return null;
  try {
    const full = await chrome.storage.local.get(NAMESPACE + key);
    const raw = full[NAMESPACE + key];
    if (typeof raw === 'string') return JSON.parse(raw) as T;
    return (raw ?? null) as T | null;
  } catch {
    return null;
  }
}

/** Écrit une valeur JSON ; ignore silencieusement les échecs (non bloquant). */
export async function writeJson(key: string, value: unknown): Promise<void> {
  if (!storageAvailable()) return;
  try {
    await chrome.storage.local.set({ [NAMESPACE + key]: JSON.stringify(value) });
  } catch {
    /* quota / contexte indisponible : on dégrade proprement */
  }
}

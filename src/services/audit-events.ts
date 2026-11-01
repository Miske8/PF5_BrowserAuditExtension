/**
 * Bus d'événements d'audit (Étape 16).
 *
 * L'onglet inspecté ne peut pas parler directement à la popup : quand un
 * audit est lancé depuis une popup déjà ouverte, on écrit un événement dans
 * `chrome.storage.local` et les autres contextes (popup ouverte) s'y abonnent
 * via `chrome.storage.onChanged`. C'est le mécanisme de communication léger
 * recommandé en MV3 sans worker persistant.
 *
 * Robustesse : indisponibilité du stockage = no-op silencieux ; jamais de throw.
 */

import { readJson, writeJson, storageAvailable } from './storage';

export const AUDIT_EVENT_KEY = 'auditEvent';

/** Événement « un audit vient d'être lancé » (horodaté, sérialisable). */
export interface AuditStartedEvent {
  type: 'audit-started';
  at: string;
}

/** Émet l'événement (best effort — un échec de stockage ne casse pas l'audit). */
export async function emitAuditStarted(): Promise<void> {
  await writeJson(AUDIT_EVENT_KEY, {
    type: 'audit-started',
    at: new Date().toISOString(),
  } satisfies AuditStartedEvent);
}

/** Vrai si la valeur lue est un événement « audit-started » valide. */
export function isAuditStartedEvent(value: unknown): value is AuditStartedEvent {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<AuditStartedEvent>;
  return candidate.type === 'audit-started' && typeof candidate.at === 'string';
}

/**
 * S'abonne aux événements d'audit émis ailleurs dans l'extension.
 * Retourne une fonction de désabonnement (idempotente).
 */
export function subscribeToAuditEvents(onEvent: () => void): () => void {
  if (!storageAvailable() || chrome.storage.onChanged == null) return () => {};
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') return;
    const change = changes['a11yLens:' + AUDIT_EVENT_KEY];
    if (change && isAuditStartedEvent(change.newValue)) onEvent();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** Dernier événement connu (peut être null). */
export async function readLastAuditEvent(): Promise<AuditStartedEvent | null> {
  const value = await readJson<unknown>(AUDIT_EVENT_KEY);
  return isAuditStartedEvent(value) ? value : null;
}

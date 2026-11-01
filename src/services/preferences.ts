/**
 * Service de préférences (Étape 13).
 *
 * Source de vérité unique des options utilisateur, persistées dans
 * `chrome.storage.local` et converties en `AuditOptions` consommées par le
 * moteur d'audit (via `runAuditOnActiveTab`).
 *
 * Robustesse : toute valeur absente ou invalide retombe silencieusement sur
 * les défauts (le stockage peut être corrompu par d'anciennes versions).
 */

import type { AuditOptions, RuleId } from '../types';
import { readJson, writeJson, storageAvailable } from './storage';

/** Niveau WCAG utilisé par la règle de contraste. */
export type ContrastLevel = 'AA' | 'AAA';

/** Mode développeur : désactive le seuil de confiance minimal de la règle de contraste. */
export type Sensitivity = 'standard' | 'developer';

/** Préférences persistables de l'extension. */
export interface A11yPreferences {
  /** Ids des règles désactivées par l'utilisateur. */
  disabledRuleIds: string[];
  /** Niveau WCAG pour la règle de contraste. */
  contrastLevel: ContrastLevel;
  /** Sensibilité : « developer » affiche aussi les diagnostics incertains. */
  sensitivity: Sensitivity;
}

/** Valeurs par défaut — utilisées si rien n'est stocké ou en cas de données invalides. */
export const DEFAULT_PREFERENCES: A11yPreferences = {
  disabledRuleIds: [],
  contrastLevel: 'AA',
  sensitivity: 'standard',
};

const PREFS_KEY = 'preferences';

/** Seuil de confiance minimal appliqué à la règle de contraste selon la sensibilité. */
export function minContrastConfidence(sensitivity: Sensitivity): number {
  return sensitivity === 'developer' ? 0 : 0.5;
}

/** Sanitise un objet inconnu (lu du storage) en préférences valides. */
export function sanitizePreferences(raw: unknown): A11yPreferences {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFERENCES };
  const candidate = raw as Partial<A11yPreferences> & {
    /** Ancien nom de champ (pré-« sensitivity »), accepté en migration douce. */
    developerMode?: boolean;
  };
  const legacyDeveloper = candidate.developerMode === true;
  return {
    disabledRuleIds: Array.isArray(candidate.disabledRuleIds)
      ? [
          ...new Set(
            candidate.disabledRuleIds.filter(
              (id): id is string => typeof id === 'string',
            ),
          ),
        ]
      : [],
    contrastLevel: candidate.contrastLevel === 'AAA' ? 'AAA' : 'AA',
    sensitivity:
      candidate.sensitivity === 'developer' || legacyDeveloper ? 'developer' : 'standard',
  };
}

/** Charge les préférences (défauts garantis, jamais de throw). */
export async function loadPreferences(): Promise<A11yPreferences> {
  if (!storageAvailable()) return { ...DEFAULT_PREFERENCES };
  try {
    return sanitizePreferences(await readJson(PREFS_KEY));
  } catch {
    return { ...DEFAULT_AUDIT_FALLBACK() };
  }
}

function DEFAULT_AUDIT_FALLBACK(): A11yPreferences {
  return { ...DEFAULT_PREFERENCES };
}

/** Sauvegarde les préférences (assainies avant écriture). */
export async function savePreferences(prefs: A11yPreferences): Promise<void> {
  if (!storageAvailable()) return;
  await writeJson(PREFS_KEY, sanitizePreferences(prefs));
}

/**
 * Convertit les préférences en options d'audit pour le moteur.
 * `minContrastConfidence` est un champ additionnel toléré par le moteur
 * (les options partielles sont complétées par `resolveOptions`).
 */
export function preferencesToAuditOptions(prefs: A11yPreferences): AuditOptions {
  return {
    contrastLevel: prefs.contrastLevel,
    disabledRules: [...prefs.disabledRuleIds] as RuleId[],
  };
}

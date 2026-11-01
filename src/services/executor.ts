/**
 * Service d'exécution de l'audit (Étape 9).
 *
 * C'est LE point d'entrée de la popup vers le moteur. L'UI ne parle jamais
 * directement à chrome.scripting ni au moteur : elle appelle ce service,
 * qui renvoie toujours un `AuditRunResult` (union ok / échec typé), jamais
 * une exception pour les cas métier attendus.
 *
 * Flux :
 *   getActiveTab() → assertAnalyzable(url) → executeScript(runAuditInPage)
 *   → buildReport(rawOutput) → persiste le dernier rapport (best effort).
 *
 * CONTRAINTES MV3 respectées :
 *  - injection à la demande uniquement (aucun content script permanent) ;
 *  - permissions minimales : activeTab suffit (clic sur l'action = accès) ;
 *  - la fonction injectée est autonome : tout son graphe d'imports est
 *    bundlé par Rollup dans le IIFE sérialisé via `func` (pas de fichier
 *    JS externe, pas de `world: 'MAIN'`).
 */

import { runAudit } from '../audit/audit-engine';
import { buildReport, isA11yReport, type A11yReport } from '../audit/report-builder';
import type { AuditFailureCode, AuditRunResult } from '../audit/types';
import type { AuditOptions } from '../types';
import { readJson, writeJson } from './storage';

/** URL que l'extension peut analyser avec `activeTab` seules (pas de host_permissions). */
const ANALYZABLE_URL = /^https?:\/\//i;

/** Messages français par code d'échec — affichés dans l'état erreur de la popup. */
export const AUDIT_ERROR_MESSAGES_FR: Record<AuditFailureCode, string> = {
  UNSUPPORTED_PAGE:
    "Cette page ne peut pas être analysée. Ouvrez une page http(s) puis relancez l'audit.",
  NO_TAB_ACCESS:
    "Accès refusé à cet onglet. Rechargez la page ou vérifiez les autorisations de l'extension.",
  TAB_UNAVAILABLE:
    "L'onglet n'est pas prêt (chargement en cours ou page fermée). Réessayez une fois la page chargée.",
  INJECTION_FAILED:
    "L'analyse a échoué lors de l'injection du script. Réessayez ou ouvrez la console de la page pour plus de détails.",
  EMPTY_DOCUMENT:
    'Le document de la page est vide ou inaccessible (cadre protégé, PDF, page en cours de démontage).',
  UNKNOWN: "Une erreur inattendue est survenue pendant l'audit.",
};

/** Erreurs chrome.runtime.lastError dont le message indique un manque d'accès. */
function classifyInjectionError(message: string): AuditFailureCode {
  if (
    /chrome-extension|Cannot access|permission|debugger|frame|devtools/i.test(message)
  ) {
    return 'NO_TAB_ACCESS';
  }
  return 'INJECTION_FAILED';
}

/** Onglet actif de la fenêtre courante (null si aucun). */
export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/** Vrai si l'URL est analysable (http/https uniquement avec activeTab). */
export function isAnalyzableUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return ANALYZABLE_URL.test(new URL(url).href);
  } catch {
    return false;
  }
}

/** Pré-flight : retourne un code d'échec si la page ne peut pas être auditée. */
export function checkAnalyzable(tab: chrome.tabs.Tab | null): AuditRunResult | null {
  if (!tab || tab.id === undefined || tab.id < 0) {
    return {
      ok: false,
      code: 'TAB_UNAVAILABLE',
      message: AUDIT_ERROR_MESSAGES_FR.TAB_UNAVAILABLE,
    };
  }
  if (!isAnalyzableUrl(tab.url)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_PAGE',
      message: AUDIT_ERROR_MESSAGES_FR.UNSUPPORTED_PAGE,
    };
  }
  if (tab.status === 'loading') {
    return {
      ok: false,
      code: 'TAB_UNAVAILABLE',
      message: AUDIT_ERROR_MESSAGES_FR.TAB_UNAVAILABLE,
    };
  }
  return null;
}

/**
 * Point d'entrée exécuté DANS la page inspectée (via chrome.scripting).
 * Doit rester autonome : seuls des imports statiques purs sont autorisés.
 * La version est passée en argument (le contexte page n'a pas import.meta.env).
 */
function runAuditInPage(options: Partial<AuditOptions>, version: string): unknown {
  const output = runAudit(document, location.href, options);
  return buildReport(output, { version });
}

/** Enveloppe promise autour de chrome.scripting.executeScript (MV3, API callback). */
async function injectAudit(
  tabId: number,
  options: Partial<AuditOptions>,
  version: string,
): Promise<unknown> {
  const results = await new Promise<chrome.scripting.InjectionResult[]>(
    (resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: runAuditInPage,
          args: [options, version],
        },
        (res) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) reject(new Error(lastError.message ?? 'Injection impossible.'));
          else resolve(res ?? []);
        },
      );
    },
  );

  const frame = results[0] as
    { result?: unknown; error?: { message?: string } } | undefined;
  if (!frame) throw new Error('Aucun résultat d’injection.');
  if (frame.error) {
    // Chrome 111+ : InjectionResult peut porter une `error` (portable) — on garde le message.
    throw new Error(String(frame.error.message ?? 'Exécution de l’audit impossible.'));
  }
  return frame.result;
}

/** Version de l'extension (manifest courant), best effort. */
async function readExtensionVersion(): Promise<string> {
  try {
    return chrome.runtime.getManifest().version ?? '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

const LAST_REPORT_KEY = 'lastReport';

/** Charge le dernier rapport persisté (restauré quand la popup se rouvre). */
export async function loadLastReport(): Promise<A11yReport | null> {
  const stored = await readJson<unknown>(LAST_REPORT_KEY);
  return isA11yReport(stored) ? stored : null;
}

/**
 * Lance un audit complet de l'onglet actif et retourne un rapport.
 * Ne lève jamais pour les cas attendus : toute erreur métier devient
 * `{ ok: false, code, message }` (gérée par l'UI, Étape 12).
 */
export async function runAuditOnActiveTab(
  options: Partial<AuditOptions> = {},
): Promise<AuditRunResult> {
  if (typeof chrome === 'undefined' || chrome.scripting == null || chrome.tabs == null) {
    return {
      ok: false,
      code: 'NO_TAB_ACCESS',
      message: AUDIT_ERROR_MESSAGES_FR.NO_TAB_ACCESS,
    };
  }

  let tab: chrome.tabs.Tab | null;
  try {
    tab = await getActiveTab();
  } catch {
    return {
      ok: false,
      code: 'TAB_UNAVAILABLE',
      message: AUDIT_ERROR_MESSAGES_FR.TAB_UNAVAILABLE,
    };
  }

  const preflight = checkAnalyzable(tab);
  if (preflight) return preflight;
  const tabId = tab!.id!;

  const version = await readExtensionVersion();
  try {
    const raw = await injectAudit(tabId, options, version);
    if (!isA11yReport(raw)) {
      return {
        ok: false,
        code: 'EMPTY_DOCUMENT',
        message: AUDIT_ERROR_MESSAGES_FR.EMPTY_DOCUMENT,
      };
    }
    // Persistance best-effort : un échec de stockage ne doit pas casser l'UI.
    void writeJson(LAST_REPORT_KEY, raw);
    return { ok: true, report: raw };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = classifyInjectionError(message);
    return { ok: false, code, message: AUDIT_ERROR_MESSAGES_FR[code] };
  }
}

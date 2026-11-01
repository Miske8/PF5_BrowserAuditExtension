/**
 * Service popup → page : surlignage des éléments problématiques
 * (fonctionnalité highlight).
 *
 * Même philosophie que l'audit (Étapes 9/12) :
 *  - injection À LA DEMANDE d'une fonction autonome (`highlightInPage`) via
 *    `chrome.scripting.executeScript` — aucun content script permanent ;
 *  - uniquement `activeTab` + `scripting`, aucune host permission ajoutée ;
 *  - le service ne lève jamais pour un cas métier attendu : il retourne un
 *    `HighlightRunResult` typé que l'UI traduit en message accessible.
 *
 * Différence notable avec l'audit : ici on injecte dans TOUS les frames
 * accessibles (`allFrames: true`). Chaque instance de la fonction compare le
 * `frameId` porté par la cible au sien et n'agit que sur correspondance —
 * sans cela, un sélecteur relatif trouvé à la fois dans le frame principal et
 * une iframe serait surligné deux fois au mauvais endroit.
 */

import { highlightInPage } from '../highlight/content';
import {
  DEFAULT_HIGHLIGHT_DURATION_MS,
  type HighlightRequest,
  type HighlightResult,
  type HighlightTarget,
} from '../highlight/contract';
import type { AuditIssue, Severity } from '../types';
import { getActiveTab, isAnalyzableUrl } from './executor';

/** Résultat du service — union typée, comme `AuditRunResult` côté audit. */
export type HighlightRunResult =
  | { ok: true; result: HighlightResult }
  | { ok: false; code: 'TAB_UNAVAILABLE' | 'UNSUPPORTED_PAGE' | 'INJECTION_FAILED'; message: string };

const HIGHLIGHT_MESSAGES_FR = {
  TAB_UNAVAILABLE:
    "Impossible de localiser l'onglet actif. Rouvrez la popup sur la page analysée.",
  UNSUPPORTED_PAGE:
    "Cette page ne peut pas être modifiée (page interne ou hors http(s)).",
  INJECTION_FAILED:
    "Le surlignage a échoué : la page a peut-être changé depuis l'audit. Relancez l'analyse.",
} as const;

/**
 * Construit les cibles de surlignage d'une issue : uniquement les findings
 * dotés d'un sélecteur. Les issues « globales » (ex: <html lang> absent,
 * landmarks manquants) n'ont rien à pointer et retournent [].
 */
export function buildHighlightTargets(
  issue: Pick<AuditIssue, 'severity' | 'elements'>,
): HighlightTarget[] {
  return issue.elements
    .filter((finding) => typeof finding.selector === 'string' && finding.selector !== '')
    .map((finding) => ({
      selector: finding.selector as string,
      severityClass: issue.severity as Severity,
      // frameId absent (rapport antérieur) = frame principal.
      frameId: finding.frameId ?? 0,
    }));
}

/** Vrai si l'issue peut être surlignée (au moins un finding avec sélecteur). */
export function canHighlightIssue(issue: Pick<AuditIssue, 'elements'>): boolean {
  return issue.elements.some(
    (finding) => typeof finding.selector === 'string' && finding.selector !== '',
  );
}

/** Enveloppe promise autour de chrome.scripting (MV3, API callback). */
async function injectHighlight(
  tabId: number,
  request: HighlightRequest,
): Promise<HighlightResult[]> {
  const results = await new Promise<chrome.scripting.InjectionResult[]>(
    (resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId, allFrames: true },
          func: highlightInPage,
          args: [request],
        },
        (res) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) reject(new Error(lastError.message ?? 'Injection impossible.'));
          else resolve(res ?? []);
        },
      );
    },
  );
  const out: HighlightResult[] = [];
  for (const frame of results) {
    const candidate = frame as { result?: unknown; error?: { message?: string } };
    if (candidate.error || candidate.result == null) continue; // frame protégé : ignoré
    const value = candidate.result as Partial<HighlightResult>;
    if (
      typeof value.status === 'string' &&
      typeof value.found === 'number' &&
      typeof value.requested === 'number'
    ) {
      out.push({
        status: value.status as HighlightResult['status'],
        found: Math.max(0, Math.floor(value.found)),
        requested: Math.max(0, Math.floor(value.requested)),
      });
    }
  }
  return out;
}

/** Agrège les résultats par frame : total trouvé, meilleur statut. */
export function aggregateHighlightResults(frames: HighlightResult[]): HighlightResult {
  let found = 0;
  let requested = 0;
  let anyHighlighted = false;
  let anyIgnoredFrame = false;
  let anyCleared = false;
  for (const frame of frames) {
    found += frame.found;
    requested += frame.requested;
    if (frame.status === 'highlighted') anyHighlighted = true;
    if (frame.status === 'ignored-frame') anyIgnoredFrame = true;
    if (frame.status === 'cleared') anyCleared = true;
  }
  const status = anyHighlighted
    ? 'highlighted'
    : anyCleared
      ? 'cleared'
      : anyIgnoredFrame
        ? 'ignored-frame'
        : 'not-found';
  return { status, found, requested };
}

/** Message français court pour annoncer le résultat aux lecteurs d'écran. */
export function highlightMessageFr(result: HighlightResult): string {
  switch (result.status) {
    case 'highlighted':
      return `${result.found} élément(s) surligné(s) dans la page pendant quelques secondes.`;
    case 'not-found':
      return "L'élément n'a pas pu être retrouvé : la page a peut-être changé. Relancez l'audit.";
    case 'ignored-frame':
      return "Cet élément se trouve dans une iframe non accessible au surlignage.";
    case 'cleared':
      return 'Surlignage retiré.';
  }
}

/**
 * Surligne les éléments d'une issue dans l'onglet actif.
 * @param clearMode true = retire tout surlignage actif sans en poser.
 */
export async function highlightIssueElements(
  issue: Pick<AuditIssue, 'severity' | 'elements'>,
  options: { durationMs?: number; clearMode?: boolean } = {},
): Promise<HighlightRunResult> {
  if (typeof chrome === 'undefined' || chrome.scripting == null || chrome.tabs == null) {
    return { ok: false, code: 'INJECTION_FAILED', message: HIGHLIGHT_MESSAGES_FR.INJECTION_FAILED };
  }

  let tab: chrome.tabs.Tab | null;
  try {
    tab = await getActiveTab();
  } catch {
    return { ok: false, code: 'TAB_UNAVAILABLE', message: HIGHLIGHT_MESSAGES_FR.TAB_UNAVAILABLE };
  }
  if (!tab || tab.id === undefined || tab.id < 0) {
    return { ok: false, code: 'TAB_UNAVAILABLE', message: HIGHLIGHT_MESSAGES_FR.TAB_UNAVAILABLE };
  }
  if (!isAnalyzableUrl(tab.url)) {
    return { ok: false, code: 'UNSUPPORTED_PAGE', message: HIGHLIGHT_MESSAGES_FR.UNSUPPORTED_PAGE };
  }

  const request: HighlightRequest = {
    targets: options.clearMode ? [] : buildHighlightTargets(issue),
    durationMs: options.durationMs ?? DEFAULT_HIGHLIGHT_DURATION_MS,
    ...(options.clearMode ? { clear: true } : {}),
  };

  if (!options.clearMode && request.targets.length === 0) {
    return {
      ok: true,
      result: { status: 'not-found', found: 0, requested: 0 },
    };
  }

  try {
    const frames = await injectHighlight(tab.id, request);
    return { ok: true, result: aggregateHighlightResults(frames) };
  } catch {
    return { ok: false, code: 'INJECTION_FAILED', message: HIGHLIGHT_MESSAGES_FR.INJECTION_FAILED };
  }
}

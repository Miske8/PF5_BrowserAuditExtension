/**
 * Content script de surlignage — injecté À LA DEMANDE (fonctionnalité highlight).
 *
 * Comme pour l'audit, aucun fichier JS permanent n'est déclaré dans le
 * manifest : cette fonction autonome est sérialisée par
 * `chrome.scripting.executeScript({ func })` (tout son graphe d'imports est
 * bundlé par Rollup dans le IIFE), exécutée dans chaque frame (`allFrames`),
 * puis retirée. Elle ne crée et ne supprime aucun élément de la page :
 * uniquement une classe + un attribut `data-a11y-lens-*`, annulés à la fin.
 *
 * Cycle de vie :
 *  1. requête = { targets, severity, durationMs, clear? } ;
 *  2. filtrage sur le frameId courant (jamais de ciblage dans un autre frame) ;
 *  3. résolution sûre du sélecteur (try/catch — un CSSPath invalide ne casse
 *     rien), scrollIntoView centré, halo coloré selon la sévérité ;
 *  4. retrait automatique après durationMs (timer stocké sur l'élément via
 *     l'attribut data + WeakMap interne), ou immédiat si `clear: true`.
 *
 * Limites iframe (documentées) : les iframes cross-origin sont accessibles à
 * l'injection MV3, mais chrome.scripting ne renvoie pas le frameId — aussi
 * l'audit marque-t-il ses findings `frameId: -1` dans ce cas, et le
 * surlignage refuse toute cible dont le frameId ne correspond pas au contexte
 * courant (statut `ignored-frame`). Le frame principal (frameId 0) est
 * toujours surligné, y compris pour les rapports antérieurs sans frameId.
 */

import type { HighlightRequest, HighlightResult, HighlightStatus } from './contract';
import { HIGHLIGHT_CSS } from './styles';

/**
 * Point d'entrée exécuté DANS chaque frame inspecté.
 * Doit rester autonome : seuls des imports statiques purs sont autorisés
 * (mêmes contraintes que `runAuditInPage` côté audit).
 */
export function highlightInPage(request: HighlightRequest): HighlightResult {
  const CLASS_BASE = 'a11y-lens-highlight';
  const ATTR_TOKEN = 'data-a11y-lens-token';
  const ATTR_DURATION = 'data-a11y-lens-duration';
  const STYLE_ID = 'a11y-lens-highlight-style';

  // Timers par token (non sérialisable — volontairement hors du résultat).
  const timersByToken = new Map<string, number>();

  /** Identifiant du frame courant (0 = principal ; -1 = cross-origin inconnu). */
  function currentFrameId(): number {
    try {
      return window === window.top ? 0 : -1;
    } catch {
      return -1;
    }
  }

  /** Retire tout surlignage posé par cette instance du script (idempotent). */
  function clearAll(): void {
    for (const timer of timersByToken.values()) window.clearTimeout(timer);
    timersByToken.clear();
    const marked = document.querySelectorAll(`[${ATTR_TOKEN}]`);
    for (const node of Array.from(marked)) {
      const el = node as HTMLElement;
      el.classList.remove(
        CLASS_BASE,
        `${CLASS_BASE}--critical`,
        `${CLASS_BASE}--major`,
        `${CLASS_BASE}--moderate`,
        `${CLASS_BASE}--minor`,
      );
      el.removeAttribute(ATTR_TOKEN);
      el.removeAttribute(ATTR_DURATION);
    }
  }

  /** Injecte la feuille de style de surlignage (une seule fois par frame). */
  function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = HIGHLIGHT_CSS;
    (document.head ?? document.documentElement).append(style);
  }

  /** Résolution défensive : un sélecteur invalide ou exotique ne doit jamais jeter. */
  function safeQueryAll(selector: string): Element[] {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  const requested = request.targets.length;

  if (request.clear) {
    clearAll();
    return { status: 'cleared', found: 0, requested };
  }

  // Sécurité multi-frames : on n'agit QUE si le frame demandé est le nôtre.
  // frameId absent (rapport d'une version antérieure) = frame principal.
  const myFrame = currentFrameId();
  const targetsHere = request.targets.filter((t) => (t.frameId ?? 0) === myFrame);
  if (targetsHere.length === 0) {
    return { status: 'ignored-frame', found: 0, requested };
  }

  ensureStyles();
  // Nouvelle demande : on repart de zéro (un seul surlignage actif à la fois).
  clearAll();

  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let found = 0;

  for (const target of targetsHere) {
    for (const node of safeQueryAll(target.selector)) {
      const el = node as HTMLElement;
      el.classList.add(CLASS_BASE, `${CLASS_BASE}--${target.severityClass}`);
      el.setAttribute(ATTR_TOKEN, token);
      el.setAttribute(ATTR_DURATION, String(request.durationMs));
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch {
        try {
          el.scrollIntoView();
        } catch {
          /* éléments détachés/iframe sandbox : on ignore */
        }
      }
      found += 1;
    }
  }

  if (found === 0) {
    return { status: 'not-found', found: 0, requested };
  }

  // Auto-nettoyage différé : aucune modification durable du DOM.
  const timer = window.setTimeout(() => {
    timersByToken.delete(token);
    const stillMarked = document.querySelectorAll<HTMLElement>(`[${ATTR_TOKEN}="${token}"]`);
    for (const node of Array.from(stillMarked)) {
      node.classList.remove(
        CLASS_BASE,
        `${CLASS_BASE}--critical`,
        `${CLASS_BASE}--major`,
        `${CLASS_BASE}--moderate`,
        `${CLASS_BASE}--minor`,
      );
      node.removeAttribute(ATTR_TOKEN);
      node.removeAttribute(ATTR_DURATION);
    }
  }, Math.max(500, Math.min(request.durationMs, 30_000)));
  timersByToken.set(token, timer);

  const status: HighlightStatus = 'highlighted';
  return { status, found, requested };
}

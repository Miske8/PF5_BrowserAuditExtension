/**
 * Helpers partagés par les règles d'audit (Étapes 6-7).
 *
 * Une règle = un fichier dans `src/audit/rules/` qui exporte une `AuditRule`
 * via `defineRule`. Ces utilitaires factorisent la production des occurrences
 * (`RawIssue`) pour garantir partout le même format normalisé :
 * ruleId / severity / message / selector+chemin DOM / extrait HTML court /
 * recommandation.
 */

import type { ElementFinding } from '../../types';
import type { RawIssue } from '../../rules/rule';
import { cssPath, elementSnippet } from '../../utils/dom';

/** Construit la description d'un élément concerné (sérialisable, jamais de noeud DOM). */
export function finding(el: Element, detail?: string): ElementFinding {
  const out: ElementFinding = {
    tag: el.tagName.toLowerCase(),
    selector: cssPath(el),
    snippet: elementSnippet(el),
  };
  if (detail) out.detail = detail;
  return out;
}

/** Occurrence « plusieurs éléments » : une issue groupée (ex: ids dupliqués). */
export function groupedIssue(
  elements: ElementFinding[],
  overrides: Partial<RawIssue> = {},
): RawIssue {
  return { elements, ...overrides };
}

/** Occurrence « un seul élément » : pratique pour les règles à granularité fine. */
export function singleIssue(
  el: Element,
  detail?: string,
  overrides: Partial<RawIssue> = {},
): RawIssue {
  return groupedIssue([finding(el, detail)], overrides);
}

/** Extrait l'attribut `name` ou une représentation courte pour les messages. */
export function fieldIdentity(el: Element): string {
  const name = el.getAttribute('name');
  if (name && name.trim() !== '') return `name="${name.trim()}"`;
  const id = el.getAttribute('id');
  if (id && id.trim() !== '') return `#${id.trim()}`;
  return el.tagName.toLowerCase();
}

/**
 * Vrai si le <fieldset> possède un <legend> enfant direct.
 * Écrit en DOM impératif : `querySelector(':scope > legend')` n'est pas
 * implémenté par tous les environnements de test (happy-dom) ni par les
 * très vieux navigateurs — la logique doit rester identique partout.
 */
export function hasDirectLegend(fieldset: Element): boolean {
  for (const child of Array.from(fieldset.children)) {
    if (child.tagName === 'LEGEND') return true;
  }
  return false;
}

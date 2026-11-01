/**
 * Règle : éléments focusables masqués par aria-hidden (Étape 6 — n°10).
 * WCAG 4.1.2 (A) — critique.
 *
 * Un élément atteignable au clavier mais caché aux technologies d’assistance
 * (aria-hidden="true", directement ou hérité d’un ancêtre) crée un « trou noir » :
 * le focus s’y pose sans aucune annonce. Inversement, un descendant focusable
 * caché par inertie physique (disabled) est exclu.
 */

import { defineRule } from '../../rules/rule';
import { isFocusable } from '../../utils/dom';
import { finding } from './helpers';

export const ariaHiddenFocusableRule = defineRule({
  id: 'aria-hidden-focusable',
  title: 'Éléments focusables avec aria-hidden',
  description:
    'Des éléments restent atteignables au clavier alors qu’ils sont masqués aux technologies d’assistance via aria-hidden="true".',
  impact:
    'Le focus se déplace sur un élément invisible pour le lecteur d’écran : l’utilisateur reste bloqué sur un fantôme sans comprendre où il se trouve.',
  severity: 'critical',
  category: 'aria',
  wcag: 'WCAG 4.1.2 (A)',
  helpUrl: 'https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interaction/',
  recommendation:
    'Soit retirer aria-hidden, soit rendre l’élément non focusable (tabindex="-1"), soit le retirer du DOM quand il est masqué (repli visuel via hidden/display:none qui rend aussi les descendants non focusables).',
  version: '1.0.0',
  evaluate: (ctx) => {
    const bad: Element[] = [];

    for (const el of Array.from(ctx.document.querySelectorAll('[aria-hidden="true"]'))) {
      // L'élément masqué lui-même est-il focusable ?
      if (isFocusable(el) && !hasDisabledAncestorOrSelf(el)) bad.push(el);
      // Ses descendants focusables le sont aussi (héritage de aria-hidden).
      for (const descendant of Array.from(el.querySelectorAll('*'))) {
        if (!isFocusable(descendant)) continue;
        if (descendant.closest('[aria-hidden="false"]')) continue;
        if (hasDisabledAncestorOrSelf(descendant)) continue;
        bad.push(descendant);
      }
    }

    // Déduplication (un même élément peut être atteint via plusieurs conteneurs).
    const unique = [...new Set(bad)];
    if (unique.length === 0) return { passed: true, issues: [] };
    return {
      passed: false,
      issues: [{ elements: unique.map((el) => finding(el, 'focusable mais caché par aria-hidden="true"')) }],
    };
  },
});

/** Vrai si l'élément ou un ancêtre est `disabled` (alors hors séquence clavier). */
function hasDisabledAncestorOrSelf(el: Element): boolean {
  let current: Element | null = el;
  while (current) {
    if ((current as HTMLButtonElement).disabled === true) return true;
    if (current.hasAttribute('inert')) return true;
    current = current.parentElement;
  }
  return false;
}

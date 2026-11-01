/**
 * Règle : tabindex positif (Étape 6 — n°9).
 * WCAG 2.4.3 (A) — modéré.
 *
 * tabindex > 0 place l’élément dans une séquence de focus artificielle qui
 * prime sur l’ordre naturel du DOM : la navigation clavier devient
 * imprévisible pour tous les outils d’assistance.
 */

import { defineRule } from '../../rules/rule';
import { finding } from './helpers';

export const tabindexPositiveRule = defineRule({
  id: 'tabindex-positive',
  title: 'tabindex positif',
  description:
    'Des éléments utilisent tabindex="1" ou plus : ils court-circuitent l’ordre de focus naturel du document.',
  impact:
    'La tabulation suit un ordre arbitraire, déconnecté du flux visuel — source d’erreurs pour les utilisateurs clavier et lecteurs d’écran.',
  severity: 'moderate',
  category: 'keyboard',
  wcag: 'WCAG 2.4.3 (A)',
  helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html',
  recommendation:
    'Retirer tout tabindex > 0. Utiliser tabindex="0" pour rendre focusable, "-1" pour le focus programmatique, et laisser l’ordre suivre le DOM.',
  version: '1.0.0',
  evaluate: (ctx) => {
    const bad: Element[] = [];

    for (const el of Array.from(ctx.document.querySelectorAll('[tabindex]'))) {
      const value = Number.parseInt(el.getAttribute('tabindex') ?? '', 10);
      if (!Number.isNaN(value) && value > 0) bad.push(el);
    }

    if (bad.length === 0) return { passed: true, issues: [] };
    return {
      passed: false,
      issues: [
        {
          elements: bad.map((el) =>
            finding(el, `tabindex="${el.getAttribute('tabindex')}"`),
          ),
        },
      ],
    };
  },
});

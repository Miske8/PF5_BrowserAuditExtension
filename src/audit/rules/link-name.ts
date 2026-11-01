/**
 * Règle : liens sans nom accessible (Étape 6 — n°3).
 * WCAG 2.4.4 (A) — critique.
 *
 * Un <a href> (ou role="link") doit avoir un nom : texte, aria-label,
 * aria-labelledby, title, ou image interne avec alt non vide.
 * Les ancres vides (« lien vide ») et les libellés uniquement blancs sont
 * signalés ; les liens sans href relèvent d'autres règles (non traités ici).
 */

import { defineRule } from '../../rules/rule';
import { accessibleName, isLinkElement } from '../../utils/dom';
import { finding } from './helpers';

export const linkNameRule = defineRule({
  id: 'link-name',
  title: 'Liens sans nom accessible',
  description:
    'Certains liens ne fournissent aucun nom accessible : impossible de deviner leur destination au lecteur d’écran.',
  impact:
    'Dans la liste des liens d’une page, l’utilisateur entendra « lien » sans destination, ou un utilitaire du type « cliquer ici » dépourvu de sens hors contexte.',
  severity: 'critical',
  category: 'links',
  wcag: 'WCAG 2.4.4 (A)',
  helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html',
  recommendation:
    'Rendre le contenu textuel du lien explicite (« Lire l’article X »), ou ajouter aria-label/title si seul un icône est visible.',
  version: '1.0.0',
  evaluate: (ctx) => {
    const bad: Element[] = [];

    for (const el of Array.from(ctx.document.querySelectorAll('a[href], [role]'))) {
      if (!isLinkElement(el)) continue;
      if (accessibleName(el) === '') bad.push(el);
    }

    if (bad.length === 0) return { passed: true, issues: [] };
    return {
      passed: false,
      issues: [{ elements: bad.map((el) => finding(el, 'nom accessible vide')) }],
    };
  },
});

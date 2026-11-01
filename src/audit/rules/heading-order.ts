/**
 * Règle : ordre des titres incohérent (Étape 6 — n°6).
 * WCAG 1.3.1 / 2.4.6 — majeur.
 *
 * La hiérarchie h1..h6 doit être logique :
 *  - saut de niveau descendant interdit (h1 → h3 sans h2 intermédiaire) ;
 *  - plusieurs <h1> sur une même page (structure ambiguë) signalé en modéré ;
 *  - premier titre de rang > 1 : toléré si document structuré, signalé modéré.
 * Les titres masqués (aria-hidden) sont ignorés : hors flux de navigation.
 */

import { defineRule, type RawIssue } from '../../rules/rule';
import { finding } from './helpers';

export const headingOrderRule = defineRule({
  id: 'heading-order',
  title: 'Ordre des titres incohérent',
  description:
    'La hiérarchie des titres (h1…h6) présente des sauts de niveau : la navigation rapide par titres devient trompeuse.',
  impact:
    'Les utilisateurs de lecteur d’écran naviguent entre sections via les titres ; un saut h1→h3 laisse penser qu’une section h2 manque.',
  severity: 'major',
  category: 'headings',
  wcag: 'WCAG 1.3.1 (A)',
  helpUrl: 'https://www.w3.org/WAI/tutorials/page-structure/headings/',
  recommendation:
    'Utiliser les niveaux dans l’ordre (h1 → h2 → h3…), sans en sauter. Changer le style visuel via CSS, pas via le niveau de titre.',
  version: '1.0.0',
  evaluate: (ctx) => {
    const headings = Array.from(ctx.document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(
      (h) => h.closest('[aria-hidden="true"]') === null,
    );

    if (headings.length === 0) {
      return {
        passed: false,
        issues: [
          {
            title: 'Aucun titre de section',
            description: 'Le document ne contient aucun élément h1…h6 : structure non navigable par titres.',
            severity: 'moderate',
            recommendation: 'Introduire au moins un <h1> décrivant le sujet principal, puis une hiérarchie cohérente.',
            elements: [],
            // Absence globale = 1 seule occurrence (sinon elements.length = 0).
            occurrences: 1,
          },
        ],
      };
    }

    const issues: RawIssue[] = [];
    let previousLevel = 0;
    const skips: { el: Element; detail: string }[] = [];

    for (const h of headings) {
      const level = Number.parseInt(h.tagName.slice(1), 10);
      if (previousLevel > 0 && level > previousLevel + 1) {
        skips.push({ el: h, detail: `h${level} suit directement h${previousLevel} (saut de ${level - previousLevel})` });
      }
      previousLevel = level;
    }

    if (skips.length > 0) {
      issues.push({ elements: skips.map((s) => finding(s.el, s.detail)) });
    }

    const h1s = headings.filter((h) => h.tagName === 'H1');
    if (h1s.length > 1) {
      issues.push({
        title: 'Plusieurs titres <h1>',
        description: 'La page déclare plusieurs h1 : la structure principale est ambiguë.',
        severity: 'moderate',
        recommendation: 'Garder un seul <h1> (sujet de la page) et rétrograder les autres en <h2>.',
        elements: h1s.map((el) => finding(el, 'titre h1')),
      });
    }

    return { passed: issues.length === 0, issues };
  },
});

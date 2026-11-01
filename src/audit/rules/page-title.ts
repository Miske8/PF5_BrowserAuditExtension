/**
 * Règle : titre de page absent (Étape 6 — n°8).
 * WCAG 2.4.2 (A) — majeur.
 *
 * <title> est le premier élément annoncé par le lecteur d’écran et le libellé
 * de l’onglet. Absent ou vide → la page n’a pas de nom.
 */

import { defineRule } from '../../rules/rule';
import { finding } from './helpers';

export const pageTitleRule = defineRule({
  id: 'page-title',
  title: 'Titre de page absent',
  description:
    'Le document ne contient pas d’élément <title>, ou celui-ci est vide : la page n’a pas de nom.',
  impact:
    'L’onglet du navigateur et l’historique de navigation sont illisibles ; plusieurs ouvertures deviennent impossibles à distinguer au lecteur d’écran.',
  severity: 'major',
  category: 'document',
  wcag: 'WCAG 2.4.2 (A)',
  helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/document-title.html',
  recommendation:
    'Ajouter un <title> descriptif dans le <head>, idéalement « Sujet — Nom du site » (50-60 caractères).',
  version: '1.0.0',
  evaluate: (ctx) => {
    const titleEl = ctx.document.querySelector('title');
    const text = (titleEl?.textContent ?? '').trim();

    if (titleEl !== null && text !== '') return { passed: true, issues: [] };

    return {
      passed: false,
      issues: [
        {
          elements: titleEl
            ? [finding(titleEl, '<title> vide')]
            : [{ tag: 'head', snippet: '<head>…</head>', detail: 'aucun élément <title>' }],
        },
      ],
    };
  },
});

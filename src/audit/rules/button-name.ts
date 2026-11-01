/**
 * Règle : boutons sans nom accessible (Étape 6 — n°2).
 * WCAG 4.1.2 / 2.4.6 (A) — critique.
 *
 * Un <button> (ou role="button") doit restituer un nom : contenu textuel,
 * aria-label, aria-labelledby, title, ou image interne avec alt.
 * Les <input type="button|submit|reset"> sont couverts : leur `value`
 * tient lieu de nom (type="image" : l'`alt`).
 */

import { defineRule } from '../../rules/rule';
import { accessibleName, isButtonElement } from '../../utils/dom';
import { finding } from './helpers';

export const buttonNameRule = defineRule({
  id: 'button-name',
  title: 'Boutons sans nom accessible',
  description:
    'Certains boutons n’ont aucun nom accessible : les technologies d’assistance ne peuvent pas annoncer leur fonction.',
  impact:
    'Un utilisateur de lecteur d’écran entendra « bouton » sans savoir ce que le bouton fait (ex: bouton icône « croix » non libellé).',
  severity: 'critical',
  category: 'links',
  wcag: 'WCAG 4.1.2 (A)',
  helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html',
  recommendation:
    'Donner un contenu textuel au bouton, ou un aria-label/aria-labelledby décrivant son action (« Fermer », « Rechercher »…).',
  version: '1.0.0',
  evaluate: (ctx) => {
    const bad: Element[] = [];

    for (const el of Array.from(ctx.document.querySelectorAll('button, [role="button"], [role="submit"], [role="reset"]'))) {
      if (!isButtonElement(el)) continue;
      if (accessibleName(el) === '') bad.push(el);
    }

    for (const input of Array.from(
      ctx.document.querySelectorAll<HTMLInputElement>(
        'input[type="button"], input[type="submit"], input[type="reset"]',
      ),
    )) {
      const value = input.getAttribute('value');
      const hasAriaName = accessibleName(input) !== '';
      if ((value === null || value.trim() === '') && !hasAriaName) bad.push(input);
    }

    for (const img of Array.from(ctx.document.querySelectorAll<HTMLInputElement>('input[type="image"]'))) {
      if (!img.hasAttribute('alt') || (img.getAttribute('alt') ?? '').trim() === '') {
        if (accessibleName(img) === '') bad.push(img);
      }
    }

    if (bad.length === 0) return { passed: true, issues: [] };
    return {
      passed: false,
      issues: [{ elements: bad.map((el) => finding(el, 'nom accessible vide')) }],
    };
  },
});

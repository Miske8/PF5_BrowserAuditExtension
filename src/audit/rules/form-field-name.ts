/**
 * Règle : champs sans nom accessible de repli (Étape 6 — n°5).
 * WCAG 4.1.2 / 1.3.1 (A) — majeur.
 *
 * Complète la règle `label` : quand aucun <label> natif n'existe, le champ
 * doit au moins porter aria-label ou aria-labelledby (référence valide vers
 * un élément non vide), ou un title en dernier recours.
 * Un placeholder seul ne constitue PAS un nom fiable (disparaît à la saisie).
 */

import { defineRule } from '../../rules/rule';
import {
  findAssociatedLabel,
  hasNonEmptyAttr,
  isFormFieldElement,
} from '../../utils/dom';
import { fieldIdentity, finding, hasDirectLegend } from './helpers';

export const formFieldNameRule = defineRule({
  id: 'form-field-name',
  title: 'Champs sans aria-label ni aria-labelledby',
  description:
    'Des champs sans <label> natif ne portent non plus aucun aria-label/aria-labelledby : ils n’ont strictement aucun nom accessible.',
  impact:
    'Le champ est totalement innommé pour les technologies d’assistance ; un placeholder ne suffit pas (il disparaît dès la saisie et n’est pas restitué partout).',
  severity: 'major',
  category: 'forms',
  wcag: 'WCAG 4.1.2 (A)',
  helpUrl: 'https://www.w3.org/WAI/tutorials/forms/labels/',
  recommendation:
    'Ajouter un <label> visible (préférable), sinon aria-label="…" ou aria-labelledby="id-du-texte". Vérifier que l’id référencé existe et contient du texte.',
  version: '1.0.0',
  evaluate: (ctx) => {
    const doc = ctx.document;
    const bad: Element[] = [];

    for (const el of Array.from(doc.querySelectorAll('input, select, textarea'))) {
      if (!isFormFieldElement(el)) continue;
      // Couvert par la règle label ? On ne signale ici que les champs sans
      // aucune solution de nommage (ni label natif, ni ARIA, ni title).
      if (findAssociatedLabel(el) !== null) continue;

      const type = (el.getAttribute('type') ?? '').toLowerCase();
      if (type === 'radio' || type === 'checkbox') {
        const fieldset = el.closest('fieldset');
        if (fieldset && hasDirectLegend(fieldset)) continue;
      }

      if (hasNonEmptyAttr(el, 'aria-label')) continue;

      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const resolves = labelledBy.split(/\s+/).some((id) => {
          const target = doc.getElementById(id);
          return target !== null && (target.textContent ?? '').trim() !== '';
        });
        if (resolves) continue;
      }

      if (hasNonEmptyAttr(el, 'title')) continue;

      bad.push(el);
    }

    if (bad.length === 0) return { passed: true, issues: [] };
    return {
      passed: false,
      issues: [
        {
          elements: bad.map((el) =>
            finding(
              el,
              `champ ${fieldIdentity(el)} sans nom accessible (label/ARIA/title absents)`,
            ),
          ),
        },
      ],
    };
  },
});

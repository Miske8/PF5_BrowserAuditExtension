/**
 * Règle : champs de formulaire sans label (Étape 6 — n°4).
 * WCAG 1.3.1 / 3.3.2 (A) — majeur.
 *
 * Chaque champ étiquetable (input hors boutons/hidden, select, textarea)
 * doit être associé à un <label> natif : for/id ou englobement.
 * Un aria-label/aria-labelledby peut tenir lieu de nom mais ne remplace pas
 * un label visuel — c'est la règle suivante (form-field-name) qui le vérifie.
 * Les cases radio/groupes peuvent s'appuyer sur <fieldset><legend>.
 */

import { defineRule } from '../../rules/rule';
import { findAssociatedLabel, isFormFieldElement } from '../../utils/dom';
import { fieldIdentity, finding, hasDirectLegend } from './helpers';

export const labelRule = defineRule({
  id: 'label',
  title: 'Champs de formulaire sans label',
  description:
    'Des champs de formulaire ne sont associés à aucun élément <label> : leur finalité dépend uniquement d’un placeholder ou d’un contexte visuel.',
  impact:
    'Le lecteur d’écran annonce seulement « champ de saisie » ; le clic sur le libellé visuel n’active pas le champ (surface de cible réduite, maladresse motrice pénalisée).',
  severity: 'major',
  category: 'forms',
  wcag: 'WCAG 1.3.1 (A)',
  helpUrl: 'https://www.w3.org/WAI/tutorials/forms/labels/',
  recommendation:
    'Créer un <label for="id-du-champ"> visible, ou envelopper le champ dans un <label>. Pour un groupe de cases radio, utiliser <fieldset> + <legend>.',
  version: '1.0.0',
  evaluate: (ctx) => {
    const doc = ctx.document;
    const bad: Element[] = [];

    for (const el of Array.from(doc.querySelectorAll('input, select, textarea'))) {
      if (!isFormFieldElement(el)) continue;

      // Association native directe ?
      if (findAssociatedLabel(el) !== null) continue;

      // Groupe radio/checkbox : <legend> via fieldset accepté.
      const type = (el.getAttribute('type') ?? '').toLowerCase();
      if (type === 'radio' || type === 'checkbox') {
        const fieldset = el.closest('fieldset');
        if (fieldset && hasDirectLegend(fieldset)) continue;
      }

      bad.push(el);
    }

    if (bad.length === 0) return { passed: true, issues: [] };
    return {
      passed: false,
      issues: [
        {
          elements: bad.map((el) => finding(el, `champ ${fieldIdentity(el)} sans <label> associé`)),
        },
      ],
    };
  },
});

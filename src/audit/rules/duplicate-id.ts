/**
 * Règle : identifiants dupliqués (Étape 6 — n°11).
 * WCAG 4.1.1 (A) — majeur.
 *
 * Les id doivent être uniques dans le document : en cas de doublon,
 * getElementById / label[for] / aria-labelledby ne résolvent QUE le premier —
 * les associations silencieuses cassent.
 * Une issue est produite par groupe de doublons (tous les éléments concernés).
 */

import { defineRule, type RawIssue } from '../../rules/rule';
import { finding } from './helpers';

export const duplicateIdRule = defineRule({
  id: 'duplicate-id',
  title: 'Identifiants dupliqués',
  description:
    'Plusieurs éléments partagent le même attribut id : les références (label for, aria-labelledby, ancrages) ne ciblent que le premier.',
  impact:
    'Un champ étiqueté via un id dupliqué peut être associé au mauvais libellé ; les scripts et composants ARIA deviennent imprévisibles.',
  severity: 'major',
  category: 'structure',
  wcag: 'WCAG 4.1.1 (A)',
  helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/parsing.html',
  recommendation:
    'Rendre chaque id unique (préfixer les instances générées : item-1, item-2…). Vérifier les templates/partials réutilisés.',
  version: '1.0.0',
  evaluate: (ctx) => {
    const byId = new Map<string, Element[]>();

    for (const el of Array.from(ctx.document.querySelectorAll('[id]'))) {
      const id = el.id.trim();
      if (id === '') continue;
      const list = byId.get(id);
      if (list) list.push(el);
      else byId.set(id, [el]);
    }

    const issues: RawIssue[] = [];
    for (const [id, els] of byId) {
      if (els.length < 2) continue;
      issues.push({
        title: `Identifiant dupliqué : #${id}`,
        description: `L’id « ${id} » est porté par ${els.length} éléments distincts du document.`,
        elements: els.map((el) => finding(el, `id="${id}" (×${els.length})`)),
      });
    }

    return { passed: issues.length === 0, issues };
  },
});

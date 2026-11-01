/**
 * Règle : langue du document absente ou invalide (Étape 6 — n°7).
 * WCAG 3.1.1 (A) — majeur.
 *
 * <html lang="…"> est requis pour que le lecteur d’écran choisisse la bonne
 * voix/prononciation. On vérifie aussi la validité grossière du BCP 47
 * (primaire-souslangue) et le xml:lang en repli.
 */

import { defineRule } from '../../rules/rule';
import { finding } from './helpers';

const LANG_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

export const htmlLangRule = defineRule({
  id: 'html-lang',
  title: 'Langue du document absente',
  description:
    'L’attribut lang est absent ou vide sur <html> : la langue par défaut du contenu n’est pas déclarée.',
  impact:
    'Le lecteur d’écran utilise une voix inadaptée et prononce incorrectement tout le contenu (syllabes hachées, accents ignorés).',
  severity: 'major',
  category: 'document',
  wcag: 'WCAG 3.1.1 (A)',
  helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html',
  recommendation:
    'Déclarer la langue principale sur l’élément racine : <html lang="fr"> (code BCP 47 ; ex: "fr-FR", "en").',
  version: '1.0.0',
  evaluate: (ctx) => {
    const root = ctx.document.documentElement;
    if (!root) return { passed: true, issues: [] };

    const lang = (root.getAttribute('lang') ?? root.getAttribute('xml:lang') ?? '').trim();

    if (lang === '') {
      return {
        passed: false,
        issues: [
          {
            elements: [{ tag: 'html', snippet: '<html>', detail: 'attribut lang absent' }],
          },
        ],
      };
    }

    if (!LANG_RE.test(lang)) {
      return {
        passed: false,
        issues: [
          {
            title: 'Langue du document invalide',
            description: `La valeur d’attribut lang « ${lang} » ne respecte pas le format BCP 47.`,
            recommendation: 'Utiliser un code de langue valide (ex: "fr", "fr-FR", "en-GB").',
            elements: [finding(root, `lang="${lang}" non valide`)],
          },
        ],
      };
    }

    return { passed: true, issues: [] };
  },
});

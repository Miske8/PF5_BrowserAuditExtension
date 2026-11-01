/**
 * Règle : landmarks principaux manquants (Étape 6 — n°12).
 * WCAG 1.3.1 / 2.4.1 — modéré.
 *
 * Les points de repère structurent la navigation rapide (main, nav, header,
 * footer). On vérifie leur présence par balise native OU rôle ARIA équivalent :
 *   main        → <main> | role="main"
 *   nav         → <nav>  | role="navigation"
 *   banner      → <header hors sectionnée> | role="banner"
 *   contentinfo → <footer hors sectionnée>  | role="contentinfo"
 * Chaque landmark absent produit une occurrence distincte (sévérité adaptée :
 * main = majeur car indispensable, les autres = modérés).
 */

import { defineRule, type RawIssue } from '../../rules/rule';

interface LandmarkCheck {
  key: string;
  label: string;
  severity: 'major' | 'moderate';
  present: (doc: Document) => boolean;
}

const CHECKS: LandmarkCheck[] = [
  {
    key: 'main',
    label: '<main>',
    severity: 'major',
    present: (doc) =>
      doc.querySelector('main, [role="main"]') !== null,
  },
  {
    key: 'nav',
    label: '<nav>',
    severity: 'moderate',
    present: (doc) => doc.querySelector('nav, [role="navigation"]') !== null,
  },
  {
    key: 'banner',
    label: '<header>',
    severity: 'moderate',
    // <header> n'est un banner que s'il est enfant direct de body (sinon c'est un <section>head).
    present: (doc) =>
      doc.querySelector('[role="banner"]') !== null ||
      Array.from(doc.querySelectorAll('body > header')).length > 0,
  },
  {
    key: 'contentinfo',
    label: '<footer>',
    severity: 'moderate',
    present: (doc) =>
      doc.querySelector('[role="contentinfo"]') !== null ||
      Array.from(doc.querySelectorAll('body > footer')).length > 0,
  },
];

export const landmarksRule = defineRule({
  id: 'landmarks',
  title: 'Landmarks principaux manquants',
  description:
    'La page omet des points de repère structurels (main, nav, header, footer) : la navigation par landmarks est incomplète.',
  impact:
    'Les lecteurs d’écran proposent un menu de saut vers les landmarks ; leur absence condamne l’utilisateur à tout tabuler.',
  severity: 'moderate',
  category: 'structure',
  wcag: 'WCAG 1.3.1 (A)',
  helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/orientation.html',
  recommendation:
    'Structurer la page avec <main> (contenu unique), <nav> (menus), <header>/<footer> directs enfants de <body>, ou les rôles ARIA équivalents.',
  version: '1.0.0',
  evaluate: (ctx) => {
    const missing = CHECKS.filter((check) => !check.present(ctx.document));
    if (missing.length === 0) return { passed: true, issues: [] };

    const issues: RawIssue[] = missing.map((check) => ({
      title: `Landmark manquant : ${check.label}`,
      description: `Aucun élément « ${check.label} » (ou rôle ARIA équivalent) dans le document.`,
      severity: check.severity,
      elements: [{ tag: 'body', snippet: '<body>…</body>', detail: `${check.label} introuvable` }],
    }));

    return { passed: false, issues };
  },
});

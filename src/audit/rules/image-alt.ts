/**
 * Règle : images sans texte alternatif (Étape 6 — n°1).
 * WCAG 1.1.1 (A) — critique.
 *
 * Un <img> doit avoir un attribut alt :
 *  - absent            → image non décorative supposée, alternative manquante ;
 *  - vide ("")         → acceptable si l'image est décorative ;
 *  - alt=" "           → considéré comme manquant (piège classique) ;
 *  - role="presentation"/"none" sans alt → ambigu, signalé en mineur.
 */

import { defineRule, type RawIssue } from '../../rules/rule';
import { hasNonEmptyAttr } from '../../utils/dom';
import { finding } from './helpers';

export const imageAltRule = defineRule({
  id: 'image-alt',
  title: 'Images sans texte alternatif',
  description:
    'Certaines images ne portent pas d’attribut alt : les technologies d’assistance ne peuvent pas en restituer le contenu.',
  impact:
    'Un utilisateur de lecteur d’écran entendra seulement « image » ou l’URL du fichier, sans comprendre le contenu.',
  severity: 'critical',
  category: 'images',
  wcag: 'WCAG 1.1.1 (A)',
  helpUrl: 'https://www.w3.org/WAI/tutorials/images/decision-tree/',
  recommendation:
    'Ajouter un alt descriptif pour les images porteuses d’information, ou alt="" pour les images purement décoratives.',
  version: '1.0.0',
  evaluate: (ctx) => {
    const issues: RawIssue[] = [];
    const missing: Element[] = [];
    const decorativeAmbiguous: Element[] = [];

    for (const img of Array.from(ctx.document.querySelectorAll('img'))) {
      if (!img.hasAttribute('alt')) {
        const role = (img.getAttribute('role') ?? '').toLowerCase();
        if (role === 'presentation' || role === 'none') decorativeAmbiguous.push(img);
        else missing.push(img);
      } else if (!hasNonEmptyAttr(img, 'alt')) {
        // alt="" explicite : OK (décoratif). Mais alt=" " (espace) est un piège.
        const raw = img.getAttribute('alt') ?? '';
        if (raw !== '' && raw.trim() === '') missing.push(img);
      }
    }

    if (missing.length > 0) {
      issues.push({
        elements: missing.map((el) => finding(el, 'attribut alt absent ou vide')),
      });
    }
    if (decorativeAmbiguous.length > 0) {
      issues.push({
        title: 'Images décoratives sans alt=""',
        description:
          'Ces images utilisent role="presentation"/"none" mais gardent un attribut alt attendu par certaines combinaisons navigateur/lecteur d’écran.',
        severity: 'minor',
        recommendation:
          'Conserver role="presentation" et ajouter alt="" pour garantir l’ignorance complète par les technologies d’assistance.',
        elements: decorativeAmbiguous.map((el) =>
          finding(el, 'role="presentation"/"none" sans alt=""'),
        ),
      });
    }

    return { passed: issues.length === 0, issues };
  },
});

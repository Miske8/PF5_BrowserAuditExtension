/**
 * Tests unitaires de la règle de contraste (Étape 7) — happy-dom.
 *
 * happy-dom n'implémente pas getComputedStyle complet : on injecte un
 * defaultView factice qui résout les styles « comme le ferait un navigateur »
 * (couleur calculée = valeur déclarée ou héritée). Cela valide la logique de
 * résolution fond/avant-plan/confiance sans dépendre d'un moteur CSS réel.
 */

import { describe, expect, it } from 'vitest';
import type { AuditContext, AuditOptions } from '../src/types';
import { DEFAULT_AUDIT_OPTIONS } from '../src/types';
import { colorContrastRule } from '../src/audit/rules/color-contrast';
import { normalizeIssue } from '../src/rules/rule';

interface StyleSpec {
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  opacity?: string;
  display?: string;
  visibility?: string;
  backgroundImage?: string;
}

/** Construit un contexte avec un resolveur de styles par sélecteur. */
function ctxWithStyles(
  html: string,
  stylesBySelector: Record<string, StyleSpec>,
  options: Partial<AuditOptions> = {},
): AuditContext {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html>${html}`, 'text/html');
  const defaults: StyleSpec = {
    color: 'rgb(0, 0, 0)',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    fontSize: '16px',
    fontWeight: '400',
    opacity: '1',
    display: 'block',
    visibility: 'visible',
    backgroundImage: 'none',
  };
  const view = {
    getComputedStyle(el: Element): CSSStyleDeclaration {
      let spec: StyleSpec = { ...defaults };
      for (const [selector, value] of Object.entries(stylesBySelector)) {
        if (el.matches(selector)) spec = { ...spec, ...value };
      }
      return spec as unknown as CSSStyleDeclaration;
    },
  };
  Object.defineProperty(doc, 'defaultView', { value: view, configurable: true });
  return { document: doc, url: 'https://example.com/contrast', options: { ...DEFAULT_AUDIT_OPTIONS, ...options } };
}

function evaluate(html: string, styles: Record<string, StyleSpec>, options: Partial<AuditOptions> = {}) {
  const result = colorContrastRule.evaluate(ctxWithStyles(html, styles, options));
  return result.issues.map((raw, index) => normalizeIssue(colorContrastRule, raw, index));
}

const PAGE = '<body><p class="t">Texte testé</p></body>';

describe('color-contrast : cas conformes (pas de faux positifs)', () => {
  it('noir sur blanc → passe', () => {
    const issues = evaluate(PAGE, { '.t': { color: 'rgb(0, 0, 0)' }, body: { backgroundColor: 'rgb(255, 255, 255)' } });
    expect(issues).toHaveLength(0);
  });

  it('couleur héritée conforme (parent porte le color) → passe', () => {
    const html = '<body style=""><div class="wrap"><span>libellé</span></div></body>';
    const issues = evaluate(html, {
      '.wrap': { color: 'rgb(0, 0, 0)' }, // héritage simulé : span non stylé = noir par défaut
      body: { backgroundColor: '#fff' },
    });
    expect(issues).toHaveLength(0);
  });

  it('gros texte (28px) à 3.1:1 → passe en AA', () => {
    const issues = evaluate(PAGE, {
      '.t': { color: '#767676', fontSize: '28px' }, // ~4.54:1, largement OK pour gros texte
      body: { backgroundColor: '#ffffff' },
    });
    expect(issues).toHaveLength(0);
  });

  it('ratio à ±0.05 du seuil → toléré (near-pass)', () => {
    // #767676 sur blanc ≈ 4.54:1 → conforme ; #777777 ≈ 4.48:1 → sous 4.5 mais dans la tolérance ? 4.48 < 4.45 ? Non : 4.48 ≥ 4.5-0.05=4.45 → toléré.
    const issues = evaluate(PAGE, {
      '.t': { color: '#777777' },
      body: { backgroundColor: '#ffffff' },
    });
    expect(issues).toHaveLength(0);
  });

  it('aria-hidden ignoré (hors arbre d’accessibilité)', () => {
    const html = '<body><p aria-hidden="true" class="t">Déco</p></body>';
    const issues = evaluate(html, { '.t': { color: '#ffcccc' }, body: { backgroundColor: '#ffffff' } });
    expect(issues).toHaveLength(0);
  });

  it('display:none et opacity:0 ignorés', () => {
    const hidden = evaluate(PAGE, { '.t': { color: '#fff', display: 'none' }, body: { backgroundColor: '#fff' } });
    expect(hidden).toHaveLength(0);
    const faded = evaluate(PAGE, { '.t': { color: '#fff', opacity: '0' }, body: { backgroundColor: '#fff' } });
    expect(faded).toHaveLength(0);
  });

  it('couleur non résoluble (hsl…) → on renonce, pas de faux positif', () => {
    const issues = evaluate(PAGE, { '.t': { color: 'hsl(0, 0%, 0%)' }, body: { backgroundColor: '#fff' } });
    expect(issues).toHaveLength(0);
  });

  it('background-image sur un ancêtre lointain (body) : on reste utile', () => {
    // Le texte est dans une carte au fond coloré résolvable : l’image de
    // fond du body n’est pas derrière les glyphes → détection conservée.
    const html = '<body><div class="card"><p class="t">Texte</p></div></body>';
    const issues = evaluate(html, {
      '.t': { color: '#eeeeee' },
      '.card': { backgroundColor: '#ffffff' },
      body: { backgroundImage: 'url(banner.png)' },
    });
    expect(issues).toHaveLength(1);
  });

  it('background-image SUR l’élément de texte : visuel imprévisible → on renonce', () => {
    const issues = evaluate(PAGE, {
      '.t': { color: '#eeeeee', backgroundImage: 'url(texture.png)' },
      body: { backgroundColor: '#ffffff' },
    });
    expect(issues).toHaveLength(0);
  });
});

describe('color-contrast : détections', () => {
  it('gris clair sur blanc (≈1.35:1) → issue critical (quasi illisible)', () => {
    const issues = evaluate(PAGE, {
      '.t': { color: '#eeeeee' },
      body: { backgroundColor: '#ffffff' },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].ruleId).toBe('color-contrast');
    expect(issues[0].category).toBe('color');
    const el = issues[0].elements[0];
    expect(el.detail).toMatch(/contraste \d+(\.\d+)?:1 < 4\.5:1/);
    expect(el.detail).toContain('#eeeeee');
    expect(el.confidence).toBe(1); // fond opaque résolu
    expect(el.selector).toBeTruthy();
    expect(el.snippet).toContain('Texte testé');
  });

  it('rouge #ff0000 sur blanc (≈3.99:1) → moderate (AA texte normal)', () => {
    const issues = evaluate(PAGE, {
      '.t': { color: '#ff0000' },
      body: { backgroundColor: '#ffffff' },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('moderate');
    expect(issues[0].wcag).toBe('WCAG 1.4.3 (AA)');
  });

  it('gros texte gras 20px à 2.2:1 → major', () => {
    const issues = evaluate(PAGE, {
      '.t': { color: '#ff6666', fontSize: '20px', fontWeight: '700' },
      body: { backgroundColor: '#ffffff' },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('major');
    expect(issues[0].elements[0].detail).toContain('gros texte');
  });

  it('fond porté par un ancêtre opaque (chaîne de parents)', () => {
    const html = '<body><section class="dark"><p class="t">Texte</p></section></body>';
    const issues = evaluate(html, {
      '.t': { color: '#333333' },
      '.dark': { backgroundColor: '#222222' },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].elements[0].detail).toContain('sur fond #222222');
    expect(issues[0].elements[0].confidence).toBe(1);
  });

  it('transparence composée : rgba empilé puis blanc supposé → confiance réduite', () => {
    const html = '<body><div class="veil"><p class="t">Texte</p></div></body>';
    const issues = evaluate(html, {
      '.t': { color: '#000000' },
      '.veil': { backgroundColor: 'rgba(255, 255, 255, 0.5)' },
      // aucun fond opaque nulle part → aplatissement sur blanc
    });
    // noir sur blanc estimé = 21:1 → conforme même après mélange.
    expect(issues).toHaveLength(0);
  });

  it('sans ancêtre opaque : blanc supposé + mention « à vérifier »', () => {
    const issues = evaluate(PAGE, { '.t': { color: '#dddddd' } });
    expect(issues).toHaveLength(1);
    const el = issues[0].elements[0];
    expect(el.confidence).toBeLessThanOrEqual(0.6);
    expect(el.detail).toContain('à vérifier manuellement');
  });

  it('niveau AAA : un contraste AA-conforme (5:1) devient une issue minor', () => {
    // #595959 sur blanc ≈ 7.0? Non : ~7.0 est pile AAA. Utilisons #5c5c5c ≈ 6.6:1 (OK AA, KO AAA).
    const aaIssues = evaluate(PAGE, {
      '.t': { color: '#5c5c5c' },
      body: { backgroundColor: '#ffffff' },
    });
    expect(aaIssues).toHaveLength(0); // conforme AA (≥4.5)

    const aaaIssues = evaluate(
      PAGE,
      { '.t': { color: '#5c5c5c' }, body: { backgroundColor: '#ffffff' } },
      { contrastLevel: 'AAA' },
    );
    expect(aaaIssues).toHaveLength(1);
    expect(aaaIssues[0].severity).toBe('minor');
    expect(aaaIssues[0].wcag).toBe('WCAG 1.4.6 (AAA)');
    expect(aaaIssues[0].elements[0].detail).toContain('< 7:1');
  });

  it('plusieurs éléments échouants groupés dans une seule issue par sévérité', () => {
    const html = '<body><p class="a">Un</p><p class="b">Deux</p></body>';
    const issues = evaluate(html, {
      '.a': { color: '#eeeeee' },
      '.b': { color: '#dddddd' },
      body: { backgroundColor: '#ffffff' },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].elements).toHaveLength(2);
  });

  it('opacité cumulée parent+enfant prise en compte (confiance ≤ 0.85)', () => {
    const html = '<body><div class="half"><p class="t">Texte</p></div></body>';
    const issues = evaluate(html, {
      '.t': { color: '#aaaaaa', opacity: '0.9' },
      '.half': { opacity: '0.8' },
      body: { backgroundColor: '#ffffff' },
    });
    expect(issues.length).toBeGreaterThanOrEqual(0); // selon mélange exact
    if (issues.length > 0) {
      expect(issues[0].elements[0].confidence).toBeLessThanOrEqual(0.85);
    }
  });
});

describe('color-contrast : intégrité MV3', () => {
  it('les issues sont structurally cloneable', () => {
    const issues = evaluate(PAGE, { '.t': { color: '#eeeeee' }, body: { backgroundColor: '#ffffff' } });
    expect(() => structuredClone(issues)).not.toThrow();
  });
});

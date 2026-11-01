/**
 * Tests du contrat de règles (Étape 4) : defineRule, normalisation, registre.
 */
import { describe, it, expect } from 'vitest';
import {
  defineRule,
  normalizeIssue,
  makeIssueId,
  type AuditRule,
  type RawIssue,
} from '../src/rules/rule';
import { getRules, getRuleById, getRuleIds } from '../src/audit/registry';
import { DEFAULT_AUDIT_OPTIONS, type AuditContext } from '../src/types';

const sampleDoc = new DOMParser().parseFromString(
  '<html lang="fr"><head><title>T</title></head><body><img src="a.png"></body></html>',
  'text/html',
);

function ctx(): AuditContext {
  return {
    document: sampleDoc,
    url: 'https://example.com',
    options: DEFAULT_AUDIT_OPTIONS,
  };
}

const imgAltRule: AuditRule = defineRule({
  id: 'image-alt',
  title: 'Images sans texte alternatif',
  description: 'Certaines images n’ont pas d’attribut alt.',
  severity: 'critical',
  category: 'images',
  wcag: 'WCAG 1.1.1 (A)',
  helpUrl: 'https://www.w3.org/WAI/tutorials/images/',
  recommendation: 'Ajouter un attribut alt pertinent.',
  version: '1.0.0',
  evaluate: (c) => {
    const bad = [...c.document.querySelectorAll('img:not([alt])')];
    if (bad.length === 0) return { passed: true, issues: [] };
    return {
      passed: false,
      issues: [
        {
          elements: bad.map((el) => ({
            tag: el.tagName.toLowerCase(),
            snippet: el.outerHTML.slice(0, 80),
            detail: 'attribut alt absent',
          })),
        },
      ],
    };
  },
});

describe('contrat AuditRule / defineRule', () => {
  it('préserve toutes les métadonnées de la règle', () => {
    expect(imgAltRule.id).toBe('image-alt');
    expect(imgAltRule.severity).toBe('critical');
    expect(imgAltRule.category).toBe('images');
    expect(imgAltRule.version).toBe('1.0.0');
    expect(typeof imgAltRule.evaluate).toBe('function');
  });

  it('evaluate retourne passed=true sur une page saine', () => {
    const clean = new DOMParser().parseFromString(
      '<html><body><img src="a.png" alt="Un chat"></body></html>',
      'text/html',
    );
    const result = imgAltRule.evaluate({
      document: clean,
      url: 'https://example.com',
      options: DEFAULT_AUDIT_OPTIONS,
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('evaluate détecte une violation et produit des éléments sérialisables', () => {
    const result = imgAltRule.evaluate(ctx());
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
    const el = result.issues[0]?.elements?.[0];
    expect(el?.tag).toBe('img');
    expect(el?.snippet).toContain('<img');
    // Structurally cloneable : aucun noeud DOM dans le résultat.
    expect(() => structuredClone(result)).not.toThrow();
  });
});

describe('normalizeIssue', () => {
  const ruleMeta = imgAltRule;

  it('complète une issue minimale avec les métadonnées de la règle', () => {
    const raw: RawIssue = { elements: [{ tag: 'img' }] };
    const issue = normalizeIssue(ruleMeta, raw, 0);
    expect(issue.ruleId).toBe('image-alt');
    expect(issue.id).toBe(makeIssueId('image-alt', 0));
    expect(issue.title).toBe(ruleMeta.title);
    expect(issue.description).toBe(ruleMeta.description);
    expect(issue.recommendation).toBe(ruleMeta.recommendation);
    expect(issue.severity).toBe('critical');
    expect(issue.category).toBe('images');
    expect(issue.wcag).toBe('WCAG 1.1.1 (A)');
    expect(issue.helpUrl).toBe(ruleMeta.helpUrl);
    expect(issue.elements).toEqual([{ tag: 'img' }]);
  });

  it('laisse l’issue surcharger titre/description/sévérité/wcag', () => {
    const raw: RawIssue = {
      title: 'Image décorative sans alt=""',
      description: 'custom desc',
      recommendation: 'custom rec',
      severity: 'minor',
      category: 'structure',
      wcag: 'WCAG 1.1.1 custom',
      helpUrl: 'https://example.com/help',
      impact: 'Impact spécifique',
      elements: [],
    };
    const issue = normalizeIssue(ruleMeta, raw, 3);
    expect(issue.id).toBe('image-alt:3');
    expect(issue.title).toBe('Image décorative sans alt=""');
    expect(issue.description).toBe('custom desc');
    expect(issue.recommendation).toBe('custom rec');
    expect(issue.severity).toBe('minor');
    expect(issue.category).toBe('structure');
    expect(issue.wcag).toBe('WCAG 1.1.1 custom');
    expect(issue.helpUrl).toBe('https://example.com/help');
    expect(issue.impact).toBe('Impact spécifique');
  });

  it('ignore les surcharges vides (chaîne "") et garde les valeurs de la règle', () => {
    const raw: RawIssue = { title: '', description: '', elements: [] };
    const issue = normalizeIssue(ruleMeta, raw, 0);
    expect(issue.title).toBe(ruleMeta.title);
    expect(issue.description).toBe(ruleMeta.description);
  });

  it('produit des ids uniques par index', () => {
    const a = normalizeIssue(ruleMeta, {}, 0);
    const b = normalizeIssue(ruleMeta, {}, 1);
    expect(a.id).not.toBe(b.id);
  });

  it('le résultat normalisé est sérialisable (structuredClone)', () => {
    const issue = normalizeIssue(ruleMeta, { elements: [{ tag: 'img' }] }, 0);
    expect(() => structuredClone(issue)).not.toThrow();
  });
});

describe('registre de règles', () => {
  it('retourne une copie défensive (mutation sans effet)', () => {
    const rules = getRules() as AuditRule[];
    const before = rules.length;
    rules.push(imgAltRule);
    expect(getRules()).toHaveLength(before);
  });

  it('getRuleById / getRuleIds sont cohérents avec getRules', () => {
    const rules = getRules();
    for (const id of getRuleIds()) {
      expect(getRuleById(id)?.id).toBe(id);
    }
    expect(getRuleById('inexistante')).toBeUndefined();
    expect(rules.every((r) => getRuleIds().includes(r.id))).toBe(true);
  });
});

/**
 * Tests unitaires — score global (Étape 8).
 *
 * Vérifie la formule défendue dans src/audit/scoring.ts :
 *   perte = poids(sévérité) × occurrences, plafonnée par famille
 *   (critique ≤ 35, majeur ≤ 30, modéré ≤ 20, mineur ≤ 10), score = 100 − Σ.
 */

import { describe, expect, it } from 'vitest';
import type { AuditIssue, Severity } from '../src/types';
import {
  computeScore,
  countOccurrences,
  scoreLevel,
  SCORE_LEVEL_LABELS_FR,
} from '../src/audit/scoring';

/** Fabrique d'issue minimale pour les tests de score. */
function issue(overrides: Partial<AuditIssue> & { severity: Severity }): AuditIssue {
  return {
    ruleId: overrides.ruleId ?? 'test-rule',
    id: overrides.id ?? `test:${Math.random().toString(36).slice(2)}`,
    title: 'Test',
    description: 'Description de test',
    recommendation: 'Recommandation de test',
    category: 'structure',
    elements: [],
    ...overrides,
  };
}

describe('countOccurrences', () => {
  it('utilise occurrences quand présent', () => {
    expect(countOccurrences(issue({ severity: 'major', occurrences: 7 }))).toBe(7);
  });
  it('retombe sur le nombre d\u2019éléments sinon', () => {
    const el = { selector: 'img' };
    expect(countOccurrences(issue({ severity: 'major', elements: [el, el, el] }))).toBe(3);
  });
  it('vaut 1 pour une absence globale sans éléments', () => {
    expect(countOccurrences(issue({ severity: 'critical', elements: [] }))).toBe(1);
  });
  it('sanitize les valeurs invalides (négatif, décimal, NaN)', () => {
    expect(countOccurrences(issue({ severity: 'minor', occurrences: -3 }))).toBe(0);
    expect(countOccurrences(issue({ severity: 'minor', occurrences: 2.7 }))).toBe(2);
    expect(
      countOccurrences(issue({ severity: 'minor', occurrences: Number.NaN, elements: [{ tag: 'a' }] })),
    ).toBe(1);
  });
});

describe('scoreLevel', () => {
  it.each([
    [100, 'excellent'],
    [90, 'excellent'],
    [89, 'good'],
    [75, 'good'],
    [74, 'average'],
    [50, 'average'],
    [49, 'poor'],
    [0, 'poor'],
  ] as const)('score %i → niveau %s', (score, level) => {
    expect(scoreLevel(score)).toBe(level);
  });

  it('libellés français complets', () => {
    expect(Object.values(SCORE_LEVEL_LABELS_FR)).toEqual(['Excellent', 'Bon', 'Moyen', 'Faible']);
  });
});

describe('computeScore', () => {
  it('page sans problème → 100 / excellent', () => {
    const result = computeScore([]);
    expect(result.score).toBe(100);
    expect(result.level).toBe('excellent');
    expect(result.penalty).toBe(0);
    expect(result.totalOccurrences).toBe(0);
  });

  it('exemple défendable : 2 images sans alt (critiques) + 1 lien sans nom (majeur) → 90', () => {
    const issues = [
      issue({ ruleId: 'image-alt', severity: 'critical', occurrences: 2 }),
      issue({ ruleId: 'link-name', severity: 'major', occurrences: 1 }),
    ];
    const result = computeScore(issues);
    // 2×4 + 1×2 = 10 pts de perte.
    expect(result.penalty).toBe(10);
    expect(result.score).toBe(90);
    expect(result.weightedTotal).toBe(10);
    expect(result.totalOccurrences).toBe(3);
  });

  it('une seule occurrence critique → 96 (poids 4)', () => {
    expect(computeScore([issue({ severity: 'critical' })]).score).toBe(96);
  });

  it('les seuils de niveau sont appliqués au score arrondi', () => {
    // 3 occ. critiques = 12 pts de perte → 88 (bon).
    expect(computeScore([issue({ severity: 'critical', occurrences: 3 })]).score).toBe(88);
    // 9 occ. critiques = 36 bruts → plafond 35 → 65 (moyen).
    expect(computeScore([issue({ severity: 'critical', occurrences: 9 })]).score).toBe(65);
  });

  it('plafonne la pénalité critique à 35 points', () => {
    // 100 occurrences critiques ⇒ 400 bruts ⇒ plafonné à 35.
    const result = computeScore([issue({ severity: 'critical', occurrences: 100 })]);
    expect(result.penaltiesBySeverity.critical).toBe(35);
    expect(result.score).toBe(65);
  });

  it('cumule tous les plafonds ⇒ score minimal 5', () => {
    const result = computeScore([
      issue({ ruleId: 'a', severity: 'critical', occurrences: 100 }),
      issue({ ruleId: 'b', severity: 'major', occurrences: 100 }),
      issue({ ruleId: 'c', severity: 'moderate', occurrences: 100 }),
      issue({ ruleId: 'd', severity: 'minor', occurrences: 100 }),
    ]);
    expect(result.penalty).toBe(95); // 35 + 30 + 20 + 10
    expect(result.score).toBe(5);
    expect(result.level).toBe('poor');
  });

  it('ne descend jamais sous 0 même avec des valeurs extrêmes', () => {
    const weird = issue({ severity: 'critical', occurrences: 1_000_000 });
    expect(computeScore([weird]).score).toBeGreaterThanOrEqual(0);
  });

  it('compte les occurrences agrégées, pas les cartes UI', () => {
    // Une seule carte « 10 ids dupliqués » (majeurs) = 20 pts, pas 2.
    const result = computeScore([
      issue({ ruleId: 'duplicate-id', severity: 'major', occurrences: 10 }),
    ]);
    expect(result.penalty).toBe(20);
    expect(result.score).toBe(80);
  });

  it('le détail par sévérité est exposé et plafonné individuellement', () => {
    const result = computeScore([
      issue({ ruleId: 'x', severity: 'critical', occurrences: 20 }), // 80 brut → cap 35
      issue({ ruleId: 'y', severity: 'moderate', occurrences: 5 }), // 5 brut
    ]);
    expect(result.penaltiesBySeverity).toEqual({
      critical: 35,
      major: 0,
      moderate: 5,
      minor: 0,
    });
    expect(result.score).toBe(60);
  });

  it('résultat sérialisable (structuredClone) — contrainte MV3/storage', () => {
    const result = computeScore([issue({ severity: 'minor', occurrences: 2 })]);
    expect(() => structuredClone(result)).not.toThrow();
  });
});

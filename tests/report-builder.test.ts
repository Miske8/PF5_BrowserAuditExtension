/**
 * Tests unitaires — rapport final (Étape 8).
 *
 * Valide le pipeline complet : moteur (happy-dom) → RawAuditOutput →
 * buildReport → A11yReport. Vérifie la forme demandée par le cahier des
 * charges (url, timestamp, score, résumé par sévérité, problèmes, règles
 * exécutées, métadonnées page), la sérialisabilité MV3 et l'export JSON.
 */

import { describe, expect, it } from 'vitest';
import type { AuditIssue } from '../src/types';
import { runAudit } from '../src/audit/audit-engine';
import { getRules } from '../src/audit/registry';
import {
  buildReport,
  countRuleStatuses,
  isA11yReport,
  summarizeBySeverity,
  toExecutedRules,
  REPORT_SCHEMA_VERSION,
} from '../src/audit/report-builder';
import type { RawAuditOutput } from '../src/audit/types';

const URL = 'https://example.com/rapport';

/** Règles de base sans contraste (getComputedStyle instable sur happy-dom). */
const BASE_RULES = getRules().filter((r) => r.id !== 'color-contrast');

function audit(html: string): RawAuditOutput {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html>${html}`, 'text/html');
  return runAudit(doc, URL, {}, BASE_RULES);
}

const DIRTY_HTML = `
  <html lang="fr">
    <head><title>Page sale</title></head>
    <body>
      <img src="a.png">
      <img src="b.png">
      <button></button>
      <main><h1>Ok</h1><nav aria-label="Menu"><a href="#">Accueil</a></nav></main>
    </body>
  </html>`;

const CLEAN_HTML = `
  <html lang="fr">
    <head><title>Page propre</title></head>
    <body>
      <header><nav aria-label="Navigation"><a href="/">Accueil</a></nav></header>
      <main><h1>Bonjour</h1><p>Contenu.</p></main>
      <footer><p>Pied</p></footer>
    </body>
  </html>`;

describe('summarizeBySeverity', () => {
  it('compte issues ET occurrences agrégées séparément', () => {
    const issues: AuditIssue[] = [
      {
        ruleId: 'image-alt',
        id: 'image-alt:0',
        title: '',
        description: '',
        recommendation: '',
        severity: 'critical',
        category: 'images',
        elements: [{ tag: 'img' }, { tag: 'img' }],
        occurrences: 2,
      },
      {
        ruleId: 'html-lang',
        id: 'html-lang:0',
        title: '',
        description: '',
        recommendation: '',
        severity: 'major',
        category: 'document',
        elements: [],
        occurrences: 1,
      },
    ];
    const summary = summarizeBySeverity(issues);
    expect(summary.issues).toEqual({ critical: 1, major: 1, moderate: 0, minor: 0 });
    expect(summary.occurrences).toEqual({ critical: 2, major: 1, moderate: 0, minor: 0 });
    expect(summary.totalIssues).toBe(2);
    expect(summary.totalOccurrences).toBe(3);
  });

  it('tableaux toujours complets même à zéro', () => {
    const summary = summarizeBySeverity([]);
    expect(summary.issues).toEqual({ critical: 0, major: 0, moderate: 0, minor: 0 });
    expect(summary.totalOccurrences).toBe(0);
  });
});

describe('toExecutedRules / countRuleStatuses', () => {
  it('convertit les traces en liste platte avec reason conservée', () => {
    const output = runAudit(
      new DOMParser().parseFromString(CLEAN_HTML, 'text/html'),
      URL,
      { disabledRules: ['duplicate-id'] as never },
      BASE_RULES,
    );
    const rules = toExecutedRules(output);
    expect(rules).toHaveLength(BASE_RULES.length);
    const skipped = rules.find((r) => r.ruleId === 'duplicate-id');
    expect(skipped?.status).toBe('skipped');
    expect(skipped?.reason).toMatch(/désactivée/i);
  });

  it('compte chaque statut exactement une fois', () => {
    const stats = countRuleStatuses([
      { ruleId: 'a', title: '', severity: 'minor', status: 'pass', issueCount: 0 },
      { ruleId: 'b', title: '', severity: 'minor', status: 'fail', issueCount: 2 },
      { ruleId: 'c', title: '', severity: 'minor', status: 'error', issueCount: 0 },
      { ruleId: 'd', title: '', severity: 'minor', status: 'skipped', issueCount: 0 },
    ]);
    expect(stats).toEqual({
      total: 4,
      executed: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      errored: 1,
    });
  });
});

describe('buildReport — intégration moteur → rapport', () => {
  it('produit tous les champs exigés par le cahier des charges', () => {
    const report = buildReport(audit(DIRTY_HTML), { version: '0.1.0' });

    expect(report.meta.tool).toBe('A11y Lens');
    expect(report.meta.version).toBe('0.1.0');
    expect(report.meta.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(report.url).toBe(URL);
    expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
    expect(report.generatedAt).toBe(report.timestamp);
    expect(report.page.title).toBe('Page sale');
    expect(report.page.docLang).toBe('fr');
    expect(typeof report.score.score).toBe('number');
    expect(report.summary.totalIssues).toBeGreaterThan(0);
    expect(report.issues.length).toBe(report.summary.totalIssues);
    expect(report.rulesExecuted.length).toBe(BASE_RULES.length);
  });

  it('score cohérent avec le détail des issues (2 alt + 1 bouton critiques, landmarks manquant modéré)', () => {
    const report = buildReport(audit(DIRTY_HTML));
    // image-alt : 2 occ. × 4 = 8 ; button-name : 1 × 4 = 4 ;
    // landmarks (header + footer absents) : 2 occ. modérées × 1 = 2. Total = 14.
    expect(report.summary.occurrences.critical).toBe(3);
    expect(report.score.penalty).toBe(14);
    expect(report.score.score).toBe(86);
    expect(report.score.level).toBe('good');
  });

  it('page propre → score 100, cleanPage true, aucune issue', () => {
    const report = buildReport(audit(CLEAN_HTML));
    expect(report.cleanPage).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.score.score).toBe(100);
    expect(report.score.level).toBe('excellent');
    expect(report.rulesStats.failed).toBe(0);
  });

  it('règle désactivée apparaît comme skipped et n\u2019influence pas le score', () => {
    const doc = new DOMParser().parseFromString(DIRTY_HTML, 'text/html');
    const withRule = buildReport(runAudit(doc, URL, {}, BASE_RULES));
    const withoutRule = buildReport(
      runAudit(doc, URL, { disabledRules: ['image-alt'] as never }, BASE_RULES),
    );
    expect(withoutRule.rulesExecuted.find((r) => r.ruleId === 'image-alt')?.status).toBe(
      'skipped',
    );
    expect(withoutRule.rulesStats.skipped).toBe(1);
    expect(withoutRule.score.score).toBeGreaterThan(withRule.score.score);
  });

  it('rapport entièrement sérialisable (structuredClone) — contrainte MV3', () => {
    const report = buildReport(audit(DIRTY_HTML));
    expect(() => structuredClone(report)).not.toThrow();
  });

  it('export JSON : re-pritable puis validé par isA11yReport', () => {
    const report = buildReport(audit(DIRTY_HTML));
    const json = JSON.stringify(report, null, 2);
    const parsed = JSON.parse(json);
    expect(isA11yReport(parsed)).toBe(true);
    expect(parsed.score.score).toBe(report.score.score);
  });

  it('isA11yReport rejette les objets mal formés sans crasher', () => {
    expect(isA11yReport(null)).toBe(false);
    expect(isA11yReport({})).toBe(false);
    expect(isA11yReport({ meta: { tool: 'Autre' } })).toBe(false);
    expect(isA11yReport('coucou')).toBe(false);
  });

  it('exemple de forme JSON du rapport (documentation vivante)', () => {
    const report = buildReport(audit(DIRTY_HTML), { version: '0.1.0' });
    // Aperçu compact vérifiant la présence des clés contractuelles.
    const shape = {
      keys: Object.keys(report).sort(),
      issueKeys: Object.keys(report.issues[0]!).sort(),
    };
    expect(shape.keys).toEqual(
      [
        'cleanPage',
        'durationMs',
        'errors',
        'generatedAt',
        'issues',
        'meta',
        'page',
        'rulesExecuted',
        'rulesStats',
        'score',
        'summary',
        'timestamp',
        'url',
      ].sort(),
    );
    expect(shape.issueKeys).toEqual(
      [
        'category',
        'description',
        'elements',
        'helpUrl',
        'id',
        'occurrences',
        'recommendation',
        'ruleId',
        'severity',
        'title',
        'wcag',
      ].sort(),
    );
  });
});

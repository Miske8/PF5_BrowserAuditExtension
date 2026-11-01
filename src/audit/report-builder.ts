/**
 * Rapport final A11y Lens (Étape 8).
 *
 * Transforme la sortie brute du moteur (`RawAuditOutput`, Étape 5) en un
 * rapport complet, auto-descriptif et SÉRIALISABLE — c'est l'artefact qui
 * sera :
 *   - affiché dans la popup (Étapes 9-10),
 *   - exporté en JSON et CSV (Étape 11, services/exporter.ts),
 *   - persisté dans chrome.storage.local comme « dernier rapport ».
 *
 * Contenu imposé par le cahier des charges :
 *   url · timestamp · score · résumé par sévérité · liste des problèmes ·
 *   règles exécutées · métadonnées de page.
 *
 * Le rapport est volontairement PLAT et verbeux (auto-descriptif) : un JSON
 * exporté doit se lire sans avoir besoin de la doc de l'extension.
 */

import type { AuditIssue, PageMeta, Severity } from '../types';
import type { AuditErrorEntry, RawAuditOutput, RuleRunStatus } from './types';
import { buildAggregates, type AuditAggregates, type SeverityCounts } from './report';
import { computeScore, type ScoreResult } from './scoring';

/** Version du schéma du rapport — incrémentée si la forme évolue (migrations export). */
export const REPORT_SCHEMA_VERSION = '1.0';

/** Métadonnées d'exécution du rapport (traçabilité portfolio). */
export interface ReportMeta {
  /** Nom de l'outil. */
  tool: 'A11y Lens';
  /** Version de l'extension (injectée depuis package.json au build). */
  version: string;
  /** Version du schéma du rapport. */
  schemaVersion: string;
  /** Niveau WCAG utilisé pour les seuils de contraste (AA/AAA). */
  contrastLevel: 'AA' | 'AAA';
}

/** Une entrée « règle exécutée » du rapport (trace moteur enrichie). */
export interface ExecutedRule {
  ruleId: string;
  title: string;
  severity: Severity;
  status: RuleRunStatus;
  issueCount: number;
  reason?: string;
}

/** Résumé par sévérité — compteurs d'ISSUES et d'OCCURRENCES agrégées. */
export interface SeveritySummary {
  /** Nombre de cartes de problèmes (issues regroupées) par sévérité. */
  issues: SeverityCounts;
  /** Nombre total d'éléments touchés par sévérité. */
  occurrences: SeverityCounts;
  totalIssues: number;
  totalOccurrences: number;
}

/** Le rapport complet — contrat stable pour l'UI et les exports. */
export interface A11yReport {
  meta: ReportMeta;
  /** URL analysée (raccourci, identique à page.url). */
  url: string;
  /** Horodatage ISO de l'audit (raccourci, identique à generatedAt). */
  timestamp: string;
  /** Date de génération (ISO) — identique au timestamp moteur. */
  generatedAt: string;
  /** Durée d'exécution mesurée côté page (ms). */
  durationMs: number;
  /** Score global 0-100 + détail explicable. */
  score: ScoreResult;
  summary: SeveritySummary;
  /** Statistiques d'exécution des règles. */
  rulesStats: {
    total: number;
    executed: number;
    passed: number;
    failed: number;
    skipped: number;
    errored: number;
  };
  /** Liste complète des règles exécutées/ignorées avec leur statut. */
  rulesExecuted: ExecutedRule[];
  /** Problèmes détectés (triés par sévérité décroissante puis ruleId). */
  issues: AuditIssue[];
  /** Métadonnées de la page (titre réel, langue déclarée…). */
  page: PageMeta;
  /** Erreurs techniques rencontrées pendant l'audit (non bloquantes). */
  errors: AuditErrorEntry[];
  /** true si aucun problème détecté et qu'au moins une règle a tourné. */
  cleanPage: boolean;
}

/**
 * Enrichissement Étape 16 : marque les issues dont un même élément est aussi
 * signalé par une autre règle du moteur (ex: `<input type="image">` sans alt
 * relevé à la fois par `image-alt` et `button-name`). Une seule correction
 * résout alors plusieurs constats — l'UI peut le signaler.
 * La détection est sûre pour MV3 : comparaison de paires `[ruleId, selector]`,
 * uniquement sur les findings dotés d'un sélecteur.
 */
export function markOverlappingIssues(issues: readonly AuditIssue[]): AuditIssue[] {
  const seen = new Map<string, string>(); // clé `${selector}\u0000${ruleId}` → id d'issue
  const overlapping = new Set<string>(); // ids des issues en recoupement
  for (const issue of issues) {
    for (const finding of issue.elements) {
      if (!finding.selector) continue;
      const key = `${finding.selector}\u0000${issue.ruleId}`;
      const previous = seen.get(key);
      if (previous !== undefined && previous !== issue.id) {
        overlapping.add(previous);
        overlapping.add(issue.id);
      } else if (previous === undefined) {
        seen.set(key, issue.id);
      }
    }
  }
  if (overlapping.size === 0) return [...issues];
  return issues.map((issue) =>
    overlapping.has(issue.id) ? { ...issue, overlapsOtherRule: true } : issue,
  );
}

/** Construit le résumé par sévérité (issues + occurrences). */
export function summarizeBySeverity(issues: readonly AuditIssue[]): SeveritySummary {
  const empty = (): SeverityCounts => ({ critical: 0, major: 0, moderate: 0, minor: 0 });
  const summary: SeveritySummary = {
    issues: empty(),
    occurrences: empty(),
    totalIssues: issues.length,
    totalOccurrences: 0,
  };
  for (const issue of issues) {
    const occ = Math.max(1, issue.occurrences ?? issue.elements.length ?? 1);
    summary.issues[issue.severity] += 1;
    summary.occurrences[issue.severity] += occ;
    summary.totalOccurrences += occ;
  }
  return summary;
}

/** Convertit les traces moteur en liste `rulesExecuted` du rapport. */
export function toExecutedRules(output: RawAuditOutput): ExecutedRule[] {
  return output.traces.map((trace) => {
    const entry: ExecutedRule = {
      ruleId: trace.ruleId,
      title: trace.title,
      severity: trace.severity,
      status: trace.status,
      issueCount: trace.issueCount,
    };
    if (trace.reason !== undefined) entry.reason = trace.reason;
    return entry;
  });
}

/** Compte les statuts d'exécution des règles pour `rulesStats`. */
export function countRuleStatuses(
  traces: readonly ExecutedRule[],
): A11yReport['rulesStats'] {
  const stats = {
    total: traces.length,
    executed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errored: 0,
  };
  for (const trace of traces) {
    if (trace.status === 'skipped') stats.skipped += 1;
    else stats.executed += 1;
    switch (trace.status) {
      case 'pass':
        stats.passed += 1;
        break;
      case 'fail':
        stats.failed += 1;
        break;
      case 'error':
        stats.errored += 1;
        break;
      case 'skipped':
        break;
    }
  }
  return stats;
}

/** Options de construction du rapport (version injectée depuis le build). */
export interface BuildReportOptions {
  /** Version de l'extension (défaut : '0.0.0-dev'). */
  version?: string;
  /** Niveau de contraste utilisé (relu depuis les options résolues du run). */
  contrastLevel?: 'AA' | 'AAA';
}

/**
 * Construit le rapport final depuis la sortie du moteur.
 * Fonction pure et déterministe — tout est recalculé à partir de `output`.
 */
export function buildReport(
  output: RawAuditOutput,
  options: BuildReportOptions = {},
): A11yReport {
  const aggregates: AuditAggregates = buildAggregates(output);
  const score = computeScore(output.issues);
  const rulesExecuted = toExecutedRules(output);
  const issues = markOverlappingIssues(output.issues);

  return {
    meta: {
      tool: 'A11y Lens',
      version: options.version ?? '0.0.0-dev',
      schemaVersion: REPORT_SCHEMA_VERSION,
      contrastLevel: options.contrastLevel ?? 'AA',
    },
    url: output.page.url,
    timestamp: output.ranAt,
    generatedAt: output.ranAt,
    durationMs: output.durationMs,
    score,
    summary: summarizeBySeverity(issues),
    rulesStats: countRuleStatuses(rulesExecuted),
    rulesExecuted,
    issues,
    page: output.page,
    errors: output.errors,
    cleanPage: aggregates.cleanPage,
  };
}

/** Garde-fou typé : vérifie qu'un objet inconnu ressemble à un A11yReport v1. */
export function isA11yReport(value: unknown): value is A11yReport {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<A11yReport>;
  return (
    candidate.meta?.tool === 'A11y Lens' &&
    typeof candidate.url === 'string' &&
    typeof candidate.timestamp === 'string' &&
    typeof candidate.score?.score === 'number' &&
    Array.isArray(candidate.issues) &&
    Array.isArray(candidate.rulesExecuted)
  );
}

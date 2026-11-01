/**
 * Moteur d'audit principal (Étape 5).
 *
 * Point d'entrée unique de l'analyse d'un Document :
 *   runAudit(document, url, options) -> RawAuditOutput
 *
 * Responsabilités :
 *  - construire l'AuditContext partagé par toutes les règles ;
 *  - filtrer les règles désactivées (options.disabledRules) via le registre ;
 *  - déléguer l'exécution isolée à rule-runner (une règle qui plante ne
 *    fait jamais planter l'audit complet) ;
 *  - consolider : issues triées par sévérité décroissante puis ruleId,
 *    traces, erreurs, métadonnées page, horodatage et durée.
 *
 * Indépendant de l'UI et de chrome.* : la couche services/executor.ts
 * (Étape 9) se chargera de sérialiser ce résultat hors du contexte de la page.
 */

import type { AuditContext, AuditIssue, AuditOptions, PageMeta } from '../types';
import { DEFAULT_AUDIT_OPTIONS } from '../types';
import { getRules } from './registry';
import type { AuditRule } from '../rules/rule';
import { runRule, skippedTrace } from './rule-runner';
import type { AuditErrorEntry, RawAuditOutput, RuleRunTrace } from './types';
import { compareBySeverity } from '../core/severity';

/** Options partielles acceptées en entrée du moteur. */
export type RunAuditOptions = Partial<AuditOptions>;

/** Complète des options partielles avec les valeurs par défaut (robuste au clone). */
export function resolveOptions(options?: RunAuditOptions): AuditOptions {
  const resolved: AuditOptions = {
    contrastLevel: options?.contrastLevel ?? DEFAULT_AUDIT_OPTIONS.contrastLevel,
    disabledRules: Array.isArray(options?.disabledRules)
      ? [...options.disabledRules]
      : [],
  };
  // Option additionnelle (Étape 13) : seuil de confiance contraste, borné 0–1.
  if (typeof options?.minContrastConfidence === 'number') {
    resolved.minContrastConfidence = Math.min(
      1,
      Math.max(0, options.minContrastConfidence),
    );
  }
  return resolved;
}

/** Recueille les métadonnées de page (utilisées par le rapport et l'export). */
export function collectPageMeta(doc: Document, url: string): PageMeta {
  const title = (doc.title ?? '').trim();
  const lang = doc.documentElement?.getAttribute('lang') ?? null;
  const meta: PageMeta = { url, title, hasTitle: title !== '' };
  if (lang && lang.trim() !== '') meta.docLang = lang.trim();
  return meta;
}

/**
 * Tri consolidé des issues : sévérité décroissante, puis ruleId alphabétique,
 * puis id d'occurrence pour un ordre totalement déterministe.
 */
export function sortIssues(issues: AuditIssue[]): AuditIssue[] {
  return [...issues].sort((a, b) => {
    const bySeverity = compareBySeverity(a.severity, b.severity);
    if (bySeverity !== 0) return bySeverity;
    if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Vrai si le document semble exploitable (au moins une balise <html>). */
export function isDocumentAnalyzable(doc: Document | null | undefined): doc is Document {
  return doc != null && doc.documentElement != null;
}

/**
 * Exécute toutes les règles actives sur `doc`.
 * Ne lève pas : si le document est inexploitable, retourne une sortie vide
 * avec une erreur globale dans `errors` (l'UI gère le cas Étape 12).
 */
export function runAudit(
  doc: Document,
  url: string,
  options?: RunAuditOptions,
  rules: readonly AuditRule[] = getRules(),
): RawAuditOutput {
  const startedAt = performance.now();
  const resolved = resolveOptions(options);
  const disabled = new Set(resolved.disabledRules.map(String));

  const issues: AuditIssue[] = [];
  const traces: RuleRunTrace[] = [];
  const errors: AuditErrorEntry[] = [];

  const ctx: AuditContext = { document: doc, url, options: resolved };

  if (!isDocumentAnalyzable(doc)) {
    return {
      issues: [],
      page: { url, title: '', hasTitle: false },
      traces,
      errors: [{ ruleId: '*', message: 'Document absent ou non analysable.' }],
      ranAt: new Date().toISOString(),
      durationMs: roundDuration(performance.now() - startedAt),
    };
  }

  for (const rule of rules) {
    if (disabled.has(String(rule.id))) {
      traces.push(skippedTrace(rule, 'Règle désactivée dans les préférences.'));
      continue;
    }
    const outcome = runRule(rule, ctx);
    traces.push(outcome.trace);
    issues.push(...outcome.issues);
    if (outcome.error) errors.push(outcome.error);
  }

  return {
    issues: sortIssues(issues),
    page: collectPageMeta(doc, url),
    traces,
    errors,
    ranAt: new Date().toISOString(),
    durationMs: roundDuration(performance.now() - startedAt),
  };
}

/** Arrondi ms à 1 décimale — évite le bruit de horloge dans les rapports/tests. */
function roundDuration(ms: number): number {
  return Math.max(0, Math.round(ms * 10) / 10);
}

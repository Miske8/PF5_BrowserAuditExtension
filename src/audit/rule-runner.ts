/**
 * Exécuteur de règles (Étape 5).
 *
 * Responsabilité unique : faire tourner UNE règle dans un sandbox tolérant.
 *  - une exception levée par `evaluate` ne remonte jamais au moteur :
 *    elle devient une `RuleRunTrace` avec status 'error' + une `AuditErrorEntry` ;
 *  - la sortie est validée/normalisée (structure clonable, issues complétées
 *    via `normalizeIssue`, ids d'occurrence uniques).
 *
 * Le moteur (audit-engine.ts) orchestre ; ici on ne connaît ni le registre
 * ni les préférences utilisateur.
 */

import type { AuditContext, AuditIssue, RuleCategory, Severity } from '../types';
import type { AuditRule, RawIssue, RuleResult } from '../rules/rule';
import { normalizeIssue } from '../rules/rule';
import type { AuditErrorEntry, RuleRunStatus, RuleRunTrace } from './types';
import { isSeverity } from '../core/severity';

/** Résultat brut (non normalisé) attendu d'un `rule.evaluate`. */
type LooseRuleResult = Partial<RuleResult>;

/** Resultat d'une exécution isolée : traces + issues normalisées ou erreur. */
export interface RuleRunOutcome {
  trace: RuleRunTrace;
  /** Issues normalisées (vide si skipped/error/pass). */
  issues: AuditIssue[];
  /** Erreur technique associée (absente sinon). */
  error?: AuditErrorEntry;
}

/** Garde-fou : coerce une sortie inattendue en `{ passed, issues }` défensif. */
function coerceResult(raw: unknown): LooseRuleResult {
  if (raw === null || typeof raw !== 'object') {
    return { passed: true, issues: [] };
  }
  const candidate = raw as LooseRuleResult;
  if (!Array.isArray(candidate.issues)) {
    return { passed: candidate.passed === true, issues: [] };
  }
  return candidate;
}

/** Valide/sanifie une RawIssue lue depuis une règle potentiellement mal typée. */
function sanitizeRawIssue(value: unknown): RawIssue | null {
  if (value === null || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const out: RawIssue = {};
  if (typeof raw.title === 'string') out.title = raw.title;
  if (typeof raw.description === 'string') out.description = raw.description;
  if (typeof raw.recommendation === 'string') out.recommendation = raw.recommendation;
  if (typeof raw.impact === 'string') out.impact = raw.impact;
  if (typeof raw.wcag === 'string') out.wcag = raw.wcag;
  if (typeof raw.helpUrl === 'string') out.helpUrl = raw.helpUrl;
  if (isSeverity(raw.severity)) out.severity = raw.severity as Severity;
  if (typeof raw.category === 'string') out.category = raw.category as RuleCategory;
  if (typeof raw.occurrences === 'number' && Number.isFinite(raw.occurrences)) {
    out.occurrences = Math.max(0, Math.floor(raw.occurrences));
  }
  if (Array.isArray(raw.elements)) {
    out.elements = raw.elements
      .filter((el): el is AuditIssue['elements'][number] => el !== null && typeof el === 'object')
      .map(sanitizeElementFinding);
  }
  return out;
}

/** Sanitise un ElementFinding : ne conserve que des champs plats valides. */
function sanitizeElementFinding(
  value: AuditIssue['elements'][number],
): AuditIssue['elements'][number] {
  const el = value as Record<string, unknown>;
  const out: AuditIssue['elements'][number] = {};
  if (typeof el.selector === 'string') out.selector = el.selector;
  if (typeof el.tag === 'string') out.tag = el.tag;
  if (typeof el.snippet === 'string') out.snippet = el.snippet;
  if (typeof el.detail === 'string') out.detail = el.detail;
  if (typeof el.confidence === 'number' && Number.isFinite(el.confidence)) {
    out.confidence = Math.min(1, Math.max(0, el.confidence));
  }
  return out;
}

/**
 * Exécute une règle sur le contexte fourni.
 * Ne lève JAMAIS : toute anomalie est capturée dans le résultat.
 */
export function runRule(rule: AuditRule, ctx: AuditContext): RuleRunOutcome {
  const baseTrace = {
    ruleId: String(rule.id),
    title: rule.title,
    severity: rule.severity,
    category: rule.category,
  } satisfies Pick<RuleRunTrace, 'ruleId' | 'title' | 'severity' | 'category'>;

  let raw: unknown;
  try {
    raw = rule.evaluate(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      trace: { ...baseTrace, status: 'error', issueCount: 0 },
      issues: [],
      error: { ruleId: baseTrace.ruleId, message },
    };
  }

  const result = coerceResult(raw);
  const sanitized = (result.issues ?? [])
    .map(sanitizeRawIssue)
    .filter((issue): issue is RawIssue => issue !== null);

  // Cohérence : une règle qui déclare passed=true mais produit des issues
  // est traitée comme échouée (l'inverse — issues vides + passed=false —
  // reste un « fail » avec 0 occurrence, statut conservatif).
  let status: RuleRunStatus;
  if (sanitized.length > 0) status = 'fail';
  else status = result.passed === false ? 'fail' : 'pass';

  const issues = sanitized.map((issue, index) => normalizeIssue(rule, issue, index));

  return {
    trace: { ...baseTrace, status, issueCount: issues.length },
    issues,
  };
}

/** Trace « ignorée » pour une règle désactivée par l'utilisateur. */
export function skippedTrace(rule: AuditRule, reason: string): RuleRunTrace {
  return {
    ruleId: String(rule.id),
    title: rule.title,
    severity: rule.severity,
    category: rule.category,
    status: 'skipped',
    issueCount: 0,
    reason,
  };
}

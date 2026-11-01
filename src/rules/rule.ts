/**
 * Contrat commun des règles d'audit (Étape 4).
 *
 * Toute règle d'accessibilité implémente `AuditRule`. Le moteur d'audit
 * (Étape 5) ne connaît QUE ce contrat : il ignore tout détail interne des
 * règles, ce qui garantit l'extensibilité (ajouter une règle = un fichier +
 * une ligne dans le registre).
 *
 * Règles d'or pour écrire une règle :
 *  1. `evaluate` doit être une fonction PURE vis-à-vis du contexte fourni :
 *     elle ne lit que `ctx.document` / `ctx.options`, n'utilise aucune API
 *     chrome.* et ne mute rien. => testable avec happy-dom/jsdom.
 *  2. Elle ne lève JAMAIS sciemment d'exception : en cas de doute, renvoyer
 *     `{ passed: true, issues: [] }` (mieux vaut un faux négatif qu'un audit
 *     qui échoue). Le moteur encapsule aussi les throw éventuels.
 *  3. Tout ce qu'elle retourne doit être *structurally cloneable* (pas de
 *     noeud DOM dans les issues — uniquement des strings/numbers).
 *  4. Les champs textuels (title/description/recommendation…) peuvent être
 *     surchargés par occurrence via `RawIssue` ; sinon ceux de la règle
 *     servent de valeurs par défaut (fusion dans `normalizeIssue`).
 */

import type {
  AuditContext,
  AuditIssue,
  ElementFinding,
  RuleCategory,
  RuleId,
  Severity,
} from '../types';

/** Métadonnées obligatoires d'une règle (affichées/complétées par le moteur). */
export interface RuleMeta {
  /** Identifiant stable, unique, kebab-case (ex: "image-alt"). */
  id: RuleId | string;
  /** Libellé court affiché dans la popup (ex: "Images sans texte alternatif"). */
  title: string;
  /** Description du problème et de son impact (générique, surchargeable par issue). */
  description: string;
  /** Sévérité par défaut des issues produites. */
  severity: Severity;
  /** Famille de la règle (filtres UI, regroupement rapport). */
  category: RuleCategory;
  /** Référence WCAG (ex: "WCAG 1.1.1 (A)"). */
  wcag?: string;
  /** Lien d'aide externe (W3C/WAI, MDN…). Jamais requis pour exécuter la règle. */
  helpUrl?: string;
  /** Comment corriger — recommendation affichée si l'issue ne la fournit pas. */
  recommendation: string;
}

/** Issue « brute » retournée par une règle : le moteur normalise ensuite. */
export type RawIssue = Omit<Partial<AuditIssue>, 'ruleId' | 'id' | 'elements'> & {
  /** Éléments concernés (obligatoire si la règle trouve un souci localisé). */
  elements?: ElementFinding[];
  /**
   * Nombre d'éléments/occurrences agrégés sous cette issue.
   * Si absent, le moteur (normalizeIssue) dérive la valeur : nombre
   * d'`elements`, sinon 1 pour une absence globale (ex: `<html lang>`).
   * Le score (Étape 8) pondère chaque occurrence, pas l'issue affichée.
   */
  occurrences?: number;
};

/** Résultat d'une évaluation de règle (avant consolidation moteur). */
export interface RuleResult {
  /** true si aucun problème détecté. */
  passed: boolean;
  /** Problèmes détectés (peuvent contenir des champs manquants : le moteur complète). */
  issues: RawIssue[];
}

/** Fonction d'évaluation d'une règle. Doit rester synchrone et pure. */
export type RuleEvaluate = (ctx: AuditContext) => RuleResult;

/** Contrat complet d'une règle d'audit. */
export interface AuditRule extends RuleMeta {
  /** Version sémantique de la logique de la règle (traçabilité dans les rapports). */
  version: string;
  /** Exécute la détection sur le document fourni. */
  evaluate: RuleEvaluate;
}

/** Fabrique typée : crée une règle avec inférence + contrôle d'excès de propriétés. */
export function defineRule(rule: AuditRule): AuditRule {
  return rule;
}

/** Clé unique d'une occurrence au sein d'une règle (utilisée par normalizeIssue). */
export function makeIssueId(ruleId: string, index: number): string {
  return `${ruleId}:${index}`;
}

/**
 * Normalise une RawIssue en AuditIssue complète en fusionnant les métadonnées
 * de la règle (les valeurs propres à l'issue priment sur celles de la règle).
 * Utilisé par le moteur (Étape 5), testable unitairement indépendamment.
 */
export function normalizeIssue(rule: RuleMeta, raw: RawIssue, index: number): AuditIssue {
  const base: AuditIssue = {
    ruleId: rule.id,
    id: makeIssueId(rule.id, index),
    title: rule.title,
    description: rule.description,
    recommendation: rule.recommendation,
    severity: rule.severity,
    category: rule.category,
    elements: raw.elements ?? [],
  };
  // Occurrences agrégées : surcharge explicite de la règle sinon nb d'éléments,
  // plancher à 1 (une issue = au moins un problème) — le score (Étape 8)
  // pondère chaque occurrence, pas l'issue affichée.
  base.occurrences = Math.max(
    1,
    typeof raw.occurrences === 'number' ? raw.occurrences : base.elements.length,
  );
  if (raw.wcag !== undefined) base.wcag = raw.wcag;
  else if (rule.wcag !== undefined) base.wcag = rule.wcag;
  if (raw.helpUrl !== undefined) base.helpUrl = raw.helpUrl;
  else if (rule.helpUrl !== undefined) base.helpUrl = rule.helpUrl;
  if (raw.impact !== undefined) base.impact = raw.impact;
  if (raw.title !== undefined && raw.title !== '') base.title = raw.title;
  if (raw.description !== undefined && raw.description !== '') {
    base.description = raw.description;
  }
  if (raw.recommendation !== undefined && raw.recommendation !== '') {
    base.recommendation = raw.recommendation;
  }
  if (raw.severity !== undefined) base.severity = raw.severity;
  if (raw.category !== undefined) base.category = raw.category;
  return base;
}

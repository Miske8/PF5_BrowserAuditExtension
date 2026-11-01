/**
 * Types partagés A11y Lens.
 *
 * Ces types sont le vocabulaire commun entre :
 *  - le moteur d'audit (exécuté dans le contexte de la page via chrome.scripting),
 *  - la génération du rapport (core/report, Étape 8),
 *  - l'UI popup (Étapes 9-10),
 *  - les services d'export JSON/CSV (Étape 11).
 *
 * CONTRAINTE MV3 : tout ce qui transite par chrome.scripting.executeScript
 * ou chrome.storage doit être *structurally cloneable* (pas de références DOM,
 * pas de fonctions, pas de classes). Tous les types ci-dessous sont donc des
 * plain-data (string / number / boolean / tableaux / objets simples).
 */

/** Sévérités WCAG alignées sur axe-core, étendues à 4 niveaux (cahier MVP). */
export type Severity = 'critical' | 'major' | 'moderate' | 'minor';

/** Familles de problèmes — permet regroupement et filtres dans l'UI. */
export type RuleCategory =
  | 'images'
  | 'forms'
  | 'links'
  | 'headings'
  | 'document'
  | 'keyboard'
  | 'aria'
  | 'structure'
  | 'color';

/** Identifiants canoniques des règles MVP (Étapes 6-7). */
export type RuleId =
  | 'image-alt'
  | 'button-name'
  | 'link-name'
  | 'label'
  | 'form-field-name'
  | 'heading-order'
  | 'html-lang'
  | 'page-title'
  | 'tabindex-positive'
  | 'aria-hidden-focusable'
  | 'duplicate-id'
  | 'landmarks'
  | 'color-contrast';

/** Description fine d'un élément concerné — sérialisable, destinée à l'affichage. */
export interface ElementFinding {
  /**
   * Sélecteur CSS heuristique pour retrouver l'élément (nth-child based).
   * Optionnel : certaines règles (ids dupliqués, landmarks) rapportent sur
   * plusieurs éléments ou sur le document entier.
   */
  selector?: string;
  /** Nom de balise en minuscules (ex: "img"). */
  tag?: string;
  /** Extrait HTML borné de l'élément (déjà tronqué + échappé côté règle). */
  snippet?: string;
  /** Message propre à cet élément (ex: "alt manquant", "contraste 2.1:1 < 4.5:1"). */
  detail?: string;
  /**
   * Niveau de confiance du diagnostic, entre 0 et 1 (défaut : 1 = certain).
   * Utilisé par la règle de contraste (Étape 7) : le fond est reconstruit
   * approximativement (parents opaques + aplatissement sur blanc), donc un
   * échec signalé avec confiance faible doit être affiché comme « à vérifier ».
   */
  confidence?: number;
}

/** Un problème détecté par une règle : ce que consomme directement l'UI. */
export interface AuditIssue {
  /** Id stable de la règle (ex: "image-alt"). */
  ruleId: RuleId | string;
  /** Id unique de l'occurrence : `${ruleId}:${index}` si la règle ne le fournit pas. */
  id: string;
  /** Libellé court affiché en en-tête de carte (défaut : title de la règle). */
  title: string;
  /** Explication du problème et de son impact utilisateur. */
  description: string;
  /** Impact utilisateur ("Un lecteur d'écran ne peut pas…"). */
  impact?: string;
  /** Comment corriger (recommandation affichée dans la popup). */
  recommendation: string;
  severity: Severity;
  category: RuleCategory;
  /** Référence WCAG (ex: "WCAG 1.1.1 (A)"). */
  wcag?: string;
  /** Lien d'aide externe (optionnel, jamais requis). */
  helpUrl?: string;
  /** Éléments concernés (peut être vide pour une absence globale, ex: <html lang>). */
  elements: ElementFinding[];
}

/** Métadonnées de la page auditées — utiles au rapport et à l'export. */
export interface PageMeta {
  url: string;
  title: string;
  /** true si le document n'a aucun titre (<title> absent ou vide). */
  hasTitle: boolean;
  /** Langue déclarée sur <html lang>, sinon undefined. */
  docLang?: string;
}

/** Contexte transmis à chaque règle par le moteur d'audit (Étape 5). */
export interface AuditContext {
  /** Document de la page active (réel, dans le contexte d'injection). */
  document: Document;
  /** URL de la page (pour logs/débogage). */
  url: string;
  /** Options réglables depuis la popup/options (Étapes 13/16). */
  options: AuditOptions;
}

/** Préférences utilisateur persistées via chrome.storage (Étape 13). */
export interface AuditOptions {
  /** Niveau WCAG ciblé pour la règle de contraste : AA (4.5:1 / 3:1) ou AAA (7:1 / 4.5:1). */
  contrastLevel: 'AA' | 'AAA';
  /** Règles désactivées par l'utilisateur (id de règle). */
  disabledRules: RuleId[];
}

export const DEFAULT_AUDIT_OPTIONS: AuditOptions = {
  contrastLevel: 'AA',
  disabledRules: [],
};

/** Résultat brut retourné par une règle au moteur (Étape 5 le consolide). */
export interface RuleOutcome {
  passed: boolean;
  issues: AuditIssue[];
}

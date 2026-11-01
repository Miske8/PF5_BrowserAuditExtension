/**
 * Contrat de communication popup ↔ script injecté pour le surlignage
 * des éléments problématiques dans la page analysée.
 *
 * Ces types sont plain-data (structurally cloneable) : ils transitent par
 * `chrome.scripting.executeScript({ func, args })` et le résultat JSON de
 * `InjectionResult`, jamais par un message runtime persistant.
 *
 * Cycle de vie demandé :
 *  - scrollIntoView + contour visible ;
 *  - retrait automatique après `durationMs` ;
 *  - aucune modification durable du DOM (attribut data + classe uniquement,
 *    retirés à la fin ; aucun élément créé ni supprimé).
 */

import type { Severity } from '../types';

/** Sélecteur d'un élément à surligner, avec le frame où il a été trouvé. */
export interface HighlightTarget {
  /** Sélecteur CSS heuristique produit par les règles (`cssPath`). */
  selector: string;
  /** Classe de sévérité appliquée au contour (couche couleur du halo). */
  severityClass: Severity;
  /**
   * Frame d'origine de l'élément lors de l'audit.
   * Le surlignage n'est appliqué que si ce frameId correspond au contexte
   * d'exécution courant — sinon on sort sans rien faire (jamais de mauvais
   * ciblage dans un autre frame).
   */
  frameId?: number;
}

/** Requête envoyée à la fonction injectée (via `args`). */
export interface HighlightRequest {
  /** Cible unique ou multiple (une issue peut regrouper plusieurs éléments). */
  targets: HighlightTarget[];
  /** Durée du surlignage en ms avant retrait automatique. */
  durationMs: number;
  /** true = retire immédiatement tout surlignage actif (et n'en pose aucun). */
  clear?: boolean;
}

/** Statut agrégé retourné par la fonction injectée. */
export type HighlightStatus = 'highlighted' | 'not-found' | 'ignored-frame' | 'cleared';

/** Résultat sérialisable renvoyé au contexte popup. */
export interface HighlightResult {
  status: HighlightStatus;
  /** Nombre de cibles effectivement trouvées et surlignées. */
  found: number;
  /** Nombre total de cibles reçues. */
  requested: number;
}

/** Durée par défaut d'affichage du contour (ms). */
export const DEFAULT_HIGHLIGHT_DURATION_MS = 4000;

/** Préfixe unique de nos attributs data — évite toute collision avec la page. */
export const HIGHLIGHT_ATTR_PREFIX = 'data-a11y-lens';

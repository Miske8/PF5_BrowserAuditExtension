/**
 * Adaptateur axe-core (intégration optionnelle — moteur complémentaire).
 *
 * A11y Lens garde son moteur maison comme socle ; axe-core peut être activé
 * en complément pour élargir la couverture WCAG. Cette page décrit la
 * stratégie retenue et ses limites :
 *
 * 1. MODE « COMPLÉMENT » (par défaut, `overlapMode: 'complement'`) :
 *    les violations axe dont la règle est équivalente à une règle maison déjà
 *    exécutée sont DROPPED (la carte maison prime : libellés FR, sévérités
 *    calibrées, surlignage). Les autres violations deviennent des issues
 *    additionnelles préfixées `axe:` — typiquement aria-allowed-attr,
 *    aria-valid-attr-value, role-supports-aria-attr, html-has-lang (lang
 *    invalide), region, scrollable-region-focusable…
 *
 * 2. MODE « FUSION » (`overlapMode: 'merge'`) : sur élément commun
 *    (sélecteur + frame identiques), l'issue maison ET l'issue axe sont
 *    conservées mais reliées par `relatedRuleIds` — l'UI signale qu'une seule
 *    correction peut résoudre plusieurs constats. Sans élément commun, les
 *    issues restent séparées (pas de fausse fusion sémantique).
 *
 * 3. RÈGLES EN CONFLIT TECHNIQUE : `color-contrast`. La règle maison calcule
 *    le contraste sans dépendance réseau ; axe-core charge en plus des polices
 *    distantes (préchargement d'assets) → désactivée par défaut dans le run
 *    axe (AXE_DISABLED_RULES). Elle reste couverte par la règle maison.
 *
 * LIMITES connues (voulues, tolérantes) :
 *  - pas de mapping check-id fin : si une violation axe ne porte AUCUN
 *    sélecteur exploitable, on ne peut prouver aucun recoupement → elle est
 *    traitée comme additionnelle (risque résiduel de doublon affiché, jamais
 *    de faux négatif silencieux) ;
 *  - le sélecteur axe est relatif à son propre document (frame) ; il n'est
 *    comparable à un sélecteur maison que si les deux findings portent le
 *    même `frameId` (défaut : frame principal 0) ;
 *  - axe tourne uniquement dans le frame principal (allFrames:false) : les
 *    iframes cross-origin ne sont pas couvertes par le complément.
 */

import type { AuditIssue, ElementFinding, RuleCategory, Severity } from '../../types';
import type { AuditRule, RawIssue, RuleResult } from '../../rule';
import { defineRule } from '../../rule';
import { cssPath, truncate } from '../../utils/dom';

/* ------------------------------------------------------------------ *
 * Types structurels minimalistes pour les résultats d'axe-core.
 * On évite d'importer toute l'API `axe-core` dans le graphe de types du
 * moteur : ces formes décrivent stricto sensu ce qui est consommé ici et
 * restent compatibles avec `axe.AxeResults` (structurellement typé).
 * ------------------------------------------------------------------ */

/** Sélecteur multi-couches renvoyé par axe (`target` d'un node result). */
export type AxeTarget = readonly (string | readonly string[])[];

/** Résultat d'un check (any/all/none) — seuls id + message sont lus. */
export interface AxeCheckResult {
  id?: string;
  message?: string;
}

/** Noeud enfreignant une règle axe. */
export interface AxeNodeResult {
  html?: string;
  impact?: string | null;
  target?: AxeTarget;
  any?: AxeCheckResult[];
  all?: AxeCheckResult[];
  none?: AxeCheckResult[];
}

/** Violation d'une règle axe. */
export interface AxeViolationLike {
  id: string;
  help?: string;
  description?: string;
  helpUrl?: string;
  impact?: string | null;
  tags?: readonly string[];
  nodes?: readonly AxeNodeResult[];
}

/** Sous-ensemble d'`axe.AxeResults` consommé par l'adaptateur. */
export interface AxeResultsLike {
  violations?: readonly AxeViolationLike[];
}

/* ------------------------------------------------------------------ *
 * Correspondances règles maison ↔ règles axe
 * ------------------------------------------------------------------ */

/** Ids des règles axe équivalentes aux 12 règles maison (doublons structurels). */
export const AXE_OVERLAPPING_RULE_IDS: readonly string[] = [
  'image-alt',
  'button-name',
  'link-name',
  'label',
  'form-field-name', // axe : label (volet aria-label/labelledby)
  'heading-order',
  'html-lang', // axe : html-has-lang + valid-lang
  'page-title', // axe : document-title
  'tabindex-positive', // axe : tabindex
  'aria-hidden-focusable', // axe : aria-hidden-focus
  'duplicate-id', // axe : duplicate-id (aria + generic)
  'landmarks', // axe : landmark-* + region
];

/** Préfixe appliqué aux ids de règles issues d'axe-core (`axe:<id>`). */
export const AXE_RULE_PREFIX = 'axe:';

/** Ensemble des ids axe équivalents aux règles maison (lookup O(1)). */
const OVERLAP_SET = new Set<string>(AXE_OVERLAPPING_RULE_IDS);

/** Règles axe désactivées par défaut, indépendamment des règles maison. */
const BASE_AXE_DISABLED: readonly string[] = [
  // Contraste : géré par la règle maison (sans préchargement de polices ni
  // dépendance réseau — voir en-tête de fichier).
  'color-contrast',
];

/**
 * Règles axe volontairement désactivées par défaut (conflit technique ou
 * bruit). Les règles maison équivalentes sont passées ici pour que le run
 * axe ne produise AUCUNE violation doublon : la fusion avec les issues
 * maison (`mergeIssues`) reste disponible mais devient rare en pratique.
 * `color-contrast` est désactivée car la règle maison calcule le contraste
 * sans dépendance réseau, alors qu'axe précharge des polices distantes.
 */
export function defaultAxeDisabledRules(mineRuleIds: readonly string[]): string[] {
  const disabled = new Set<string>(BASE_AXE_DISABLED);
  for (const id of mineRuleIds) {
    if (OVERLAP_SET.has(id)) disabled.add(id);
  }
  return [...disabled];
}

/** Vrai si une violation axe correspond à une règle maison existante. */
export function isOverlappingAxeRule(ruleId: string): boolean {
  return OVERLAP_SET.has(ruleId.replace(AXE_RULE_PREFIX, ''));
}

/** Clé d'un finding partagée entre moteur maison et adaptateur axe. */
function findingKey(finding: ElementFinding): string {
  return `${finding.frameId ?? 0}\u0000${finding.selector ?? ''}`;
}

/** Vrai si deux findings désignent manifestement le même élément. */
export function sameFinding(a: ElementFinding, b: ElementFinding): boolean {
  if (!a.selector || !b.selector) return false;
  return findingKey(a) === findingKey(b);
}

/**
 * Fusionne deux listes d'issues selon le mode choisi (fonction pure,
 * testable sans DOM). Voir stratégie détaillée en en-tête de fichier.
 */
export function mergeIssues(
  mine: readonly AuditIssue[],
  theirs: readonly AuditIssue[],
  mode: 'complement' | 'merge',
): AuditIssue[] {
  if (mode !== 'complement') {
    // Mode fusion : relier les issues qui partagent au moins un élément.
    const byElement = new Map<string, AuditIssue[]>();
    for (const issue of mine) {
      for (const element of issue.elements) {
        if (!element.selector) continue;
        const key = findingKey(element);
        const bucket = byElement.get(key);
        if (bucket) bucket.push(issue);
        else byElement.set(key, [issue]);
      }
    }
    const linked = theirs.map((issue) => {
      const related = new Set<string>();
      for (const element of issue.elements) {
        if (!element.selector) continue;
        for (const other of byElement.get(findingKey(element)) ?? []) {
          if (other.ruleId !== issue.ruleId) related.add(String(other.ruleId));
        }
      }
      if (related.size === 0) return issue;
      const previous = issue.relatedRuleIds ?? [];
      return {
        ...issue,
        relatedRuleIds: [...new Set([...previous, ...related])].sort(),
        overlapsOtherRule: true,
      };
    });
    return [...mine, ...linked];
  }

  // Mode complément : drop les issues axe dont UN élément coïncide avec un
  // élément d'une issue maison (règle équivalente déjà signalée ailleurs).
  const mineKeys = new Set<string>();
  for (const issue of mine) {
    for (const element of issue.elements) {
      if (element.selector) mineKeys.add(findingKey(element));
    }
  }
  const kept = theirs.filter(
    (issue) => !issue.elements.some((el) => el.selector && mineKeys.has(findingKey(el))),
  );
  return [...mine, ...kept];
}

/* ------------------------------------------------------------------ *
 * Conversion axe → contrat A11y Lens
 * ------------------------------------------------------------------ */

/** Traduit une `impact` axe en sévérité A11y Lens (mapping documenté). */
export function mapAxeImpact(impact: string | null | undefined): Severity {
  switch (impact) {
    case 'critical':
      return 'critical';
    case 'serious':
      return 'major';
    case 'moderate':
      return 'moderate';
    default:
      return 'minor'; // 'minor', null, inconnu → mineur (conservatif)
  }
}

/** Extrait le numéro de critère WCAG des tags axe (wcag111 → « 1.1.1 »). */
export function wcagCriterionFromTags(tags: readonly string[] | undefined): string | undefined {
  for (const tag of tags ?? []) {
    const match = /^wcag(\d)(\d)(\d+)$/.exec(tag);
    if (match) return `${match[1]}.${match[2]}.${match[3]}`;
  }
  return undefined;
}

/** Niveau de conformité (A/AA/AAA) lu dans les tags axe. */
export function wcagLevelFromTags(tags: readonly string[] | undefined): string | undefined {
  if ((tags ?? []).includes('wcagaaa')) return 'AAA';
  if ((tags ?? []).includes('wcagaa')) return 'AA';
  if ((tags ?? []).includes('wcaga')) return 'A';
  return undefined;
}

/** Références WCAG formatées façon moteur maison (« WCAG 1.1.1 (A) »). */
export function axeWcagRef(tags: readonly string[] | undefined): string | undefined {
  const criterion = wcagCriterionFromTags(tags);
  if (!criterion) return undefined;
  const level = wcagLevelFromTags(tags);
  return level ? `WCAG ${criterion} (${level})` : `WCAG ${criterion}`;
}

/** Famille de règles maison correspondant à une catégorie de règles axe. */
export function axeCategoryFor(ruleId: string, tags: readonly string[] | undefined): RuleCategory {
  const list = tags ?? [];
  if (list.includes('cat.color')) return 'color';
  if (list.includes('cat.keyboard')) return 'keyboard';
  if (list.includes('cat.aria') || ruleId.startsWith('aria-')) return 'aria';
  if (list.includes('cat.forms')) return 'forms';
  if (list.includes('cat.struct') || list.includes('cat.semantics')) return 'structure';
  if (list.includes('cat.time-and-media')) return 'images';
  if (list.includes('cat.parsing')) return 'document';
  return 'structure';
}

/**
 * Convertit le chemin `target` d'un noeud axe en sélecteur exploitable par
 * le service de surlignage (qui requiert un CSS unique par frame) :
 *  - cible simple → normalisation via `cssPath` depuis le document fourni ;
 *  - cible multi-niveaux (iframe) → non localisable côté popup principale :
 *    le détail porte alors uniquement l'extrait HTML.
 */
export function resolveAxeSelector(target: AxeTarget | undefined, doc: Document): string | undefined {
  if (!target || target.length === 0) return undefined;
  if (target.length > 1) return undefined; // noeud dans une iframe : on renonce au sélecteur
  const layer = target[0];
  if (layer == null) return undefined;
  const parts = Array.isArray(layer) ? layer : [layer];
  if (parts.length === 0 || parts.some((part) => typeof part !== 'string' || part === '')) {
    return undefined;
  }
  const joined = parts.join(' ');
  let el: Element | null = null;
  try {
    el = doc.querySelector(joined);
  } catch {
    return undefined; // sélecteur non standard (shadow DOM…) : snippet seul
  }
  if (!el) return joined; // introuvable (DOM muté) : on garde la trace brute
  return cssPath(el);
}

/** Construit le détail d'un finding axe (checks échoués + extrait tronqué). */
function axeFindingDetail(node: AxeNodeResult): string | undefined {
  const checks = [...(node.any ?? []), ...(node.all ?? []), ...(node.none ?? [])]
    .map((check) => check.message?.trim())
    .filter((message): message is string => Boolean(message));
  const base = checks.length > 0 ? checks.join(' · ') : undefined;
  return base ? truncate(base, 160) : undefined;
}

/** Convertit UNE violation axe en `RawIssue` du contrat maison. */
export function axeViolationToRawIssue(violation: AxeViolationLike, doc: Document): RawIssue {
  const severity = mapAxeImpact(violation.impact);
  const elements: ElementFinding[] = (violation.nodes ?? []).map((node) => {
    const finding: ElementFinding = {};
    const selector = resolveAxeSelector(node.target, doc);
    if (selector) finding.selector = selector;
    if (typeof node.html === 'string' && node.html !== '') {
      finding.snippet = truncate(node.html.trim(), 120);
    }
    const detail = axeFindingDetail(node);
    if (detail) finding.detail = detail;
    return finding;
  });

  const raw: RawIssue = {
    ruleId: `axe:${violation.id}`,
    severity,
    category: axeCategoryFor(violation.id, violation.tags),
    occurrences: Math.max(1, elements.length),
    elements,
  };
  if (violation.help) raw.title = violation.help;
  if (violation.description) raw.description = violation.description;
  if (violation.helpUrl) raw.helpUrl = violation.helpUrl;
  const wcag = axeWcagRef(violation.tags);
  if (wcag) raw.wcag = wcag;
  raw.recommendation = `Corriger selon la documentation axe-core : « ${
    violation.help ?? violation.id
  } ». ${violation.description ?? ''}`.trim();
  return raw;
}

/** Convertit toutes les violations axe en RawIssue (filtre les vides). */
export function convertAxeViolations(violations: readonly AxeViolationLike[], doc: Document): RawIssue[] {
  return violations.map((violation) => axeViolationToRawIssue(violation, doc));
}

/* ------------------------------------------------------------------ *
 * Wrapper AuditRule — axe injecté en paramètre (aucun import statique)
 * ------------------------------------------------------------------ */

/** Signature minimale de `axe.run(context?, options?)` utilisée ici. */
export type AxeRunFn = (context?: unknown, options?: Record<string, unknown>) => Promise<unknown>;

/** Options de construction de la règle wrapper. */
export interface CreateAxeRuleOptions {
  /** Fonction `axe.run` récupérée depuis le monde MAIN de la page. */
  run: AxeRunFn;
  /** Timeout global du run axe en ms (défaut : 8000). */
  timeoutMs?: number;
  /** Restreint l'analyse à un conteneur (ex: '#main'). */
  include?: string;
  /** Tags axe additionnels à activer (runOnly « wcag2a » + …). */
  additionalTags?: readonly string[];
}

/** Durée maximale d'un run axe avant abandon (anti-gel de la page). */
export const DEFAULT_AXE_TIMEOUT_MS = 8000;

/** Métadonnées optionnelles transmises au wrapper axe (préférences Étape 13+). */
export type AxeRuleExtras = Pick<CreateAxeRuleOptions, 'timeoutMs' | 'include'>;

/**
 * Fabrique la règle « axe-core » conforme au contrat maison.
 * Le moteur appelle `evaluate(ctx)` comme pour n'importe quelle règle ;
 * l'évaluation est asynchrone (le runner attend la promesse — rule-runner).
 * Les réglages fins (timeout, conteneur) sont lus depuis
 * `ctx.options.axeCore` si présents, sinon depuis `extras`, sinon défauts.
 */
export function createAxeCoreRule(options: CreateAxeRuleOptions): AuditRule {
  return defineRule({
    id: 'axe-core',
    title: 'Analyse complémentaire axe-core',
    description:
      'Règles WCAG additionnelles détectées par le moteur axe-core (attributs ARIA invalides, rôles, regions, focus clavier…). Les doublons avec les règles A11y Lens sont filtrés.',
    severity: 'major',
    category: 'structure',
    version: '0.1.0',
    recommendation:
      'Suivre la recommandation de chaque problème et consulter la documentation axe-core liée.',
    helpUrl: 'https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md',

    evaluate: async (ctx) => {
      const extras = ctx.options.axeCore;
      const timeoutMs = Math.max(
        1000,
        extras?.timeoutMs ?? options.timeoutMs ?? DEFAULT_AXE_TIMEOUT_MS,
      );
      const include = extras?.include ?? options.include;

      const context = include ? { include: [include] } : undefined;
      const runOptions: Record<string, unknown> = {
        resultTypes: ['violations'],
        iframes: false,
        elementRef: false,
        selectors: true,
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', ...(options.additionalTags ?? [])],
        },
        rules: Object.fromEntries(AXE_DISABLED_RULES.map((id) => [id, { enabled: false }])),
      };

      let results: AxeResultsLike | null = null;
      try {
        results = await withTimeout(
          Promise.resolve(options.run(context, runOptions)) as Promise<AxeResultsLike>,
          timeoutMs,
        );
      } catch {
        results = null; // axe indisponible (CSP stricte…) → audit maison intact
      }
      const violations = Array.isArray(results?.violations) ? results.violations : [];
      if (violations.length === 0) {
        return { passed: true, issues: [] } satisfies RuleResult;
      }

      // La fusion avec les issues maison intervient APRÈS normalisation
      // moteur : le moteur appelle `finalizeAxeOutcome` (voir audit-engine).
      const axeIssues = convertAxeViolations(violations, ctx.document);
      return { passed: false, issues: axeIssues } satisfies RuleResult;
    },
  });
}

/** Applique la stratégie de fusion aux issues normalisées (moteur post-run). */
export function finalizeAxeOutcome(
  mine: readonly AuditIssue[],
  axe: readonly AuditIssue[],
  mode: 'complement' | 'merge',
): AuditIssue[] {
  return mergeIssues(mine, axe, mode);
}

/** Race entre une promesse et un timeout — null si expiré (tolérant). */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null; // axe échoue (CSP stricte, frame protégé) → audit maison intact
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

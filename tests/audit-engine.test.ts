/**
 * Tests du moteur d'audit (Étape 5) — happy-dom.
 *
 * Le registre officiel étant vide jusqu'à l'Étape 6, on injecte des règles
 * de démonstration pour valider : exécution, tri par sévérité, normalisation,
 * désactivation de règles, isolation des erreurs, métadonnées/durée,
 * agrégats de rapport et clonabilité MV3 (structuredClone).
 */

import { describe, expect, it } from 'vitest';
import type { AuditOptions } from '../src/types';
import type { AuditRule } from '../src/rules/rule';
import { defineRule } from '../src/rules/rule';
import {
  runAudit,
  resolveOptions,
  sortIssues,
  collectPageMeta,
} from '../src/audit/audit-engine';
import { buildAggregates, countBySeverity, formatDuration } from '../src/audit/report';
import type { RawAuditOutput } from '../src/audit/types';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Construit un Document complet via DOMParser (happy-dom global). */
function makeDoc(bodyHtml: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(
    `<!DOCTYPE html><html lang="fr"><head><title>Test</title></head><body>${bodyHtml}</body></html>`,
    'text/html',
  );
}

/** Règle qui signale tout <img> sans attribut alt. */
const imgNoAltRule: AuditRule = defineRule({
  id: 'demo-img-alt',
  title: 'Images sans alt',
  description: 'Certaines images n’ont pas d’alternative textuelle.',
  recommendation: 'Ajouter un attribut alt.',
  severity: 'critical',
  category: 'images',
  wcag: 'WCAG 1.1.1 (A)',
  version: '1.0.0',
  evaluate: (ctx) => {
    const images = Array.from(ctx.document.querySelectorAll('img:not([alt])'));
    if (images.length === 0) return { passed: true, issues: [] };
    return {
      passed: false,
      issues: [
        {
          elements: images.map((el) => ({ tag: 'img', snippet: el.outerHTML })),
        },
      ],
    };
  },
});

/** Règle qui signale tout <a> vide — sévérité majeure, issue customisée. */
const emptyLinkRule: AuditRule = defineRule({
  id: 'demo-empty-link',
  title: 'Liens sans nom accessible',
  description: 'Des liens n’ont aucun texte.',
  recommendation: 'Donner un intitulé au lien.',
  severity: 'major',
  category: 'links',
  version: '1.0.0',
  evaluate: (ctx) => {
    const links = Array.from(ctx.document.querySelectorAll('a')).filter(
      (a) => (a.textContent ?? '').trim() === '' && !a.hasAttribute('aria-label'),
    );
    if (links.length === 0) return { passed: true, issues: [] };
    return {
      passed: false,
      issues: [{ impact: 'Un lecteur d’écran annonce « lien » sans destination.' }],
    };
  },
});

/** Règle factice toujours OK. */
const alwaysPassRule: AuditRule = defineRule({
  id: 'demo-pass',
  title: 'Règle qui passe',
  description: '—',
  recommendation: '—',
  severity: 'minor',
  category: 'document',
  version: '1.0.0',
  evaluate: () => ({ passed: true, issues: [] }),
});

/** Règle qui lève systématiquement. */
const throwingRule: AuditRule = defineRule({
  id: 'demo-throw',
  title: 'Règle qui plante',
  description: '—',
  recommendation: '—',
  severity: 'moderate',
  category: 'aria',
  version: '1.0.0',
  evaluate: () => {
    throw new Error('boom');
  },
});

/** Règle qui retourne une sortie invalide (ni objet, ni tableau). */
const garbageRule: AuditRule = defineRule({
  id: 'demo-garbage',
  title: 'Règle qui renvoie du bruit',
  description: '—',
  recommendation: '—',
  severity: 'minor',
  category: 'structure',
  version: '1.0.0',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cas de test volontaire
  evaluate: (): any => ({
    passed: false,
    issues: ['pas-un-objet', null, { severity: 'inexistante' }],
  }),
});

const DEMO_RULES: AuditRule[] = [imgNoAltRule, emptyLinkRule, alwaysPassRule];

/* ------------------------------------------------------------------ */
/* Exécution du moteur                                                 */
/* ------------------------------------------------------------------ */

describe('runAudit — exécution et consolidation', () => {
  it('retourne une sortie vide exploitable quand aucune règle n’est injectée', () => {
    const doc = makeDoc('<body><p>ok</p></body>');
    // registre officiel non vide depuis l'Étape 6 : on force la liste à []
    const output = runAudit(doc, 'https://example.com', undefined, []);
    expect(output.issues).toEqual([]);
    expect(output.traces).toEqual([]);
    expect(output.errors).toEqual([]);
    expect(output.durationMs).toBeGreaterThanOrEqual(0);
    expect(new Date(output.ranAt).toString()).not.toBe('Invalid Date');
  });

  it('collecte les problèmes de plusieurs règles et les trie par sévérité décroissante', () => {
    const doc = makeDoc('<body><img src="x.png"><a href="#"></a></body>');
    const output = runAudit(doc, 'https://example.com/page', undefined, DEMO_RULES);

    expect(output.issues).toHaveLength(2);
    expect(output.issues[0]?.ruleId).toBe('demo-img-alt'); // critical d'abord
    expect(output.issues[1]?.ruleId).toBe('demo-empty-link'); // major ensuite

    // Normalisation : champs hérités de la règle + ids uniques
    expect(output.issues[0]?.id).toBe('demo-img-alt:0');
    expect(output.issues[0]?.title).toBe('Images sans alt');
    expect(output.issues[0]?.wcag).toBe('WCAG 1.1.1 (A)');
    expect(output.issues[0]?.elements).toHaveLength(1);
    expect(output.issues[0]?.elements[0]?.tag).toBe('img');

    // Surcharge issue > règle
    expect(output.issues[1]?.impact).toContain('lecteur d’écran');
  });

  it('produit une trace par règle avec statut et compteur', () => {
    const doc = makeDoc('<body><img src="x.png"></body>');
    const output = runAudit(doc, 'https://example.com', undefined, DEMO_RULES);
    const byId = new Map(output.traces.map((t) => [t.ruleId, t]));
    expect(byId.get('demo-img-alt')?.status).toBe('fail');
    expect(byId.get('demo-img-alt')?.issueCount).toBe(1);
    expect(byId.get('demo-empty-link')?.status).toBe('pass');
    expect(byId.get('demo-pass')?.status).toBe('pass');
  });

  it('inclut URL, date, durée et métadonnées de page', () => {
    const doc = makeDoc('<body></body>');
    const output = runAudit(doc, 'https://example.com/home', undefined, DEMO_RULES);
    expect(output.page.url).toBe('https://example.com/home');
    expect(output.page.title).toBe('Test');
    expect(output.page.hasTitle).toBe(true);
    expect(output.page.docLang).toBe('fr');
    expect(typeof output.durationMs).toBe('number');
    expect(typeof output.ranAt).toBe('string');
  });

  it('signale une page saine (aucune issue)', () => {
    const doc = makeDoc(
      '<body><img src="x.png" alt="logo"><a href="#">Accueil</a></body>',
    );
    const output = runAudit(doc, 'https://example.com', undefined, DEMO_RULES);
    expect(output.issues).toHaveLength(0);
    expect(buildAggregates(output).cleanPage).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Activation / désactivation                                          */
/* ------------------------------------------------------------------ */

describe('runAudit — options utilisateur', () => {
  it('ignore les règles présentes dans disabledRules (trace skipped)', () => {
    const doc = makeDoc('<body><img src="x.png"><a href="#"></a></body>');
    const output = runAudit(
      doc,
      'https://example.com',
      // demo-img-alt n'est pas un RuleId MVP : cast de test uniquement
      { disabledRules: ['demo-img-alt'] as unknown as AuditOptions['disabledRules'] },
      DEMO_RULES,
    );
    expect(output.issues.every((i) => i.ruleId !== 'demo-img-alt')).toBe(true);
    const skipped = output.traces.find((t) => t.ruleId === 'demo-img-alt');
    expect(skipped?.status).toBe('skipped');
    expect(skipped?.reason).toContain('désactivée');
    expect(buildAggregates(output).skippedRules).toBe(1);
  });

  it('resolveOptions fusionne avec les valeurs par défaut', () => {
    expect(resolveOptions()).toEqual({ contrastLevel: 'AA', disabledRules: [] });
    expect(resolveOptions({ contrastLevel: 'AAA', disabledRules: ['label'] })).toEqual({
      contrastLevel: 'AAA',
      disabledRules: ['label'],
    });
    // Robuste aux données corrompues venues de chrome.storage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(resolveOptions({ disabledRules: 'nope' } as any).disabledRules).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Tolérance aux pannes                                                */
/* ------------------------------------------------------------------ */

describe('runAudit — gestion des erreurs sans crash', () => {
  it('une règle qui lève ne fait pas échouer l’audit complet', () => {
    const doc = makeDoc('<body><img src="x.png"></body>');
    const rules = [...DEMO_RULES, throwingRule];
    const output = runAudit(doc, 'https://example.com', undefined, rules);

    expect(output.errors).toEqual([{ ruleId: 'demo-throw', message: 'boom' }]);
    const trace = output.traces.find((t) => t.ruleId === 'demo-throw');
    expect(trace?.status).toBe('error');
    // Les autres règles ont bien tourné
    expect(output.issues.some((i) => i.ruleId === 'demo-img-alt')).toBe(true);
    expect(buildAggregates(output).hasRuleErrors).toBe(true);
  });

  it('une sortie invalide de règle est nettoyée sans issue fantôme', () => {
    const doc = makeDoc('<body></body>');
    const output = runAudit(doc, 'https://example.com', undefined, [garbageRule]);
    // 'pas-un-objet' et null sont écartés ; l'objet restant produit 1 issue normalisée
    expect(output.issues).toHaveLength(1);
    expect(output.issues[0]?.severity).toBe('minor'); // sévérité invalide -> héritage règle
    expect(output.issues[0]?.id).toBe('demo-garbage:0');
  });

  it('un document inexploitable retourne une erreur globale, jamais une exception', () => {
    const broken = { title: '', documentElement: null } as unknown as Document;
    const output = runAudit(broken, 'https://example.com', undefined, DEMO_RULES);
    expect(output.issues).toEqual([]);
    expect(output.errors[0]?.ruleId).toBe('*');
  });
});

/* ------------------------------------------------------------------ */
/* Tri pur + agrégats + sérialisabilité                                */
/* ------------------------------------------------------------------ */

describe('fonctions utilitaires du moteur', () => {
  it('sortIssues ordonne sévérité puis ruleId de façon déterministe', () => {
    const mk = (ruleId: string, severity: string, index = 0) =>
      ({
        ruleId,
        id: `${ruleId}:${index}`,
        title: '',
        description: '',
        recommendation: '',
        severity,
        category: 'document',
        elements: [],
      }) as RawAuditOutput['issues'][number];
    const sorted = sortIssues([
      mk('z-rule', 'minor'),
      mk('a-rule', 'critical'),
      mk('b-rule', 'critical'),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['a-rule:0', 'b-rule:0', 'z-rule:0']);
  });

  it('countBySeverity renvoie toujours les 4 clés', () => {
    const counts = countBySeverity([]);
    expect(counts).toEqual({ critical: 0, major: 0, moderate: 0, minor: 0 });
  });

  it('formatDuration utilise le format FR', () => {
    expect(formatDuration(12)).toBe('12 ms');
    expect(formatDuration(1400)).toBe('1,4 s');
  });

  it('collectPageMeta gère titre vide et absence de lang', () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      '<!DOCTYPE html><html><head><title> </title></head><body></body></html>',
      'text/html',
    );
    const meta = collectPageMeta(doc, 'https://x.fr');
    expect(meta.hasTitle).toBe(false);
    expect(meta.docLang).toBeUndefined();
  });

  it('la sortie complète est structurally cloneable (contrainte MV3)', () => {
    const doc = makeDoc('<body><img src="x.png"><a href="#"></a></body>');
    const output = runAudit(doc, 'https://example.com', undefined, [
      ...DEMO_RULES,
      throwingRule,
    ]);
    expect(() => structuredClone(output)).not.toThrow();
    const copy: RawAuditOutput = structuredClone(output);
    expect(copy.issues).toEqual(output.issues);
  });
});

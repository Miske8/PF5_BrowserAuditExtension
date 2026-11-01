/**
 * Tests unitaires des 12 règles de base (Étape 6) — happy-dom.
 *
 * Pour chaque règle : un cas « passe », un cas « échoue » avec éléments
 * localisés (selector + snippet + detail), et vérification de la forme
 * normalisée attendue par l'UI (ruleId/severity/message/recommandation).
 */

import { describe, expect, it } from 'vitest';
import type { AuditContext, AuditOptions } from '../src/types';
import { DEFAULT_AUDIT_OPTIONS } from '../src/types';
import type { AuditRule } from '../src/rules/rule';
import { normalizeIssue } from '../src/rules/rule';
import { runAudit } from '../src/audit/audit-engine';
import { getRules } from '../src/audit/registry';
import { imageAltRule } from '../src/audit/rules/image-alt';
import { buttonNameRule } from '../src/audit/rules/button-name';
import { linkNameRule } from '../src/audit/rules/link-name';
import { labelRule } from '../src/audit/rules/label';
import { formFieldNameRule } from '../src/audit/rules/form-field-name';
import { headingOrderRule } from '../src/audit/rules/heading-order';
import { htmlLangRule } from '../src/audit/rules/html-lang';
import { pageTitleRule } from '../src/audit/rules/page-title';
import { tabindexPositiveRule } from '../src/audit/rules/tabindex-positive';
import { ariaHiddenFocusableRule } from '../src/audit/rules/aria-hidden-focusable';
import { duplicateIdRule } from '../src/audit/rules/duplicate-id';
import { landmarksRule } from '../src/audit/rules/landmarks';
import { colorContrastRule } from '../src/audit/rules/color-contrast';

const URL = 'https://example.com/test';

function ctx(html: string, options: Partial<AuditOptions> = {}): AuditContext {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html>${html}`,
    'text/html',
  );
  return { document: doc, url: URL, options: { ...DEFAULT_AUDIT_OPTIONS, ...options } };
}

/** Évalue une règle et retourne ses issues normalisées (via le pipeline moteur). */
function evaluate(rule: AuditRule, html: string) {
  const output = runAudit(ctx(html).document, URL, {}, [rule]);
  return { output, issues: output.issues };
}

/**
 * Évaluateur « sans styles » pour le moteur complet : la règle de contraste a
 * besoin d'un getComputedStyle crédible (testé séparément dans
 * rules-contrast.test.ts). Sans defaultView injectée, on neutralise ici les
 * candidats texte pour que CLEAN_PAGE reste un test de non-régression pur.
 */
const NO_CONTRAST_RULES = getRules().filter((r) => r.id !== 'color-contrast');

const CLEAN_PAGE = `<html lang="fr"><head><title>Page propre</title></head>
<body>
<header><nav aria-label="Principal"><a href="/">Accueil</a></nav></header>
<main><h1>Bienvenue</h1><p>Texte <img src="photo.jpg" alt="Une photo"></p>
<button>Envoyer</button>
<label for="nom">Nom</label><input id="nom" name="nom"></main>
<footer>À propos</footer>
</body></html>`;

describe('registre — intégrité des 13 règles MVP', () => {
  it('le registre contient exactement les 13 règles des Étapes 6-7', () => {
    expect(getRules().map((r) => r.id)).toEqual([
      'image-alt',
      'button-name',
      'link-name',
      'label',
      'form-field-name',
      'heading-order',
      'html-lang',
      'page-title',
      'tabindex-positive',
      'aria-hidden-focusable',
      'duplicate-id',
      'landmarks',
      'color-contrast',
    ]);
  });

  it('la règle de contraste est bien déclarée dans le registre (Étape 7)', () => {
    const contrast = getRules().find((r) => r.id === 'color-contrast');
    expect(contrast).toBeDefined();
    expect(contrast!.category).toBe('color');
    expect(contrast!.id).toBe(colorContrastRule.id);
  });

  it('toutes les règles ont un contrat complet et unique', () => {
    const ids = new Set<string>();
    for (const rule of getRules()) {
      expect(ids.has(rule.id)).toBe(false);
      ids.add(rule.id);
      expect(rule.title.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
      expect(rule.recommendation.length).toBeGreaterThan(0);
      expect(['critical', 'major', 'moderate', 'minor']).toContain(rule.severity);
      expect(rule.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('une page exemplaire ne déclenche AUCUNE des 12 règles de base (zéro faux positif)', () => {
    // Sans defaultView injectée, la règle de contraste n'a pas de styles
    // exploitables : on teste les 12 règles structurelles avec le moteur.
    const output = runAudit(ctx(CLEAN_PAGE).document, URL, {}, NO_CONTRAST_RULES);
    expect(output.issues).toEqual([]);
    expect(output.traces.every((t) => t.status === 'pass')).toBe(true);
  });

  it('sans defaultView, la règle de contraste ne plante jamais et ne signale rien', () => {
    const output = runAudit(ctx(CLEAN_PAGE).document, URL, {}, [colorContrastRule]);
    expect(output.errors).toEqual([]);
    expect(output.issues).toEqual([]);
    expect(output.traces[0]!.status).toBe('pass');
  });
});

/* ------------------------------------------------------------------ */
/* 1. image-alt                                                        */
/* ------------------------------------------------------------------ */
describe('règle image-alt', () => {
  it('signale une <img> sans alt, avec extrait HTML et sélecteur', () => {
    const { issues } = evaluate(imageAltRule, '<html><body><img src="chat.png" class="hero"></body></html>');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('image-alt');
    expect(issues[0]!.severity).toBe('critical');
    const el = issues[0]!.elements[0]!;
    expect(el.tag).toBe('img');
    expect(el.snippet).toContain('<img');
    expect(el.detail).toContain('alt');
    expect(el.selector).toBeTruthy();
  });

  it('accepte alt="" (décorative) mais signale alt=" "', () => {
    expect(evaluate(imageAltRule, '<html><body><img alt="" src="x.png"></body></html>').issues).toHaveLength(0);
    expect(evaluate(imageAltRule, '<html><body><img alt=" " src="x.png"></body></html>').issues).toHaveLength(1);
  });

  it('dégrade role=presentation sans alt en mineur', () => {
    const { issues } = evaluate(
      imageAltRule,
      '<html><body><img role="presentation" src="deco.png"></body></html>',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('minor');
  });
});

/* ------------------------------------------------------------------ */
/* 2. button-name                                                      */
/* ------------------------------------------------------------------ */
describe('règle button-name', () => {
  it('signale un bouton vide et un bouton icône sans libellé', () => {
    const { issues } = evaluate(
      buttonNameRule,
      '<html><body><button></button><button><svg></svg></button></body></html>',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.elements).toHaveLength(2);
    expect(issues[0]!.severity).toBe('critical');
  });

  it('accepte aria-label, aria-labelledby ou du texte', () => {
    const ok = `<html><body>
      <button aria-label="Fermer">×</button>
      <span id="lib">Rechercher</span><button aria-labelledby="lib"></button>
      <button>Envoyer</button>
    </body></html>`;
    expect(evaluate(buttonNameRule, ok).issues).toHaveLength(0);
  });

  it('signale input[type=submit] sans value ni nom ARIA', () => {
    expect(evaluate(buttonNameRule, '<html><body><input type="submit" value=""></body></html>').issues).toHaveLength(1);
    expect(evaluate(buttonNameRule, '<html><body><input type="submit" value="Valider"></body></html>').issues).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 3. link-name                                                        */
/* ------------------------------------------------------------------ */
describe('règle link-name', () => {
  it('signale un lien vide et un lien social icône sans titre', () => {
    const { issues } = evaluate(
      linkNameRule,
      '<html><body><a href="/x"></a><a href="https://twitter.com/a"><i class="fab fa-twitter"></i></a></body></html>',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.elements).toHaveLength(2);
  });

  it('ignore les ancres sans href (non liens) et accepte title/aria-label', () => {
    const ok = `<html><body>
      <a name="ancre">section</a>
      <a href="/y" title="Page suivante"></a>
      <a href="/z" aria-label="Documentation"></a>
    </body></html>`;
    expect(evaluate(linkNameRule, ok).issues).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 4. label                                                            */
/* ------------------------------------------------------------------ */
describe('règle label', () => {
  it('signale un champ sans label associé', () => {
    const { issues } = evaluate(labelRule, '<html><body><input type="text" name="q"></body></html>');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('major');
    expect(issues[0]!.elements[0]!.detail).toContain('name="q"');
  });

  it('accepte label[for], label englobant et fieldset>legend (radio)', () => {
    const ok = `<html><body>
      <label for="a">A</label><input id="a">
      <label>B <input type="checkbox"></label>
      <fieldset><legend>Civilité</legend><input type="radio" name="civ"></fieldset>
    </body></html>`;
    expect(evaluate(labelRule, ok).issues).toHaveLength(0);
  });

  it('ignore hidden, submit, reset, button et image', () => {
    const ok = `<html><body>
      <input type="hidden" name="csrf">
      <input type="submit" value="OK">
      <input type="reset" value="Annuler">
      <input type="button" value="Clic">
      <input type="image" src="b.png" alt="Valider">
    </body></html>`;
    expect(evaluate(labelRule, ok).issues).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 5. form-field-name                                                  */
/* ------------------------------------------------------------------ */
describe('règle form-field-name', () => {
  it('signale un champ sans AUCUN mécanisme de nom', () => {
    const { issues } = evaluate(formFieldNameRule, '<html><body><input type="text" placeholder="E-mail"></body></html>');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.elements[0]!.detail).toContain('sans nom accessible');
  });

  it('accepte aria-label, aria-labelledby valide et title', () => {
    const ok = `<html><body>
      <input aria-label="Téléphone">
      <span id="lbl">Fax</span><input aria-labelledby="lbl">
      <input title="Poste">
    </body></html>`;
    expect(evaluate(formFieldNameRule, ok).issues).toHaveLength(0);
  });

  it('signale aria-labelledby pointant vers un id inexistant ou vide', () => {
    const bad = '<html><body><input aria-labelledby="absent"><span id="vide"></span><input aria-labelledby="vide"></body></html>';
    const { issues } = evaluate(formFieldNameRule, bad);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.elements).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* 6. heading-order                                                    */
/* ------------------------------------------------------------------ */
describe('règle heading-order', () => {
  it('signale un saut h1 → h3 sur l’élément fautif', () => {
    const { issues } = evaluate(
      headingOrderRule,
      '<html><body><h1>A</h1><h3>C</h3></body></html>',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.elements[0]!.tag).toBe('h3');
    expect(issues[0]!.elements[0]!.detail).toContain('saut');
  });

  it('accepte une hiérarchie monotone et les remontées libres', () => {
    const ok = '<html><body><h1>A</h1><h2>B</h2><h3>C</h3><h2>D</h2></body></html>';
    expect(evaluate(headingOrderRule, ok).issues).toHaveLength(0);
  });

  it('signale plusieurs h1 en modéré', () => {
    const { issues } = evaluate(headingOrderRule, '<html><body><h1>A</h1><h1>B</h1></body></html>');
    expect(issues.some((i) => i.title.includes('Plusieurs titres'))).toBe(true);
    expect(issues.find((i) => i.title.includes('Plusieurs'))!.severity).toBe('moderate');
  });

  it('signale l’absence totale de titres', () => {
    const { issues } = evaluate(headingOrderRule, '<html><body><p>texte</p></body></html>');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.elements).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 7. html-lang                                                        */
/* ------------------------------------------------------------------ */
describe('règle html-lang', () => {
  it('signale l’absence de lang sur <html>', () => {
    const { issues } = evaluate(htmlLangRule, '<html><head><title>T</title></head><body></body></html>');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('major');
    expect(issues[0]!.elements[0]!.tag).toBe('html');
  });

  it('accepte lang="fr" et xml:lang en repli', () => {
    expect(evaluate(htmlLangRule, '<html lang="fr"><body></body></html>').issues).toHaveLength(0);
    expect(evaluate(htmlLangRule, '<html xml:lang="en"><body></body></html>').issues).toHaveLength(0);
  });

  it('signale une valeur de langue invalide', () => {
    const { issues } = evaluate(htmlLangRule, '<html lang="francais_2024!"><body></body></html>');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.title).toContain('invalide');
  });
});

/* ------------------------------------------------------------------ */
/* 8. page-title                                                       */
/* ------------------------------------------------------------------ */
describe('règle page-title', () => {
  it('signale un <title> absent', () => {
    const { issues } = evaluate(pageTitleRule, '<html><head></head><body></body></html>');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('major');
  });

  it('signale un <title> vide', () => {
    const { issues } = evaluate(pageTitleRule, '<html><head><title>   </title></head><body></body></html>');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.elements[0]!.detail).toContain('vide');
  });

  it('accepte un titre non vide', () => {
    expect(evaluate(pageTitleRule, '<html><head><title>Accueil</title></head><body></body></html>').issues).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 9. tabindex-positive                                                */
/* ------------------------------------------------------------------ */
describe('règle tabindex-positive', () => {
  it('signale tabindex="1" et "5", ignore 0 et -1', () => {
    const { issues } = evaluate(
      tabindexPositiveRule,
      '<html><body><div tabindex="1">a</div><div tabindex="5">b</div><div tabindex="0">ok</div><div tabindex="-1">ok</div></body></html>',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.elements).toHaveLength(2);
    expect(issues[0]!.elements[0]!.detail).toContain('tabindex="1"');
    expect(issues[0]!.severity).toBe('moderate');
  });

  it('passe quand aucun tabindex positif', () => {
    expect(evaluate(tabindexPositiveRule, '<html><body><a href="#" tabindex="0">x</a></body></html>').issues).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 10. aria-hidden-focusable                                           */
/* ------------------------------------------------------------------ */
describe('règle aria-hidden-focusable', () => {
  it('signale un bouton focusable dans un conteneur aria-hidden', () => {
    const { issues } = evaluate(
      ariaHiddenFocusableRule,
      '<html><body><div aria-hidden="true"><button>Caché</button></div></body></html>',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('critical');
    expect(issues[0]!.elements[0]!.tag).toBe('button');
  });

  it('signale l’élément lui-même focusable + aria-hidden', () => {
    const { issues } = evaluate(ariaHiddenFocusableRule, '<html><body><a href="/x" aria-hidden="true">lien fantôme</a></body></html>');
    expect(issues).toHaveLength(1);
  });

  it('ignore les descendants ré-exposés (aria-hidden="false") et disabled', () => {
    const ok = `<html><body>
      <div aria-hidden="true"><div aria-hidden="false"><button>visible</button></div></div>
      <div aria-hidden="true"><button disabled>mort</button></div>
    </body></html>`;
    expect(evaluate(ariaHiddenFocusableRule, ok).issues).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 11. duplicate-id                                                    */
/* ------------------------------------------------------------------ */
describe('règle duplicate-id', () => {
  it('produit une issue par groupe de doublons avec tous les éléments', () => {
    const { issues } = evaluate(
      duplicateIdRule,
      '<html><body><div id="dup">1</div><span id="dup">2</span><p id="autre">ok</p></body></html>',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.title).toContain('#dup');
    expect(issues[0]!.elements).toHaveLength(2);
    expect(issues[0]!.severity).toBe('major');
  });

  it('passe avec des ids uniques', () => {
    expect(evaluate(duplicateIdRule, '<html><body><div id="a"></div><div id="b"></div></body></html>').issues).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 12. landmarks                                                       */
/* ------------------------------------------------------------------ */
describe('règle landmarks', () => {
  it('signale main/nav/header/footer manquants (4 issues distinctes)', () => {
    const { issues } = evaluate(landmarksRule, '<html><body><div>contenu brut</div></body></html>');
    expect(issues).toHaveLength(4);
    expect(issues.find((i) => i.title.includes('<main>'))!.severity).toBe('major');
    expect(issues.filter((i) => i.severity === 'moderate')).toHaveLength(3);
  });

  it('accepte les équivalents ARIA (role=main/navigation/banner/contentinfo)', () => {
    const ok = `<html><body>
      <div role="banner"></div>
      <div role="navigation"></div>
      <div role="main"></div>
      <div role="contentinfo"></div>
    </body></html>`;
    expect(evaluate(landmarksRule, ok).issues).toHaveLength(0);
  });

  it('n’exige pas header/footer si leur rôle est assumé ailleurs', () => {
    const partial = '<html><body><main><nav aria-label="Menu"></nav></main></body></html>';
    const { issues } = evaluate(landmarksRule, partial);
    expect(issues).toHaveLength(2); // banner + contentinfo
    expect(issues.map((i) => i.title).join()).not.toContain('<main>');
  });
});

/* ------------------------------------------------------------------ */
/* Pipeline complet                                                    */
/* ------------------------------------------------------------------ */
describe('audit complet sur page volontairement cassée', () => {
  const BROKEN = `<html><head><title></title></head><body>
    <img src="logo.png">
    <button><svg></svg></button>
    <a href="/more"></a>
    <input type="email" placeholder="E-mail">
    <h1>Titre</h1><h4>Sous-titre sauté</h4>
    <div tabindex="3">ordre forcé</div>
    <div aria-hidden="true"><a href="/ghost">fantôme</a></div>
    <span id="dup">1</span><span id="dup">2</span>
  </body></html>`;

  it('détecte au moins une issue par famille de règles', () => {
    const output = runAudit(ctx(BROKEN).document, URL);
    const ruleIds = new Set(output.issues.map((i) => i.ruleId));
    for (const expected of ['image-alt', 'button-name', 'link-name', 'form-field-name', 'heading-order', 'html-lang', 'tabindex-positive', 'aria-hidden-focusable', 'duplicate-id', 'landmarks']) {
      expect(ruleIds.has(expected)).toBe(true);
    }
    expect(output.errors).toHaveLength(0);
    expect(output.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('chaque issue porte message + recommandation + extraits exploitables', () => {
    const output = runAudit(ctx(BROKEN).document, URL);
    for (const issue of output.issues) {
      expect(issue.title.length).toBeGreaterThan(0);
      expect(issue.description.length).toBeGreaterThan(0);
      expect(issue.recommendation.length).toBeGreaterThan(0);
      expect(['critical', 'major', 'moderate', 'minor']).toContain(issue.severity);
      for (const el of issue.elements) {
        expect(el.snippet === undefined || el.snippet.length <= 130).toBe(true);
      }
      expect(() => structuredClone(issue)).not.toThrow();
    }
  });

  it('normalizeIssue conserve la surcharge de sévérité par occurrence', () => {
    const raw = { severity: 'minor' as const, elements: [] };
    const issue = normalizeIssue(imageAltRule, raw, 0);
    expect(issue.severity).toBe('minor');
    expect(issue.ruleId).toBe('image-alt');
  });
});

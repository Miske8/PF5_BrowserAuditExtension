/**
 * Règle : contraste de texte insuffisant (Étape 7).
 * WCAG 1.4.3 AA (major) / 1.4.6 AAA — catégorie « color ».
 *
 * Stratégie « tolérante mais utile » — pensée pour éviter les faux positifs :
 *
 *  1. On ne teste que le TEXTE VISIBLE : élément portant du texte direct non
 *     vide, pas d'ancêtre `aria-hidden`, dimensions > 0, opacité cumulée > 0,
 *     hors `display:none`/`visibility:hidden`.
 *  2. Couleur de texte : `getComputedStyle().color` (couleur héritée déjà
 *     résolue par le moteur CSS ; `currentColor` est donc invisible ici).
 *  3. Couleur de fond : on remonte les ancêtres en composant leurs
 *     `background-color` translucides (source-over) jusqu'à trouver une
 *     couche opaque. Si aucun fond opaque n'est trouvé, on aplatisit sur
 *     BLANC (défaut navigateur) avec confiance réduite.
 *  4. Cas spéciaux ignorés (non gérés volontairement au MVP) : images de
 *     fond, canvas, dégradés multiples, `mix-blend-mode`, ombres portées,
 *     textes en pseudo-éléments, polices web à rendu léger.
 *  5. Seuil appliqué selon taille/poids (gros texte : 3:1 AA / 4.5:1 AAA),
 *     niveau AA ou AAA choisi via `ctx.options.contrastLevel` (Étape 13).
 *
 * Niveau de confiance (`ElementFinding.confidence`) :
 *  - 1.0  : fond opaque résolu directement ;
 *  - 0.85 : composition de plusieurs couches rgba/opacité ;
 *  - 0.6  : aplatissement sur blanc supposé (aucun ancêtre opaque) ;
 *  - < 0.5 : l'issue est ABANDONNÉE (trop incertaine → faux positif).
 *
 * Les issues sont GROUPÉES par tranche de sévérité dérivée du ratio :
 *  - ratio < 1.5  (texte quasi illisible)          → critical
 *  - sinon échec AAA                               → minor/moderate
 *  - sinon échec AA : gros texte → major, normal → moderate
 */

import { defineRule, type RawIssue } from '../../rules/rule';
import type { AuditContext, ElementFinding, Severity } from '../../types';
import {
  contrastRatio,
  parseColor,
  roundRatio,
  toHex,
  blendOver,
  isLargeText,
  WCAG_CONTRAST_THRESHOLDS,
  type Rgb,
  type Rgba,
} from '../../utils/color';
import { cssPath, elementSnippet } from '../../utils/dom';

/** Nombre max d'ancêtres visités pour reconstituer le fond. */
const MAX_BG_DEPTH = 12;
/** En dessous de cette confiance, on ne signale rien (anti faux positifs). */
const MIN_CONFIDENCE = 0.5;
/** Marge d'arrondi : un ratio à ±0.05 du seuil est considéré comme conforme. */
const NEAR_PASS_TOLERANCE = 0.05;

interface ResolvedColor {
  /** Couleur finale opaque prête pour le calcul de luminance. */
  rgb: Rgb;
  /** Confiance du calcul [0..1]. */
  confidence: number;
}

interface TextCandidate {
  el: HTMLElement;
  style: CSSStyleDeclaration;
  text: string;
}

/** Vrai si l'élément porte du texte DIRECT (child text node non vide). */
function ownText(el: Element): string {
  let out = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3 /* Node.TEXT_NODE */) out += child.nodeValue ?? '';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Vrai si un ancêtre est aria-hidden (le texte n'est pas exposé aux AT). */
function insideAriaHidden(el: Element): boolean {
  let current: Element | null = el.parentElement;
  while (current) {
    if (current.getAttribute('aria-hidden') === 'true') return true;
    current = current.parentElement;
  }
  return false;
}

/** Visibilité basique sans layout coûteux (les tests happy-dom n'ont pas de box model). */
function looksVisible(style: CSSStyleDeclaration): boolean {
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  const opacity = Number.parseFloat(style.opacity || '1');
  if (Number.isFinite(opacity) && opacity <= 0.01) return false;
  return true;
}

/** Poids >= 700 (ou "bold") ⇒ gras, pour le seuil « gros texte » WCAG. */
function isBoldWeight(style: CSSStyleDeclaration): boolean {
  const raw = style.fontWeight || '400';
  if (/^bold(er)?$/.test(raw)) return true;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 700;
}

/** font-size en px (fallback 16px si unité exotique non convertible). */
function fontSizePx(style: CSSStyleDeclaration): number {
  const raw = (style.fontSize || '').trim();
  const match = /^([0-9]*\.?[0-9]+)(px|pt|em|rem|%)$/.exec(raw);
  if (!match) return 16;
  const num = Number.parseFloat(match[1]!);
  switch (match[2]) {
    case 'px':
      return num;
    case 'pt':
      return (num * 96) / 72;
    case 'em':
    case 'rem':
      return num * 16;
    default:
      return (num / 100) * 16;
  }
}

/**
 * Reconstruit la couleur de fond effective d'un élément :
 * composition source-over des fonds translucides propres + ancêtres,
 * aplatissement final sur blanc si aucun fond opaque n'est rencontré.
 */
function resolveBackground(
  el: HTMLElement,
  getStyle: (node: Element) => CSSStyleDeclaration,
): ResolvedColor {
  const layers: Rgba[] = [];
  let confidence = 1;
  let opaqueFound = false;
  /** Image/dégradé rencontré SUR l'élément même du texte : imprévisible → abandon. */
  let ownBackgroundImage = false;

  // Opacité cumulée propre + ancêtres (un parent à 0.5 réduit le contraste effectif).
  let alphaChain = 1;
  let node: Element | null = el;
  let depth = 0;
  while (node && depth <= MAX_BG_DEPTH) {
    const style = getStyle(node);
    const opacity = Number.parseFloat(style.opacity || '1');
    if (Number.isFinite(opacity) && opacity < 1) {
      alphaChain *= Math.max(0, opacity);
      confidence = Math.min(confidence, 0.85);
    }
    // Image/dégradé NON RÉ SOLUBLE en couleur sur l'élément portant le texte
    // lui-même : visuel derrière les glyphes totalement imprévisible → on
    // renonce immédiatement (peu importe les couches de fond par ailleurs).
    // Sur un ancêtre, on ignore simplement la couche image : la plupart des
    // designs posent le texte dans une carte/section au fond résolvable.
    const bgImage = style.backgroundImage;
    if (depth === 0 && bgImage && bgImage !== 'none' && parseColor(bgImage) === null) {
      ownBackgroundImage = true;
    }
    if (!opaqueFound) {
      const bg = parseColor(style.backgroundColor);
      if (bg) {
        if (bg.a >= 1) {
          layers.push(bg);
          opaqueFound = true;
        } else if (bg.a > 0) {
          layers.push(bg);
          confidence = Math.min(confidence, 0.85);
        }
        // bg.a === 0 (transparent) : couche neutre, on continue de remonter.
      } else if (!(bgImage && bgImage !== 'none')) {
        // Valeur non résoluble (hsl exotique, var()…) sans image de fond :
        // visuel incertain → on renonce aussi (anti faux positifs).
        return { rgb: { r: 255, g: 255, b: 255, a: 1 }, confidence: 0 };
      }
      // sinon : image/dégradé sur un ancêtre → couche ignorée, on remonte.
    }
    node = node.parentElement;
    depth += 1;
  }

  if (ownBackgroundImage) {
    return { rgb: { r: 255, g: 255, b: 255, a: 1 }, confidence: 0 };
  }

  if (!opaqueFound) {
    // Aucun ancêtre opaque : la page suppose un canvas blanc (défaut UA).
    confidence = Math.min(confidence, 0.6);
  }

  // Aplatissement : on part du fond le plus bas (opaque ou blanc) vers le haut.
  let base: Rgb =
    opaqueFound && layers.length > 0
      ? { ...layers[layers.length - 1]!, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 };
  for (let i = layers.length - 2; i >= 0; i -= 1) {
    base = blendOver(layers[i]!, base);
  }
  // Couche la plus basse translucide(s) déjà mélangée(s) ci-dessus ; s'il n'y
  // avait qu'une couche opaque, base = celle-ci.

  // Application de l'opacité cumulée de la chaîne (texte et fond atténués).
  if (alphaChain < 1) {
    base = blendOver({ ...base, a: alphaChain }, { r: 255, g: 255, b: 255, a: 1 });
  }

  return { rgb: base, confidence: opaqueFound ? confidence : Math.min(confidence, 0.6) };
}

/** Sévérité dérivée du ratio mesuré et du type de texte. */
function severityFor(ratio: number, required: number, large: boolean): Severity {
  if (ratio < 1.5) return 'critical'; // texte pratiquement invisible
  if (required >= 7) return large ? 'moderate' : 'minor'; // échec AAA seul
  return large ? 'major' : 'moderate'; // échec AA
}

interface FailingElement {
  finding: ElementFinding;
  severity: Severity;
  ratio: number;
  required: number;
  large: boolean;
  textColor: Rgb;
  bgColor: Rgb;
}

/** Fabrique le détail lisible d'une occurrence de contraste. */
function contrastDetail(item: FailingElement, level: 'AA' | 'AAA'): string {
  const lowConfidence = (item.finding.confidence ?? 1) < 0.9;
  return [
    `contraste ${roundRatio(item.ratio)}:1 < ${item.required}:1 (${level}${item.large ? ', gros texte' : ''})`,
    `texte ${toHex(item.textColor)} sur fond ${toHex(item.bgColor)}`,
    lowConfidence ? 'fond estimé — à vérifier manuellement' : '',
  ]
    .filter((part) => part !== '')
    .join(' · ');
}

export const colorContrastRule = defineRule({
  id: 'color-contrast',
  title: 'Contraste de texte insuffisant',
  description:
    'Des textes ont un écart de luminance insuffisant entre leur couleur et leur fond estimé : difficiles à lire pour les personnes malvoyantes ou sur écran extérieur.',
  impact:
    'Un contraste trop faible rend le texte illisible pour une grande partie des utilisateurs (presbytie, déficience visuelle, environnement lumineux).',
  severity: 'moderate',
  category: 'color',
  wcag: 'WCAG 1.4.3 (AA)',
  helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
  recommendation:
    'Assombrir la couleur de texte ou éclaircir le fond jusqu’au ratio minimal WCAG (4.5:1 texte normal, 3:1 gros texte en AA).',
  version: '1.0.0',
  evaluate: (ctx: AuditContext) => {
    const level = ctx.options.contrastLevel === 'AAA' ? 'AAA' : 'AA';
    const [normalThreshold, largeThreshold] = WCAG_CONTRAST_THRESHOLDS[level];
    const getStyle = (node: Element): CSSStyleDeclaration =>
      ctx.document.defaultView
        ? ctx.document.defaultView.getComputedStyle(node as HTMLElement)
        : (node as HTMLElement).style;

    const candidates: TextCandidate[] = [];
    const all = ctx.document.querySelectorAll<HTMLElement>('body *');
    for (const el of Array.from(all)) {
      const tag = el.tagName.toUpperCase();
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE')
        continue;
      const text = ownText(el);
      if (text === '') continue;
      if (el.getAttribute('aria-hidden') === 'true' || insideAriaHidden(el)) continue;
      const style = getStyle(el);
      if (!looksVisible(style)) continue;
      candidates.push({ el, style, text });
    }

    const failing: FailingElement[] = [];
    for (const candidate of candidates) {
      const { el, style } = candidate;
      const fg = parseColor(style.color);
      if (!fg) continue; // couleur non résolue (hsl exotique…) → on renonce
      const bg = resolveBackground(el, getStyle);
      if (bg.confidence < MIN_CONFIDENCE) continue;

      const flatFg = blendOver(fg, bg.rgb);
      const sizePx = fontSizePx(style);
      const large = isLargeText(sizePx, isBoldWeight(style));
      const required = large ? largeThreshold : normalThreshold;
      const ratio = contrastRatio(flatFg, bg.rgb);

      // Tolérance près du seuil : un ratio à ±0.05 du minimum est considéré
      // comme conforme (arrondis de lecture, sous-pixels).
      if (ratio >= required - NEAR_PASS_TOLERANCE) continue;

      const findingData: ElementFinding = {
        tag: el.tagName.toLowerCase(),
        selector: cssPath(el),
        snippet: elementSnippet(el),
        confidence: Math.round(bg.confidence * 100) / 100,
      };
      failing.push({
        finding: findingData,
        severity: severityFor(ratio, required, large),
        ratio,
        required,
        large,
        textColor: flatFg,
        bgColor: bg.rgb,
      });
    }

    if (failing.length === 0) return { passed: true, issues: [] };

    // Regroupement par sévérité dérivée (une issue UI par niveau, éléments groupés).
    const bySeverity = new Map<Severity, FailingElement[]>();
    for (const item of failing) {
      const list = bySeverity.get(item.severity) ?? [];
      list.push(item);
      bySeverity.set(item.severity, list);
    }

    const issues: RawIssue[] = [];
    for (const [severity, items] of bySeverity) {
      const worst = items.reduce((a, b) => (a.ratio < b.ratio ? a : b));
      issues.push({
        severity,
        title:
          severity === 'critical'
            ? 'Textes quasi illisibles (contraste effondré)'
            : `Contraste de texte insuffisant (${level})`,
        description:
          severity === 'critical'
            ? 'Le ratio de contraste descend sous 1.5:1 : le texte se confond presque totalement avec son fond.'
            : `Des textes n’atteignent pas le ratio minimal WCAG ${level} (${normalThreshold}:1 normal, ${largeThreshold}:1 gros texte). Le fond est reconstruit par estimation quand il est translucide.`,
        recommendation: `Modifier la couleur de texte ou de fond pour atteindre au moins ${normalThreshold}:1 (texte normal) et ${largeThreshold}:1 (gros texte) — niveau ${level}.`,
        wcag: level === 'AAA' ? 'WCAG 1.4.6 (AAA)' : 'WCAG 1.4.3 (AA)',
        elements: items.map((item) => ({
          ...item.finding,
          detail: contrastDetail(item, level),
        })),
        impact: `Pire ratio mesuré sur ce lot : ${roundRatio(worst.ratio)}:1 (minimum requis ${worst.required}:1).`,
      });
    }

    return { passed: false, issues };
  },
});

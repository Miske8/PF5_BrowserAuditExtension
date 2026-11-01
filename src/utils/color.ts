/**
 * Utilitaires couleur pour la règle de contraste (Étape 7).
 *
 * Fonctions PURES (aucune dépendance DOM) — testables sans happy-dom :
 *  - parseColor()          : rgb()/rgba()/hex/#nom → RGBA canonné ;
 *  - relativeLuminance()   : formule WCAG 2.x (sRGB linéaire) ;
 *  - contrastRatio()       : ratio (L1+0.05)/(L2+0.05) ∈ [1, 21] ;
 *  - compositeOverWhite()  : aplatissement d'une couleur translucide sur blanc ;
 *  - isLargeText()         : seuils « gros texte » WCAG (AA/AAA).
 *
 * CONTRAINTE MV3 : tout est sérialisable (objets plats string/number).
 */

/** Couleur RGBA canonnée : composantes 0-255 entiers, alpha 0-1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0 = totalement transparent, 1 = opaque. */
  a: number;
}

export type Rgb = Rgba;

const NAMED_COLORS: Record<string, string> = {
  black: '#000',
  white: '#fff',
  red: '#f00',
  green: '#008000',
  blue: '#00f',
  yellow: '#ff0',
  orange: '#ffa500',
  purple: '#800080',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  navy: '#000080',
  teal: '#008080',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  aqua: '#00ffff',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  brown: '#a52a2a',
  pink: '#ffc0cb',
  gold: '#ffd700',
  indigo: '#4b0082',
  violet: '#ee82ee',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  salmon: '#fa8072',
  sienna: '#a0522d',
  tan: '#d2b48c',
  turquoise: '#40e0d0',
  lavender: '#e6e6fa',
  coral: '#ff7f50',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkblue: '#00008b',
  darkgreen: '#006400',
  darkred: '#8b0000',
  lightblue: '#add8e6',
  lightgreen: '#90ee90',
  whitesmoke: '#f5f5f5',
  transparent: 'rgba(0,0,0,0)',
};

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

/** Parse un hex CSS (#rgb, #rrggbb, avec ou sans dièse). */
export function parseHex(value: string): Rgba | null {
  let hex = value.trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (!/^[0-9a-fA-F]{3,8}$/.test(hex)) return null;
  const expand = (s: string): number => parseInt(s + s, 16);
  if (hex.length === 3 || hex.length === 4) {
    const r = expand(hex[0]!);
    const g = expand(hex[1]!);
    const b = expand(hex[2]!);
    const a = hex.length === 4 ? expand(hex[3]!) / 255 : 1;
    return { r, g, b, a };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return null;
}

/** Parse `rgb(r g b)` / `rgba(r,g,b,a)` — séparateurs espace ou virgule. */
export function parseRgbFunction(value: string): Rgba | null {
  const match = /^rgba?\(([^)]*)\)$/i.exec(value.trim());
  if (!match) return null;
  const parts = match[1]!
    .trim()
    .split(/[\s,/]+/)
    .filter((p) => p !== '');
  if (parts.length < 3 || parts.length > 4) return null;
  const channel = (token: string): number | null => {
    if (token.endsWith('%')) {
      const pct = Number.parseFloat(token);
      return Number.isFinite(pct) ? clamp((pct / 100) * 255, 0, 255) : null;
    }
    const n = Number.parseFloat(token);
    return Number.isFinite(n) ? clamp(n, 0, 255) : null;
  };
  const r = channel(parts[0]!);
  const g = channel(parts[1]!);
  const b = channel(parts[2]!);
  if (r === null || g === null || b === null) return null;
  let a = 1;
  if (parts.length === 4) {
    const token = parts[3]!;
    a = token.endsWith('%') ? Number.parseFloat(token) / 100 : Number.parseFloat(token);
    if (!Number.isFinite(a)) return null;
    a = clamp(a, 0, 1);
  }
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
}

/**
 * Parse une valeur CSS de couleur : #hex, rgb()/rgba(), noms courants.
 * Retourne null pour tout ce qui n'est pas reconnaissable
 * (hsl(), currentColor, variables, gradients…) — la règle traitera cela
 * comme « couleur non résolue » plutôt que de produire un faux positif.
 */
export function parseColor(value: string | null | undefined): Rgba | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (raw === '') return null;
  if (NAMED_COLORS[raw]) return parseColor(NAMED_COLORS[raw]);
  if (raw.startsWith('#')) return parseHex(raw);
  if (raw.startsWith('rgb')) return parseRgbFunction(raw);
  // Hex sans dièse uniquement s'il a une forme hexadécimale stricte
  // (sinon on retombe sur null — ex: 'ffffffz', 'not-a-color').
  if (/^[0-9a-f]{3,8}$/.test(raw)) return parseHex(raw);
  return null;
}

/** Linéarisation d'un canal sRGB (composante 0-255 → 0-1 linéaire). */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminance relative WCAG 2.x (0 = noir, 1 = blanc). */
export function relativeLuminance(color: Rgb): number {
  const r = linearize(clamp(color.r, 0, 255));
  const g = linearize(clamp(color.g, 0, 255));
  const b = linearize(clamp(color.b, 0, 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG entre deux couleurs — toujours ≥ 1. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Aplatissement d'une couleur semi-transparente sur un fond donné
 * (loi de mélange « source-over », fond supposé opaque).
 */
export function blendOver(foreground: Rgba, background: Rgb): Rgb {
  if (foreground.a >= 1) {
    return { r: foreground.r, g: foreground.g, b: foreground.b, a: 1 };
  }
  const mix = (fg: number, bg: number): number =>
    Math.round(fg * foreground.a + bg * (1 - foreground.a));
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    a: 1,
  };
}

/** Confort : aplatir sur blanc (cas par défaut des pages web). */
export function compositeOverWhite(color: Rgba): Rgb {
  return blendOver(color, { r: 255, g: 255, b: 255, a: 1 });
}

/** Conversion #rrggbb (utile pour les messages/tests). */
export function toHex(color: Rgb): string {
  const h = (n: number): string =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${h(color.r)}${h(color.g)}${h(color.b)}`;
}

/** Écart typographique normalisé vs 16px (font-size px ou em). */
export function fontSizeRem(sizePx: number): number {
  return sizePx / 16;
}

/**
 * Vrai si le texte est « gros » au sens WCAG :
 *  - ≥ 18.66px (≈14pt) quel que soit le poids, ou
 *  - ≥ 24px     (≈18.72px ≈14pt gras / 1.5rem) à tout poids.
 * Les seuils conditionnent les ratios requis (3:1 au lieu de 4.5:1 en AA).
 */
export function isLargeText(sizePx: number, boldWeight: boolean): boolean {
  if (sizePx >= 24) return true;
  if (boldWeight && sizePx >= 18.66) return true;
  return false;
}

/** Seuils de contraste par niveau WCAG : [texte normal, gros texte]. */
export const WCAG_CONTRAST_THRESHOLDS: Record<'AA' | 'AAA', [number, number]> = {
  AA: [4.5, 3],
  AAA: [7, 4.5],
};

/** Arrondi à 2 décimales pour affichage stable dans les rapports. */
export function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

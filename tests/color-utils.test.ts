/**
 * Tests unitaires des utilitaires couleur (Étape 7) — pur, sans DOM.
 * Formules validées contre les valeurs de référence WCAG connues.
 */

import { describe, expect, it } from 'vitest';
import {
  parseColor,
  parseHex,
  parseRgbFunction,
  relativeLuminance,
  contrastRatio,
  blendOver,
  compositeOverWhite,
  isLargeText,
  toHex,
  roundRatio,
  WCAG_CONTRAST_THRESHOLDS,
} from '../src/utils/color';

describe('parseColor', () => {
  it('analyse les hex courts et longs', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#336699')).toEqual({ r: 51, g: 102, b: 153, a: 1 });
    expect(parseColor('ffffff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#00000080')?.a).toBeCloseTo(0.502, 2);
  });

  it('analyse rgb()/rgba() avec virgules ou espaces, et pourcentages', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('rgb(0 128 0)')).toEqual({ r: 0, g: 128, b: 0, a: 1 });
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseColor('rgba(100%, 0%, 0%, 1)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('analyse les noms CSS courants', () => {
    expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('BLACK')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('retourne null pour ce qui est non résoluble (anti faux positifs)', () => {
    expect(parseColor('hsl(120, 50%, 50%)')).toBeNull();
    expect(parseColor('currentColor')).toBeNull();
    expect(parseColor('--var-color')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor(null)).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });

  it('borne les valeurs hors plage sans crash', () => {
    const c = parseRgbFunction('rgb(300, -20, 12.7)');
    expect(c).not.toBeNull();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(13);
  });

  it('rejette un hex invalide', () => {
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('zzzzzz')).toBeNull();
  });
});

describe('relativeLuminance / contrastRatio (références WCAG)', () => {
  const black = parseColor('#000')!;
  const white = parseColor('#fff')!;

  it('noir = 0, blanc = 1', () => {
    expect(relativeLuminance(black)).toBeCloseTo(0, 5);
    expect(relativeLuminance(white)).toBeCloseTo(1, 5);
  });

  it('contraste noir/blanc = 21:1', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 1);
  });

  it('contraste symétrique', () => {
    const red = parseColor('#ff0000')!;
    expect(contrastRatio(red, white)).toBeCloseTo(contrastRatio(white, red), 10);
  });

  it('rouge sur blanc ≈ 3.99:1 (valeur axe connue)', () => {
    expect(contrastRatio(parseColor('#ff0000')!, white)).toBeCloseTo(3.99, 1);
  });

  it('gris #777 sur blanc ≈ 4.48:1 (sous le seuil AA)', () => {
    expect(contrastRatio(parseColor('#777777')!, white)).toBeCloseTo(4.48, 2);
  });

  it('une couleur avec elle-même = 1:1 minimum', () => {
    const blue = parseColor('#00f')!;
    expect(contrastRatio(blue, blue)).toBeCloseTo(1, 5);
  });
});

describe('blendOver / compositeOverWhite', () => {
  const white = parseColor('#fff')!;

  it('couche opaque : pas de mélange', () => {
    const fg = parseColor('#ff0000')!;
    expect(blendOver(fg, parseColor('#00ff00')!)).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('mi-transparence : moyenne des composantes', () => {
    const half = parseColor('rgba(0, 0, 0, 0.5)')!;
    expect(blendOver(half, white)).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it('compositeOverWhite aplatis correctement', () => {
    expect(compositeOverWhite(parseColor('rgba(255, 0, 0, 0.5)')!)).toEqual({
      r: 255,
      g: 128,
      b: 128,
      a: 1,
    });
  });
});

describe('isLargeText (seuils WCAG)', () => {
  it('≥24px : gros texte même non gras', () => {
    expect(isLargeText(24, false)).toBe(true);
    expect(isLargeText(23.9, false)).toBe(false);
  });
  it('≥18.66px seulement si gras', () => {
    expect(isLargeText(19, true)).toBe(true);
    expect(isLargeText(19, false)).toBe(false);
  });
});

describe('constantes et formatage', () => {
  it('seuils AA/AAA conformes WCAG', () => {
    expect(WCAG_CONTRAST_THRESHOLDS.AA).toEqual([4.5, 3]);
    expect(WCAG_CONTRAST_THRESHOLDS.AAA).toEqual([7, 4.5]);
  });
  it('toHex et roundRatio', () => {
    expect(toHex(parseColor('#336699')!)).toBe('#336699');
    expect(roundRatio(4.567)).toBe(4.57);
  });
});

#!/usr/bin/env node
// @ts-check
/**
 * Génère les icônes PNG de l'extension (Étape 3).
 * - Source : scripts/icon.svg (dessin vectoriel "loupe + A")
 * - Sorties : src/assets/icons/icon-{16,32,48,128}.png
 *   Le plugin Vite `scripts/vite-plugin-icons.mjs` les copie ensuite
 *   dans dist/icons/ pour correspondre aux chemins du manifest.
 */
import { mkdirFile } from './lib/fs-utils.mjs';
import { readFile } from 'node:fs/promises';

const SIZES = [16, 32, 48, 128];
const svg = await readFile('scripts/icon.svg', 'utf8');

/** Tente plusieurs rasteriseurs optionnels ; échoue explicitement si aucun. */
async function rasterize(/** @type {number} */ width, /** @type {number} */ height) {
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
    return Buffer.from(resvg.render().asPng());
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ERR_MODULE_NOT_FOUND')
      throw err;
  }
  try {
    // sharp est parfois présent via des dépendances transitives (fallback optionnel)
    const dynamicImport = (/** @type {string} */ href) => import(href);
    const mod = /** @type {{ default?: (buf: Buffer, opts: object) => any } | null } */ (
      await dynamicImport('sharp').catch(() => null)
    );
    if (mod?.default) {
      return await mod
        .default(Buffer.from(svg), { density: 96 })
        .resize(width, height)
        .png()
        .toBuffer();
    }
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ERR_MODULE_NOT_FOUND')
      throw err;
  }
  throw new Error('Aucun rasteriseur SVG trouvé (installez @resvg/resvg-js ou sharp).');
}

for (const size of SIZES) {
  const png = await rasterize(size, size);
  await mkdirFile(`src/assets/icons/icon-${size}.png`, png);
  console.log(`✔ icon-${size}.png (${png.length} octets)`);
}

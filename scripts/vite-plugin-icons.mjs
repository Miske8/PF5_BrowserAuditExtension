// @ts-check
import { cp } from 'node:fs/promises';

/**
 * Plugin Vite (Étape 3) : copie src/assets/icons/ -> dist/icons/.
 * Le manifest référence « icons/icon-{16,32,48,128}.png » à la racine de dist/,
 * ce qui correspond exactement à cette arborescence après build.
 *
 * @returns {import('vite').Plugin}
 */
export function iconsPlugin() {
  return {
    name: 'a11y-lens:icons',
    apply: 'build',
    async closeBundle() {
      try {
        await cp('src/assets/icons', 'dist/icons', {
          recursive: true,
          filter: (src) => !src.endsWith('.gitkeep'),
        });
        console.log('✔ icônes copiées dans dist/icons/');
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err;
        console.warn('⚠ src/assets/icons introuvable — lancez `npm run icons`.');
      }
    },
  };
}

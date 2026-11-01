import { defineConfig } from 'vite';
import { iconsPlugin } from './scripts/vite-plugin-icons.mjs';

/**
 * Configuration Vite pour A11y Lens.
 * Build multi-pages : popup + options (les entrées HTML seront créées aux Étapes 9 et 13).
 * Le manifest.json est généré par scripts/generate-manifest.mjs (source de vérité : manifest.config.mjs).
 * Le plugin iconsPlugin copie src/assets/icons -> dist/icons (chemins du manifest).
 */
export default defineConfig({
  base: './',
  plugins: [iconsPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: false, // préserve dist/manifest.json généré par le script
    target: 'chrome116',
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        options: 'src/options/index.html',
      },
    },
  },
});

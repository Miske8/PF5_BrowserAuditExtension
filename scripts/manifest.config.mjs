// @ts-check
/**
 * Contrat du manifest V3 de A11y Lens (Étape 3).
 * Source unique de vérité du manifest ; `generate-manifest.mjs` écrit dist/manifest.json.
 *
 * Permissions minimales :
 * - activeTab : accès temporaire à l'onglet actif au clic sur l'icône (sans host permissions)
 * - scripting : injection à la demande de la fonction d'audit (aucun content script permanent)
 * - storage   : préférences utilisateur (Étape 13) et dernier rapport en cache
 *
 * Aucune `host_permissions` : l'extension ne peut pas lire les pages arbitraires en arrière-plan.
 */

/** @type {{ [key: string]: string }} */
export const ICON_PATHS = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};

/** @returns {Record<string, unknown>} */
export function buildManifest() {
  return {
    manifest_version: 3,
    name: 'A11y Lens',
    version: '0.1.0',
    description:
      "A11y Lens — extension d'audit d'accessibilité : analyse la page active (images sans alt, noms accessibles, titres, contraste…) et affiche un rapport dans la popup.",
    minimum_chrome_version: '116',
    action: {
      default_popup: 'src/popup/index.html',
      default_title: 'A11y Lens — audit d’accessibilité',
      default_icon: ICON_PATHS,
    },
    options_ui: {
      page: 'src/options/index.html',
      open_in_tab: true,
    },
    permissions: ['activeTab', 'scripting', 'storage'],
    icons: ICON_PATHS,
  };
}

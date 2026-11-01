// @ts-check
/**
 * Contrat du manifest V3 de A11y Lens.
 * Permissions minimales : activeTab + scripting uniquement.
 * Aucun content script permanent n'est déclaré : l'audit est injecté à la demande
 * via chrome.scripting (détaillé aux Étapes 3 et 5).
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
      "Audite l'accessibilité de la page active : images sans alt, noms accessibles manquants, titres, contraste, etc.",
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
    permissions: ['activeTab', 'scripting'],
    icons: ICON_PATHS,
  };
}

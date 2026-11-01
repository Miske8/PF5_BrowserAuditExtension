/**
 * Baril d'export des règles MVP (Étape 6).
 * Le registre officiel (src/audit/registry.ts) importe depuis ici pour
 * garder une seule ligne d'ajout par nouvelle règle.
 */

export { imageAltRule } from './image-alt';
export { buttonNameRule } from './button-name';
export { linkNameRule } from './link-name';
export { labelRule } from './label';
export { formFieldNameRule } from './form-field-name';
export { headingOrderRule } from './heading-order';
export { htmlLangRule } from './html-lang';
export { pageTitleRule } from './page-title';
export { tabindexPositiveRule } from './tabindex-positive';
export { ariaHiddenFocusableRule } from './aria-hidden-focusable';
export { duplicateIdRule } from './duplicate-id';
export { landmarksRule } from './landmarks';
export { colorContrastRule } from './color-contrast';

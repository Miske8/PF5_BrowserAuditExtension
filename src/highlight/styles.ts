/**
 * Styles de surlignage injectés dans la page inspectée (fonctionnalité highlight).
 *
 * Contraintes :
 *  - sélecteurs les plus spécifiques possible + `!important` pour vaincre les
 *    styles de la page, sans jamais toucher aux propriétés de mise en page ;
 *  - uniquement un contour (`outline`, qui ne déplace rien) + fond translucide ;
 *  - préfixe `a11y-lens-` unique : zéro collision avec les classes de la page ;
 *  - retiré après quelques secondes par le script (voir content.ts) ;
 *  - respecte `prefers-reduced-motion` (pas d'animation du halo).
 */
export const HIGHLIGHT_CSS = `
.a11y-lens-highlight {
  outline: 3px solid var(--a11y-lens-color, #d32f2f) !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 6px rgb(from var(--a11y-lens-color, #d32f2f) r g b / 0.25) !important;
  background-color: rgb(from var(--a11y-lens-color, #d32f2f) r g b / 0.12) !important;
  animation: a11y-lens-pulse 1s ease-in-out 2;
}
.a11y-lens-highlight--critical { --a11y-lens-color: #d32f2f; }
.a11y-lens-highlight--major     { --a11y-lens-color: #e65100; }
.a11y-lens-highlight--moderate  { --a11y-lens-color: #f9a825; }
.a11y-lens-highlight--minor     { --a11y-lens-color: #1e88e5; }
@keyframes a11y-lens-pulse {
  from { outline-width: 2px; }
  to   { outline-width: 4px; }
}
@media (prefers-reduced-motion: reduce) {
  .a11y-lens-highlight { animation: none !important; }
}
`;

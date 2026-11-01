/**
 * Composant « état » générique de la zone de résultat (Étapes 9 & 12).
 * Utilisé pour : chargement, erreur, vide. L'état « résultats » est rendu
 * par results-view.ts (Étape 10).
 */

import { el, text } from '../../utils/ui';

export interface StateViewOptions {
  /** Id ARIA du conteneur, pour le lien aria-labelledby des titres internes. */
  id: string;
}

/** État de chargement : spinner accessible + live region qui annonce le début d'audit. */
export function loadingState(): HTMLElement {
  return el('div', { class: 'state state--loading', role: 'status' }, [
    el('span', { class: 'spinner', 'aria-hidden': 'true' }),
    el('p', { class: 'state__title' }, [text('Analyse de la page en cours…')]),
    el('p', { class: 'state__hint' }, [
      text("Vérification des règles d'accessibilité en cours."),
    ]),
  ]);
}

/**
 * État erreur (Étape 12) : message clair, action de reprise, code technique
 * visible pour le débogage mais sans jargon imposé à la lecture.
 */
export function errorState(
  title: string,
  message: string,
  onRetry: () => void,
  detail?: string,
): HTMLElement {
  const children: Node[] = [
    el('p', { class: 'state__title' }, [text(title)]),
    el('p', { class: 'state__message' }, [text(message)]),
  ];
  if (detail) {
    children.push(el('p', { class: 'state__detail' }, [text(detail)]));
  }
  const retry = el('button', { type: 'button', class: 'btn btn--primary' }, [
    text('Réessayer'),
  ]);
  retry.addEventListener('click', onRetry);
  children.push(retry);
  return el('div', { class: 'state state--error', role: 'alert' }, children);
}

/** État vide : aucun audit effectué, aucune donnée persistée. */
export function emptyState(onRun: () => void): HTMLElement {
  const run = el('button', { type: 'button', class: 'btn btn--primary' }, [
    text('Analyser la page'),
  ]);
  run.addEventListener('click', onRun);
  return el('div', { class: 'state state--empty' }, [
    el('p', { class: 'state__title' }, [text('Aucun rapport pour le moment')]),
    el('p', { class: 'state__message' }, [
      text(
        "Lancez un audit sur l'onglet actif : A11y Lens vérifie les principales règles d'accessibilité (images, formulaires, navigation, contraste…).",
      ),
    ]),
    run,
  ]);
}

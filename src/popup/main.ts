/**
 * A11y Lens — popup (Étape 9).
 *
 * Machine à états UI volontairement minimale :
 *   idle → loading → done(report) | error(code, message)
 *
 * Règles d'accessibilité appliquées à la popup elle-même :
 *  - la zone de résultat est une `role="region"` nommée par un titre sr-only ;
 *  - une live region `aria-live="polite"` annonce les changements d'état ;
 *  - `aria-busy` reflète l'état de chargement, le bouton est désactivé pendant l'audit ;
 *  - aucun innerHTML avec des données de page : uniquement createElement + textContent.
 */

import { loadLastReport, runAuditOnActiveTab } from '../services/executor';
import { subscribeToAuditEvents } from '../services/audit-events';
import {
  loadPreferences,
  minContrastConfidence,
  preferencesToAuditOptions,
} from '../services/preferences';
import type { AuditRunResult } from '../audit/types';
import type { A11yReport } from '../audit/report-builder';
import { emptyState, errorState, loadingState } from './components/state-views';
import { renderResults } from './components/results-view';
import { el, text, truncate } from '../utils/ui';

export type UiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; report: A11yReport }
  | { kind: 'error'; code: string; message: string };

export interface PopupElements {
  runButton: HTMLButtonElement;
  optionsButton: HTMLButtonElement;
  pageInfo: HTMLParagraphElement;
  resultRegion: HTMLElement;
  resultBody: HTMLElement;
}

/** Raccourcis clavier globaux de la popup (Étape 16). */
const SHORTCUT_MODIFIER = /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl';

/** Libellé canonique du bouton d'audit (sans mention du raccourci). */
export const RUN_BUTTON_LABEL = 'Analyser la page';

/**
 * Met à jour le libellé du bouton « Analyser ».
 * Le raccourci (⌘/Ctrl+Entrée) n'est PAS affiché dans le texte du bouton :
 * il est indiqué dans le `title` et l'aide clavier (`?`) — le texte visible
 * reste identique au libellé accessible (WCAG 2.5.3), sans espace parasite.
 */
export function updateRunButtonLabel(button: HTMLButtonElement, busy: boolean): void {
  button.textContent = busy ? 'Analyse en cours…' : RUN_BUTTON_LABEL;
}

/** Récupère les éléments statiques de la popup (lève si DOM inattendu). */
export function bindElements(root: ParentNode): PopupElements {
  const must = <T extends HTMLElement>(id: string): T => {
    const node = root.querySelector<T>(`#${id}`);
    if (!node) throw new Error(`Popup : élément #${id} manquant.`);
    return node;
  };
  return {
    runButton: must<HTMLButtonElement>('run-audit'),
    optionsButton: must<HTMLButtonElement>('options-btn'),
    pageInfo: must<HTMLParagraphElement>('page-info'),
    resultRegion: must<HTMLElement>('result-region'),
    resultBody: must<HTMLElement>('result-body'),
  };
}

/** Annonce discrète pour lecteurs d'écran (live region sr-only créée à la demande). */
function announce(container: HTMLElement, message: string): void {
  let announcer = container.querySelector<HTMLElement>('[data-a11y-announcer]');
  if (!announcer) {
    announcer = el('div', {
      class: 'sr-only',
      'aria-live': 'polite',
      role: 'status',
      'data-a11y-announcer': 'true',
    });
    container.append(announcer);
  }
  announcer.textContent = message;
}

/** Rend l'état courant dans la zone de résultat. */
export function renderState(
  dom: PopupElements,
  state: UiState,
  actions: { onRun: () => void },
): void {
  dom.resultRegion.setAttribute('aria-busy', String(state.kind === 'loading'));
  dom.runButton.disabled = state.kind === 'loading';
  updateRunButtonLabel(dom.runButton, state.kind === 'loading');

  switch (state.kind) {
    case 'loading':
      dom.resultBody.replaceChildren(loadingState());
      announce(dom.resultRegion, 'Analyse en cours.');
      return;
    case 'done': {
      dom.resultBody.replaceChildren(renderResults(state.report));
      announce(
        dom.resultRegion,
        `Audit terminé : score ${state.report.score.score} sur 100, ${state.report.summary.totalIssues} problème(s) détecté(s).`,
      );
      // Hiérarchie visuelle (Étape 16) : le premier problème critique est
      // dépliable d'emblée pour guider l'attention sans surcharger la vue.
      const firstCritical =
        dom.resultBody.querySelector<HTMLDetailsElement>('.issue--critical');
      if (firstCritical) firstCritical.open = true;
      return;
    }
    case 'error':
      dom.resultBody.replaceChildren(
        errorState(
          "L'audit n'a pas pu aboutir",
          state.message,
          actions.onRun,
          state.code,
        ),
      );
      announce(dom.resultRegion, `Erreur : ${state.message}`);
      return;
    case 'idle':
      dom.resultBody.replaceChildren(emptyState(actions.onRun));
      return;
  }
}

/** Met à jour l'en-tête avec le titre de l'onglet analysé. */
export function updatePageInfo(dom: PopupElements, report: A11yReport): void {
  const label = report.page.title ? truncate(report.page.title, 60) : '(titre absent)';
  dom.pageInfo.hidden = false;
  dom.pageInfo.replaceChildren(
    text('Onglet analysé : '),
    el('strong', {}, [text(label)]),
  );
}

/** Nombre de problèmes critiques ou majeurs d'un rapport (badge d'action). */
export function countCriticalMajor(report: A11yReport): number {
  return report.summary.issues.critical + report.summary.issues.major;
}

/** Traduit un résultat du service en état UI. */
export function toUiState(result: AuditRunResult): UiState {
  if (result.ok) return { kind: 'done', report: result.report };
  return { kind: 'error', code: result.code, message: result.message };
}

/** Boucle principale de la popup. Retourne l'API interne (testable). */
export function initPopup(root: ParentNode = document): {
  run: () => Promise<void>;
  getState: () => UiState;
} {
  const dom = bindElements(root);
  let current: UiState = { kind: 'idle' };

  const setState = (next: UiState): void => {
    current = next;
    renderState(dom, next, { onRun: () => void run() });
    if (next.kind === 'done') updatePageInfo(dom, next.report);
    // Badge d'action : indique si des problèmes critiques/majeurs subsistent.
    const criticalMajor = next.kind === 'done' ? countCriticalMajor(next.report) : 0;
    dom.runButton.classList.toggle('btn--alert', criticalMajor > 0);
    dom.runButton.title =
      criticalMajor > 0
        ? `${criticalMajor} problème(s) critique(s) ou majeur(s) à corriger`
        : `Lancer un nouvel audit (${SHORTCUT_MODIFIER}+Entrée)`;
  };

  async function run(): Promise<void> {
    if (current.kind === 'loading') return; // anti double-clic
    setState({ kind: 'loading' });
    // Les préférences (Étape 13) pilotent le moteur : règles désactivées,
    // niveau de contraste, seuil de confiance du mode développeur.
    const prefs = await loadPreferences();
    const result = await runAuditOnActiveTab({
      ...preferencesToAuditOptions(prefs),
      minContrastConfidence: minContrastConfidence(prefs.sensitivity),
    });
    setState(toUiState(result));
  }

  dom.runButton.addEventListener('click', () => void run());
  dom.optionsButton.addEventListener('click', () => {
    try {
      chrome.runtime.openOptionsPage();
    } catch {
      /* contexte sans chrome (tests) : ignoré */
    }
  });

  // Raccourcis clavier globaux (Étape 16) :
  //   Ctrl/⌘+Entrée → relancer l'audit ; ? → aide raccourcis ; Esc → focus résultat.
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void run();
      return;
    }
    // Aide clavier « ? » : uniquement quand aucune zone éditable n'a le focus
    // (sinon le caractère doit pouvoir être saisi normalement).
    const target = event.target as HTMLElement | null;
    const isEditableTarget =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target?.isContentEditable === true;
    if (event.key === '?' && !isEditableTarget) {
      event.preventDefault();
      announce(
        dom.resultRegion,
        `Raccourcis : ${SHORTCUT_MODIFIER}+Entrée pour analyser, point d'interrogation pour cette aide, Échap pour aller au résultat, Tab pour naviguer, Entrée sur une carte pour la déplier.`,
      );
      return;
    }
    if (event.key === 'Escape') {
      dom.resultRegion.focus();
    }
  });

  // Événements inter-contextes (Étape 16) : un audit lancé ailleurs rafraîchit
  // la popup ouverte et annonce le nouveau rapport aux lecteurs d'écran.
  subscribeToAuditEvents(() => {
    void loadLastReport().then((report) => {
      if (!report || current.kind === 'loading') return;
      setState({ kind: 'done', report });
      announce(dom.resultRegion, 'Nouvel audit terminé : rapport actualisé.');
    });
  });

  // Restauration du dernier rapport connu (état initial utile, sinon vide).
  void loadLastReport().then((last) => {
    if (current.kind !== 'idle') return;
    setState(last ? { kind: 'done', report: last } : { kind: 'idle' });
  });

  return { run, getState: () => current };
}

// Démarrage automatique quand le module est chargé comme entrée de page.
if (typeof document !== 'undefined' && document.getElementById('result-region')) {
  initPopup(document);
}

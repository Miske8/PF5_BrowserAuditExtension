/**
 * Page d'options A11y Lens (Étape 13).
 *
 * Trois réglages persistés dans chrome.storage.local via le service
 * `preferences` : règles activées/désactivées, niveau de contraste AA/AAA,
 * sensibilité « mode développeur ». Les fonctions pures sont exportées pour
 * être testées unitairement.
 */

import { getRules } from '../audit/registry';
import type { AuditRule } from '../rules/rule';
import { SEVERITY_LABELS_FR } from '../core/severity';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type A11yPreferences,
} from '../services/preferences';
import { el, text } from '../utils/ui';

/** Valeurs du formulaire, collectées sans dépendre du DOM (exportée pour tests). */
export interface OptionsFormValue {
  enabledIds: Set<string>;
  allIds: string[];
  contrastLevel: 'AA' | 'AAA';
  developerMode: boolean;
}

/** Convertit l'état du formulaire en préférences (règles cochées → actives). */
export function formValueToPreferences(value: OptionsFormValue): A11yPreferences {
  const disabled = value.allIds.filter((id) => !value.enabledIds.has(id));
  return {
    disabledRuleIds: disabled,
    contrastLevel: value.contrastLevel === 'AAA' ? 'AAA' : 'AA',
    sensitivity: value.developerMode ? 'developer' : 'standard',
  };
}

/** Calcule les ids de règles à cocher depuis des préférences (fonction pure). */
export function checkedRuleIdsFor(
  prefs: A11yPreferences,
  rules: readonly AuditRule[],
): Set<string> {
  const disabled = new Set(prefs.disabledRuleIds);
  return new Set(rules.map((rule) => String(rule.id)).filter((id) => !disabled.has(id)));
}

/** Construit la liste des cases à cocher des règles (fieldset/legend natif). */
export function buildRulesFieldset(
  prefs: A11yPreferences,
  container: HTMLElement,
): { inputs: HTMLInputElement[]; allIds: string[] } {
  const rules = getRules();
  const checked = checkedRuleIdsFor(prefs, rules);
  const inputs: HTMLInputElement[] = [];
  const allIds: string[] = [];

  for (const rule of rules) {
    const id = String(rule.id);
    allIds.push(id);
    const label = el('label', { class: 'rule-option' });
    const input = el('input', { type: 'checkbox', name: 'rules', value: id });
    if (checked.has(id)) input.checked = true;
    label.append(
      input,
      el('span', { class: 'rule-title' }, [text(rule.title)]),
      el('span', { class: `rule-severity sev-${rule.severity}` }, [
        text(SEVERITY_LABELS_FR[rule.severity] ?? rule.severity),
      ]),
    );
    container.append(label);
    inputs.push(input);
  }
  return { inputs, allIds };
}

/** Initialise la page d'options dans un conteneur racine. */
export async function initOptions(root: HTMLElement): Promise<void> {
  const prefs = await loadPreferences();

  const heading = el('h1', {}, [text('A11y Lens — Préférences')]);
  const intro = el('p', { class: 'intro' }, [
    text(
      'Ces réglages sont enregistrés localement dans votre navigateur et appliqués au prochain audit.',
    ),
  ]);

  // --- Règles ---------------------------------------------------------------
  const rulesFieldset = el('fieldset');
  rulesFieldset.append(el('legend', {}, [text('Règles d’audit activées')]));
  const rulesHint = el('p', { class: 'hint' }, [
    text('Décochez une règle si elle génère trop de bruit sur vos pages habituelles.'),
  ]);
  const rulesContainer = el('div', { class: 'rules-list' });
  const { inputs, allIds } = buildRulesFieldset(prefs, rulesContainer);
  rulesFieldset.append(rulesHint, rulesContainer);

  // --- Contraste ------------------------------------------------------------
  const contrastFieldset = el('fieldset');
  contrastFieldset.append(el('legend', {}, [text('Niveau de contraste WCAG')]));
  const radioAA = el('input', { type: 'radio', name: 'contrastLevel', value: 'AA' });
  const radioAAA = el('input', { type: 'radio', name: 'contrastLevel', value: 'AAA' });
  radioAA.checked = prefs.contrastLevel === 'AA';
  radioAAA.checked = prefs.contrastLevel === 'AAA';
  const labelAA = el('label', { class: 'option' }, [
    radioAA,
    text(' AA — seuils standards (4.5:1 / 3:1)'),
  ]);
  const labelAAA = el('label', { class: 'option' }, [
    radioAAA,
    text(' AAA — seuils stricts (7:1 / 4.5:1)'),
  ]);
  contrastFieldset.append(labelAA, labelAAA);

  // --- Mode développeur ------------------------------------------------------
  const devFieldset = el('fieldset');
  devFieldset.append(el('legend', {}, [text('Sensibilité')]));
  const devCheckbox = el('input', { type: 'checkbox', name: 'developerMode' });
  devCheckbox.checked = prefs.sensitivity === 'developer';
  const labelDev = el('label', { class: 'option' }, [
    devCheckbox,
    text(' Mode développeur — afficher aussi les diagnostics de contraste à faible confiance'),
  ]);
  devFieldset.append(labelDev);

  // --- Actions + statut ------------------------------------------------------
  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const saveButton = el('button', { type: 'button', class: 'primary' }, [
    text('Enregistrer les préférences'),
  ]);
  const resetButton = el('button', { type: 'button', class: 'secondary' }, [
    text('Rétablir les valeurs par défaut'),
  ]);

  function collect(): OptionsFormValue {
    const enabledIds = new Set(
      inputs.filter((input) => input.checked).map((input) => input.value),
    );
    return {
      enabledIds,
      allIds,
      contrastLevel: radioAAA.checked ? 'AAA' : 'AA',
      developerMode: devCheckbox.checked,
    };
  }

  async function persist(next: A11yPreferences, message: string): Promise<void> {
    try {
      await savePreferences(next);
      status.textContent = message;
    } catch {
      status.textContent = 'Échec de l’enregistrement (stockage indisponible).';
    }
  }

  saveButton.addEventListener('click', () => {
    void persist(formValueToPreferences(collect()), 'Préférences enregistrées ✓');
  });
  resetButton.addEventListener('click', () => {
    for (const input of inputs) input.checked = true;
    radioAA.checked = true;
    devCheckbox.checked = false;
    void persist({ ...DEFAULT_PREFERENCES }, 'Valeurs par défaut rétablies ✓');
  });

  // Raccourci clavier Ctrl/Cmd+S (pas de <form> : pas de submit navigateur).
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveButton.click();
    }
  });

  const actions = el('div', { class: 'actions' }, [saveButton, resetButton]);
  root.append(heading, intro, rulesFieldset, contrastFieldset, devFieldset, actions, status);
}

// Démarrage automatique quand le module est chargé comme entrée de page.
if (typeof document !== 'undefined') {
  const app = document.getElementById('app');
  if (app) void initOptions(app);
}

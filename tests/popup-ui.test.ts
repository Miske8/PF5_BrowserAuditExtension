/**
 * Tests de la popup UI (Étape 9) — happy-dom, service d'audit mocké.
 * Couvre : structure accessible, machine à états (idle/loading/done/error),
 * rendu des résultats, persistance restaurée, anti double-clic.
 */

import type * as PreferencesModule from '../src/services/preferences';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runAuditOnActiveTab = vi.fn();
const loadLastReport = vi.fn();
const loadPreferences = vi.fn();

vi.mock('../src/services/executor', () => ({
  runAuditOnActiveTab: (...args: unknown[]) => runAuditOnActiveTab(...args),
  loadLastReport: (...args: unknown[]) => loadLastReport(...args),
}));

// Les préférences sont mockées : run() les charge en async avant l'audit.
vi.mock('../src/services/preferences', async (importOriginal) => {
  const actual = await importOriginal<typeof PreferencesModule>();
  return {
    ...actual,
    loadPreferences: () => loadPreferences(),
  };
});

import { initPopup, bindElements, renderState, toUiState } from '../src/popup/main';
import { countCriticalMajor } from '../src/popup/main';
import { documentationUrl } from '../src/popup/components/results-view';
import type { A11yReport } from '../src/audit/report-builder';

const POPUP_HTML = `
  <a class="skip-link" href="#result-region">Aller au résultat</a>
  <header><h1>A11y Lens</h1><p id="page-info" hidden></p></header>
  <div class="toolbar">
    <button id="run-audit" class="btn btn--primary">Analyser la page</button>
    <button id="options-btn" class="btn btn--ghost">Préférences</button>
  </div>
  <main id="result-region" tabindex="-1" aria-labelledby="result-title" role="region">
    <h2 id="result-title" class="sr-only">Résultat de l’audit</h2>
    <div id="result-body"></div>
  </main>`;

function fakeReport(overrides: Partial<A11yReport> = {}): A11yReport {
  return {
    meta: {
      tool: 'A11y Lens',
      version: '0.1.0',
      schemaVersion: '1.0',
      contrastLevel: 'AA',
    },
    url: 'https://example.com/',
    timestamp: '2026-11-01T10:00:00.000Z',
    generatedAt: '2026-11-01T10:00:00.000Z',
    durationMs: 42,
    score: {
      score: 86,
      level: 'good',
      penalty: 14,
      penaltiesBySeverity: { critical: 12, major: 0, moderate: 2, minor: 0 },
      weightedTotal: 14,
      totalOccurrences: 5,
    },
    summary: {
      issues: { critical: 2, major: 0, moderate: 1, minor: 0 },
      occurrences: { critical: 3, major: 0, moderate: 1, minor: 0 },
      totalIssues: 3,
      totalOccurrences: 4,
    },
    rulesStats: {
      total: 13,
      executed: 13,
      passed: 10,
      failed: 3,
      skipped: 0,
      errored: 0,
    },
    rulesExecuted: [],
    issues: [
      {
        ruleId: 'image-alt',
        id: 'image-alt:0',
        title: 'Images sans alt',
        description: 'Des images n’ont pas d’alternative textuelle.',
        recommendation: 'Ajouter un attribut alt significatif ou alt="" si décorative.',
        severity: 'critical',
        category: 'images',
        wcag: 'WCAG 1.1.1 (A)',
        elements: [
          {
            selector: 'body > img',
            tag: 'img',
            snippet: '<img src="x.png">',
            detail: 'alt manquant',
          },
        ],
      },
    ],
    page: { url: 'https://example.com/', title: 'Page test', hasTitle: true },
    errors: [],
    cleanPage: false,
    ...overrides,
  };
}

function setupDom(): HTMLElement {
  document.body.innerHTML = POPUP_HTML;
  return document.body;
}

beforeEach(() => {
  runAuditOnActiveTab.mockReset();
  loadLastReport.mockReset();
  loadLastReport.mockResolvedValue(null);
  loadPreferences.mockReset();
  loadPreferences.mockResolvedValue({
    disabledRuleIds: [],
    contrastLevel: 'AA',
    sensitivity: 'standard',
  });
  runAuditOnActiveTab.mockResolvedValue({ ok: false, code: 'NO_TAB', message: 'stub' });
});

describe('structure accessible de la popup', () => {
  it('la région de résultat est nommée et le lien d’évitement pointe dessus', () => {
    const root = setupDom();
    const dom = bindElements(root);
    expect(dom.resultRegion.getAttribute('role')).toBe('region');
    const titleId = dom.resultRegion.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(root.querySelector(`#${titleId}`)?.textContent).toContain('Résultat');
    const skip = root.querySelector<HTMLAnchorElement>('.skip-link');
    expect(skip?.getAttribute('href')).toBe('#result-region');
  });

  it('bindElements lève sur un DOM incomplet', () => {
    document.body.innerHTML = '<div></div>';
    expect(() => bindElements(document.body)).toThrow(/#run-audit/);
  });
});

describe('machine à états', () => {
  it('état initial vide avec bouton « Analyser la page »', async () => {
    const root = setupDom();
    const popup = initPopup(root);
    await Promise.resolve(); // laisse filer loadLastReport()
    expect(popup.getState().kind).toBe('idle');
    const body = root.querySelector('#result-body')!;
    expect(body.textContent).toContain('Aucun rapport');
    expect(body.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it('restaure le dernier rapport persisté', async () => {
    loadLastReport.mockResolvedValue(fakeReport());
    const root = setupDom();
    const popup = initPopup(root);
    await vi.waitFor(() => expect(popup.getState().kind).toBe('done'));
    expect(root.querySelector('.score__value')?.textContent).toBe('86');
    expect((root.querySelector('#page-info') as HTMLElement | null)?.hidden).toBe(false);
  });

  it('loading → done via clic : aria-busy, bouton désactivé puis résultats', async () => {
    const report = fakeReport();
    let resolveRun: ((r: { ok: true; report: A11yReport }) => void) | undefined;
    runAuditOnActiveTab.mockImplementation(
      () => new Promise((resolve) => (resolveRun = resolve)),
    );
    const root = setupDom();
    const popup = initPopup(root);
    const button = root.querySelector<HTMLButtonElement>('#run-audit')!;
    const region = root.querySelector<HTMLElement>('#result-region')!;

    button.click();
    await Promise.resolve();
    expect(popup.getState().kind).toBe('loading');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
    expect(root.querySelector('.state--loading')).not.toBeNull();

    resolveRun?.({ ok: true, report });
    await vi.waitFor(() => expect(popup.getState().kind).toBe('done'));
    expect(region.getAttribute('aria-busy')).toBe('false');
    expect(button.disabled).toBe(false);
    expect(root.querySelector('.score__value')?.textContent).toBe('86');
    expect(root.querySelector('.issue__title')?.textContent).toContain('Images sans alt');
    expect(root.querySelector('.issue__snippet')?.textContent).toContain('<img');
    expect(root.querySelector('[data-a11y-announcer]')?.textContent).toContain(
      'score 86',
    );
  });

  it('anti double-clic pendant le chargement', async () => {
    runAuditOnActiveTab.mockImplementation(() => new Promise(() => {})); // jamais résolu
    const root = setupDom();
    initPopup(root);
    const button = root.querySelector<HTMLButtonElement>('#run-audit')!;
    button.click();
    await vi.waitFor(() => expect(runAuditOnActiveTab).toHaveBeenCalledTimes(1));
    // Le bouton est désormais désactivé : les clics suivants sont ignorés.
    expect(button.disabled).toBe(true);
    button.click();
    button.click();
    expect(runAuditOnActiveTab).toHaveBeenCalledTimes(1);
    // Filet de sécurité interne (indépendant du DOM) : run() ignore si loading.
    await vi.waitFor(() => expect(button.disabled).toBe(true));
  });

  it('erreur typée rendue avec rôle alert et bouton Réessayer', async () => {
    runAuditOnActiveTab.mockResolvedValue({
      ok: false,
      code: 'UNSUPPORTED_PAGE',
      message: 'Cette page ne peut pas être analysée.',
    });
    const root = setupDom();
    const popup = initPopup(root);
    root.querySelector<HTMLButtonElement>('#run-audit')!.click();
    await vi.waitFor(() => expect(popup.getState().kind).toBe('error'));
    const alert = root.querySelector('.state--error[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('ne peut pas être analysée');
    expect(alert?.textContent).toContain('UNSUPPORTED_PAGE');
    expect(alert?.querySelector('button')?.textContent).toBe('Réessayer');
  });

  it('page saine : message « aucun problème » et score 100', async () => {
    const clean = fakeReport({
      score: { ...fakeReport().score, score: 100, level: 'excellent', penalty: 0 },
      summary: {
        issues: { critical: 0, major: 0, moderate: 0, minor: 0 },
        occurrences: { critical: 0, major: 0, moderate: 0, minor: 0 },
        totalIssues: 0,
        totalOccurrences: 0,
      },
      issues: [],
      cleanPage: true,
    });
    runAuditOnActiveTab.mockResolvedValue({ ok: true, report: clean });
    const root = setupDom();
    const popup = initPopup(root);
    root.querySelector<HTMLButtonElement>('#run-audit')!.click();
    await vi.waitFor(() => expect(popup.getState().kind).toBe('done'));
    expect(root.querySelector('.results--clean')?.textContent).toContain(
      'Aucun problème',
    );
  });
});

describe('toUiState + renderState', () => {
  it('convertit ok/échec du service en états UI', () => {
    const report = fakeReport();
    expect(toUiState({ ok: true, report })).toEqual({ kind: 'done', report });
    const err = toUiState({ ok: false, code: 'UNKNOWN', message: 'pb' });
    expect(err.kind === 'error' && err.code).toBe('UNKNOWN');
  });

  it('renderState idle fournit un bouton qui déclenche onRun', () => {
    const root = setupDom();
    const dom = bindElements(root);
    const onRun = vi.fn();
    renderState(dom, { kind: 'idle' }, { onRun });
    const button = root.querySelector('#result-body button')!;
    button.dispatchEvent(new Event('click'));
    expect(onRun).toHaveBeenCalledTimes(1);
  });
});

describe('finition Étape 16 — vue résultats', () => {
  it('carte de score : barre de pénalité décorative avec segments par sévérité', () => {
    const root = setupDom();
    const dom = bindElements(root);
    renderState(dom, { kind: 'done', report: fakeReport() }, { onRun: () => {} });
    const bar = root.querySelector('.penalty-bar');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
    // pénalités présentes : critique + modéré → 2 segments, pas de segment « clean »
    expect(root.querySelectorAll('.penalty-bar__seg')).toHaveLength(2);
    expect(root.querySelector('.penalty-bar__seg--critical')).not.toBeNull();
    expect(root.querySelector('.penalty-bar__seg--moderate')).not.toBeNull();
  });

  it('page propre : la barre de pénalité affiche le segment « clean »', () => {
    const root = setupDom();
    const dom = bindElements(root);
    const base = fakeReport();
    const clean = fakeReport({
      issues: [],
      score: {
        ...base.score,
        score: 100,
        level: 'excellent',
        penalty: 0,
        penaltiesBySeverity: { critical: 0, major: 0, moderate: 0, minor: 0 },
      },
    });
    renderState(dom, { kind: 'done', report: clean }, { onRun: () => {} });
    expect(root.querySelector('.penalty-bar__seg--clean')).not.toBeNull();
  });

  it('carte de problème : chevron décoratif et actions (copie + documentation)', () => {
    const root = setupDom();
    const dom = bindElements(root);
    renderState(dom, { kind: 'done', report: fakeReport() }, { onRun: () => {} });
    const card = root.querySelector('.issue--critical');
    expect(card).not.toBeNull();
    const chevron = card?.querySelector('.issue__chevron');
    expect(chevron?.getAttribute('aria-hidden')).toBe('true');
    const docLink = card?.querySelector<HTMLAnchorElement>('.issue__doc-link');
    expect(docLink?.href).toContain('w3.org/WAI/WCAG22/Understanding/non-text-content');
    expect(card?.textContent).toContain('Recommandation :');
  });

  it('barre d’exports : trois boutons (JSON, CSV, Markdown)', () => {
    const root = setupDom();
    const dom = bindElements(root);
    renderState(dom, { kind: 'done', report: fakeReport() }, { onRun: () => {} });
    const labels = [...root.querySelectorAll('.exports .btn')].map((b) => b.textContent);
    expect(labels).toEqual(['Exporter JSON', 'Exporter CSV', 'Exporter Markdown']);
  });

  it('le premier problème critique est dépliable d’office après rendu', () => {
    const root = setupDom();
    const dom = bindElements(root);
    renderState(dom, { kind: 'done', report: fakeReport() }, { onRun: () => {} });
    expect(root.querySelector<HTMLDetailsElement>('.issue--critical')?.open).toBe(true);
  });

  it('countCriticalMajor somme critiques et majeurs du résumé', () => {
    expect(countCriticalMajor(fakeReport())).toBe(2); // 2 critiques, 0 majeurs
  });

  it('documentationUrl : aide W3C dérivée du critère WCAG, sinon null', () => {
    const base = fakeReport().issues[0]!;
    expect(documentationUrl(base)).toContain('non-text-content');
    expect(documentationUrl({ ...base, wcag: undefined })).toBeNull();
    expect(documentationUrl({ ...base, helpUrl: 'https://aide.example' })).toBe(
      'https://aide.example',
    );
  });
});

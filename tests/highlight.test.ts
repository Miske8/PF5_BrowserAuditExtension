/**
 * Tests de la fonctionnalité « surlignage dans la page ».
 *
 * Couvre les trois couches :
 *  - le content script injecté (`highlightInPage`) : cycle de vie complet
 *    (classe + attributs data, scrollIntoView, auto-nettoyage, clear, frames) ;
 *  - le service popup (`src/services/highlight`) : construction des cibles,
 *    agrégation multi-frames, messages FR, erreurs typées (chrome mocké) ;
 *  - l'intégration UI : bouton « Surligner » présent seulement quand c'est
 *    possible, callback déclenché.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditIssue } from '../src/types';
import { highlightInPage } from '../src/highlight/content';
import { DEFAULT_HIGHLIGHT_DURATION_MS } from '../src/highlight/contract';

const CLASS_BASE = 'a11y-lens-highlight';
const ATTR_TOKEN = 'data-a11y-lens-token';

// ---------------------------------------------------------------------------
// 1. Content script — exécuté dans un DOM happy-dom réel
// ---------------------------------------------------------------------------

describe('highlightInPage (content script)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = `
      <main>
        <img id="bad" src="a.png">
        <button id="btn2">OK</button>
      </main>`;
  });

  function issueTargets() {
    return [
      { selector: '#bad', severityClass: 'critical' as const, frameId: 0 },
      { selector: '#btn2', severityClass: 'minor' as const, frameId: 0 },
    ];
  }

  it('surligne les cibles trouvées : classe, couleur de sévérité et attribut token', () => {
    const result = highlightInPage({ targets: issueTargets(), durationMs: 4000 });
    expect(result).toEqual({ status: 'highlighted', found: 2, requested: 2 });

    const img = document.querySelector('#bad')!;
    expect(img.classList.contains(CLASS_BASE)).toBe(true);
    expect(img.classList.contains(`${CLASS_BASE}--critical`)).toBe(true);
    expect(img.getAttribute(ATTR_TOKEN)).toMatch(/^\d+-[a-z0-9]+$/);

    const btn = document.querySelector('#btn2')!;
    expect(btn.classList.contains(`${CLASS_BASE}--minor`)).toBe(true);
  });

  it('injecte la feuille de style une seule fois, avec préférence reduced-motion', () => {
    highlightInPage({ targets: issueTargets(), durationMs: 4000 });
    highlightInPage({ targets: issueTargets(), durationMs: 4000 });
    const styles = document.querySelectorAll('#a11y-lens-highlight-style');
    expect(styles).toHaveLength(1);
    expect(styles[0]!.textContent).toContain('prefers-reduced-motion');
  });

  it('retire automatiquement tout après durationMs (aucune modification durable)', async () => {
    vi.useFakeTimers();
    highlightInPage({ targets: issueTargets(), durationMs: 800 });
    expect(document.querySelectorAll(`[${ATTR_TOKEN}]`)).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(900);

    expect(document.querySelectorAll(`[${ATTR_TOKEN}]`)).toHaveLength(0);
    const img = document.querySelector('#bad')!;
    expect(img.className).toBe(''); // aucune classe résiduelle
    expect(img.hasAttribute('data-a11y-lens-duration')).toBe(false);
    vi.useRealTimers();
  });

  it('ne crée et ne supprime aucun élément de la page', () => {
    const before = document.body.innerHTML;
    highlightInPage({ targets: issueTargets(), durationMs: 4000 });
    // Seul le <style> est ajouté dans <head>, jamais dans <body>.
    expect(document.body.innerHTML.replace(/\s+/g, '')).toBe(before.replace(/\s+/g, ''));
  });

  it('un sélecteur invalide ou inexistant ne casse rien (statut not-found)', () => {
    const result = highlightInPage({
      targets: [
        { selector: 'img[[[' /* CSS invalide */, severityClass: 'critical', frameId: 0 },
        { selector: '#absent', severityClass: 'major', frameId: 0 },
      ],
      durationMs: 4000,
    });
    expect(result.status).toBe('not-found');
    expect(result.found).toBe(0);
    expect(result.requested).toBe(2);
  });

  it('scrollIntoView est appelé sur chaque élément trouvé', () => {
    const spy = vi.fn();
    const img = document.querySelector('#bad')!;
    (img as unknown as { scrollIntoView: typeof spy }).scrollIntoView = spy;
    highlightInPage({ targets: issueTargets(), durationMs: 4000 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clear: true retire immédiatement tout surlignage actif', () => {
    highlightInPage({ targets: issueTargets(), durationMs: 30_000 });
    expect(document.querySelectorAll(`[${ATTR_TOKEN}]`)).toHaveLength(2);

    const cleared = highlightInPage({ targets: [], durationMs: 4000, clear: true });
    expect(cleared.status).toBe('cleared');
    expect(document.querySelectorAll(`[${ATTR_TOKEN}]`)).toHaveLength(0);
  });

  it('refuse toute cible ne provenant pas du frame courant (ignored-frame)', () => {
    // Contexte de test : window === window.top → frameId 0. Une cible marquée
    // iframe (-1 ou 3) ne doit JAMAIS être surlignée ici.
    const result = highlightInPage({
      targets: [{ selector: '#bad', severityClass: 'critical', frameId: -1 }],
      durationMs: 4000,
    });
    expect(result.status).toBe('ignored-frame');
    expect(document.querySelectorAll(`[${ATTR_TOKEN}]`)).toHaveLength(0);
  });

  it('une cible sans frameId (rapport ancien) est traitée comme frame principal', () => {
    const result = highlightInPage({
      targets: [{ selector: '#bad', severityClass: 'critical' }],
      durationMs: 4000,
    });
    expect(result.status).toBe('highlighted');
    expect(result.found).toBe(1);
  });

  it('la durée est bornée (500 ms min, 30 s max) pour éviter les fuites', () => {
    vi.useFakeTimers();
    highlightInPage({ targets: issueTargets(), durationMs: 10 }); // trop court
    const img = document.querySelector('#bad')!;
    // Pas nettoyé à 400 ms (minimum réel = 500 ms)…
    vi.advanceTimersByTime(400);
    expect(img.hasAttribute(ATTR_TOKEN)).toBe(true);
    // …mais bien nettoyé à 600 ms.
    vi.advanceTimersByTime(200);
    expect(img.hasAttribute(ATTR_TOKEN)).toBe(false);
    vi.useRealTimers();
  });

  it('utilise la durée par défaut du contrat quand elle est fournie telle quelle', () => {
    expect(DEFAULT_HIGHLIGHT_DURATION_MS).toBe(4000);
    const result = highlightInPage({
      targets: issueTargets(),
      durationMs: DEFAULT_HIGHLIGHT_DURATION_MS,
    });
    expect(result.status).toBe('highlighted');
  });
});

// ---------------------------------------------------------------------------
// 2. Service popup — chrome.scripting mocké
// ---------------------------------------------------------------------------

const executeScript = vi.fn();
const queryTabs = vi.fn();

function makeChromeMock(url = 'https://example.com/'): void {
  (globalThis as Record<string, unknown>).chrome = {
    tabs: {
      query: (opts: unknown, cb?: (tabs: unknown[]) => void) => {
        const promise = Promise.resolve([{ id: 42, url, status: 'complete' }]);
        if (cb) cb([{ id: 42, url, status: 'complete' }]);
        return opts ? promise : promise;
      },
    },
    scripting: { executeScript: executeScript },
    runtime: { lastError: undefined },
  };
}

function sampleIssue(overrides: Partial<AuditIssue> = {}): AuditIssue {
  return {
    ruleId: 'image-alt',
    id: 'image-alt:0',
    title: 'Images sans alt',
    description: '…',
    recommendation: 'Ajouter un alt.',
    severity: 'critical',
    category: 'content',
    elements: [
      { selector: 'body > main:nth-child(1) > img:nth-child(1)', tag: 'img', frameId: 0 },
      { tag: 'img' /* sans sélecteur : non ciblable */ },
    ],
    ...overrides,
  };
}

describe('service highlight (popup → page)', () => {
  beforeEach(() => {
    executeScript.mockReset();
    queryTabs.mockReset();
    delete (globalThis as Record<string, unknown>).chrome;
  });

  it('buildHighlightTargets : uniquement les findings avec sélecteur, frameId propagé', async () => {
    const { buildHighlightTargets } = await import('../src/services/highlight');
    const targets = buildHighlightTargets(sampleIssue());
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({
      selector: 'body > main:nth-child(1) > img:nth-child(1)',
      severityClass: 'critical',
      frameId: 0,
    });
  });

  it('canHighlightIssue : false pour une issue globale sans sélecteur', async () => {
    const { canHighlightIssue } = await import('../src/services/highlight');
    expect(canHighlightIssue(sampleIssue())).toBe(true);
    expect(
      canHighlightIssue({ elements: [{ tag: 'html' }] } as unknown as Parameters<
        typeof canHighlightIssue
      >[0]),
    ).toBe(false);
  });

  it('aggregateHighlightResults : somme des frames et meilleur statut', async () => {
    const { aggregateHighlightResults } = await import('../src/services/highlight');
    expect(
      aggregateHighlightResults([
        { status: 'highlighted', found: 2, requested: 2 },
        { status: 'ignored-frame', found: 0, requested: 2 },
        { status: 'not-found', found: 0, requested: 2 },
      ]),
    ).toEqual({ status: 'highlighted', found: 2, requested: 6 });

    expect(
      aggregateHighlightResults([
        { status: 'not-found', found: 0, requested: 1 },
        { status: 'ignored-frame', found: 0, requested: 1 },
      ]).status,
    ).toBe('ignored-frame');
  });

  it('highlightMessageFr : messages français pour chaque statut', async () => {
    const { highlightMessageFr } = await import('../src/services/highlight');
    expect(highlightMessageFr({ status: 'highlighted', found: 3, requested: 3 })).toContain(
      '3 élément(s) surligné(s)',
    );
    expect(highlightMessageFr({ status: 'not-found', found: 0, requested: 1 })).toContain(
      'Relancez',
    );
    expect(highlightMessageFr({ status: 'ignored-frame', found: 0, requested: 1 })).toContain(
      'iframe',
    );
    expect(highlightMessageFr({ status: 'cleared', found: 0, requested: 0 })).toBe(
      'Surlignage retiré.',
    );
  });

  it('succès : injection allFrames, agrégation des résultats par frame', async () => {
    makeChromeMock();
    executeScript.mockImplementation(
      (_details: unknown, cb: (r: unknown[]) => void) =>
        cb([
          { result: { status: 'highlighted', found: 1, requested: 1 } },
          { result: { status: 'ignored-frame', found: 0, requested: 1 } },
          { error: { message: 'Frame protégée' } }, // frame cross-origin : ignorée
        ]),
    );
    const { highlightIssueElements } = await import('../src/services/highlight');
    const outcome = await highlightIssueElements(sampleIssue());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result).toEqual({ status: 'highlighted', found: 1, requested: 2 });
    }
    const details = executeScript.mock.calls[0]![0] as {
      target: { tabId: number; allFrames: boolean };
      func: unknown;
    };
    expect(details.target).toEqual({ tabId: 42, allFrames: true });
    expect(typeof details.func).toBe('function');
  });

  it('page interne (chrome://) : UNSUPPORTED_PAGE, aucune injection tentée', async () => {
    makeChromeMock('chrome://extensions/');
    const { highlightIssueElements } = await import('../src/services/highlight');
    const outcome = await highlightIssueElements(sampleIssue());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('UNSUPPORTED_PAGE');
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('onglet introuvable : TAB_UNAVAILABLE typé, pas de crash', async () => {
    (globalThis as Record<string, unknown>).chrome = {
      tabs: { query: (_o: unknown, cb: (t: []) => void) => cb([]) },
      scripting: { executeScript: executeScript },
      runtime: { lastError: undefined },
    };
    const { highlightIssueElements } = await import('../src/services/highlight');
    const outcome = await highlightIssueElements(sampleIssue());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('TAB_UNAVAILABLE');
  });

  it('échec d’injection (runtime.lastError) : INJECTION_FAILED, message clair', async () => {
    makeChromeMock();
    executeScript.mockImplementation((_d: unknown, cb: (r: unknown) => void) => {
      (globalThis as Record<string, unknown>).chrome.runtime.lastError = {
        message: 'Cannot access a chrome:// URL',
      };
      cb(undefined);
      (globalThis as Record<string, unknown>).chrome.runtime.lastError = undefined;
    });
    const { highlightIssueElements } = await import('../src/services/highlight');
    const outcome = await highlightIssueElements(sampleIssue());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('INJECTION_FAILED');
  });

  it('issue non surlignable : not-found sans appel à chrome.scripting', async () => {
    makeChromeMock();
    const { highlightIssueElements } = await import('../src/services/highlight');
    const outcome = await highlightIssueElements(
      sampleIssue({ elements: [{ tag: 'html' }] }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.status).toBe('not-found');
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('hors contexte extension (chrome absent) : échec silencieux typé', async () => {
    const { highlightIssueElements } = await import('../src/services/highlight');
    const outcome = await highlightIssueElements(sampleIssue());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('INJECTION_FAILED');
  });
});

// ---------------------------------------------------------------------------
// 3. Intégration UI — bouton « Surligner » dans les cartes de problème
// ---------------------------------------------------------------------------

describe('bouton Surligner dans la vue résultats', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
  });

  async function mount(onHighlight?: (issue: AuditIssue) => void) {
    const { renderResults } = await import('../src/popup/components/results-view');
    const { buildReport } = await import('../src/audit/report-builder');
    const raw = {
      issues: [sampleIssue()],
      page: { url: 'https://example.com/', title: 'T', docLang: 'fr' },
      traces: [],
      errors: [],
      options: { disabledRules: [], contrastLevel: 'AA' as const },
      rulesTotal: 1,
      rulesExecuted: 1,
      startedAt: new Date().toISOString(),
      durationMs: 1,
    };
    const report = buildReport(raw as never);
    const host = document.getElementById('host')!;
    host.replaceChildren(renderResults(report, onHighlight ? { onHighlight } : {}));
    return host;
  }

  it('le bouton apparaît quand l’issue est surlignable et qu’un callback existe', async () => {
    const onHighlight = vi.fn();
    const host = await mount(onHighlight);
    const button = host.querySelector<HTMLButtonElement>('.issue__highlight');
    expect(button).not.toBeNull();
    expect(button!.textContent).toBe('Surligner');
    button!.click();
    expect(onHighlight).toHaveBeenCalledTimes(1);
    expect(onHighlight.mock.calls[0]![0]).toMatchObject({ ruleId: 'image-alt' });
  });

  it('pas de bouton si aucune issue n’est surlignable (findings sans sélecteur)', async () => {
    const host = await mount(vi.fn());
    // L'issue d'exemple a UN finding avec sélecteur → bouton attendu ; on
    // vérifie aussi le cas inverse via renderIssueCard directement.
    expect(host.querySelector('.issue__highlight')).not.toBeNull();

    const { renderIssueCard } = await import('../src/popup/components/results-view');
    const card = renderIssueCard(
      sampleIssue({ elements: [{ tag: 'html' }] }),
      { onHighlight: vi.fn() },
    );
    expect(card.querySelector('.issue__highlight')).toBeNull();
  });

  it('pas de bouton du tout si l’UI ne fournit pas de callback (régression)', async () => {
    const host = await mount(undefined);
    expect(host.querySelector('.issue__highlight')).toBeNull();
    // Les autres actions restent présentes.
    expect(host.textContent).toContain('Copier les détails');
  });
});

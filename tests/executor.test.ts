/**
 * Tests du service d'exécution (Étape 9) — chrome mocké, aucun appel réseau.
 * Couvre : pré-flight pages non analysables, succès d'injection, erreurs
 * typées, persistance best-effort du dernier rapport.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { A11yReport } from '../src/audit/report-builder';

const storageStore = new Map<string, string>();
const executeScript = vi.fn();
const queryTabs = vi.fn();

function makeChromeMock(): void {
  (globalThis as Record<string, unknown>).chrome = {
    tabs: { query: queryTabs },
    scripting: { executeScript: executeScript },
    runtime: {
      lastError: undefined,
      getManifest: () => ({ version: '0.1.0-test' }),
      openOptionsPage: vi.fn(),
    },
    storage: {
      local: {
        get: (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, string> = {};
          for (const k of list) if (storageStore.has(k)) out[k] = storageStore.get(k)!;
          return Promise.resolve(out);
        },
        set: (items: Record<string, string>) => {
          for (const [k, v] of Object.entries(items)) storageStore.set(k, v);
          return Promise.resolve();
        },
      },
    },
  };
}

function tab(url: string, status = 'complete', id = 42): unknown {
  return { id, url, status };
}

/** Faux rapport conforme au garde-fou isA11yReport. */
function fakeReport(): A11yReport {
  return {
    meta: {
      tool: 'A11y Lens',
      version: '0.1.0-test',
      schemaVersion: '1.0',
      contrastLevel: 'AA',
    },
    url: 'https://example.com/',
    timestamp: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    durationMs: 5,
    score: {
      score: 100,
      level: 'excellent',
      penalty: 0,
      penaltiesBySeverity: { critical: 0, major: 0, moderate: 0, minor: 0 },
      weightedTotal: 0,
      totalOccurrences: 0,
    },
    summary: {
      issues: { critical: 0, major: 0, moderate: 0, minor: 0 },
      occurrences: { critical: 0, major: 0, moderate: 0, minor: 0 },
      totalIssues: 0,
      totalOccurrences: 0,
    },
    rulesStats: {
      total: 13,
      executed: 13,
      passed: 13,
      failed: 0,
      skipped: 0,
      errored: 0,
    },
    rulesExecuted: [],
    issues: [],
    page: { url: 'https://example.com/', title: 'OK', hasTitle: true },
    errors: [],
    cleanPage: true,
  };
}

type ExecutorModule = typeof import('../src/services/executor'); // eslint-disable-line @typescript-eslint/consistent-type-imports

async function importExecutor(): Promise<ExecutorModule> {
  vi.resetModules();
  return import('../src/services/executor');
}

beforeEach(() => {
  storageStore.clear();
  executeScript.mockReset();
  queryTabs.mockReset();
  makeChromeMock();
});

describe('isAnalyzableUrl / checkAnalyzable', () => {
  it('accepte http et https uniquement', async () => {
    const exec = await importExecutor();
    expect(exec.isAnalyzableUrl('https://example.com')).toBe(true);
    expect(exec.isAnalyzableUrl('http://localhost:3000')).toBe(true);
    expect(exec.isAnalyzableUrl('chrome://extensions')).toBe(false);
    expect(exec.isAnalyzableUrl('edge://settings')).toBe(false);
    expect(exec.isAnalyzableUrl('file:///tmp/a.html')).toBe(false);
    expect(exec.isAnalyzableUrl(undefined)).toBe(false);
  });

  it('pré-flight UNSUPPORTED_PAGE pour une page chrome://', async () => {
    const exec = await importExecutor();
    const failure = exec.checkAnalyzable(tab('chrome://newtab') as never);
    expect(failure).not.toBeNull();
    expect(failure!.ok).toBe(false);
    if (!failure!.ok) expect(failure!.code).toBe('UNSUPPORTED_PAGE');
  });

  it('pré-flight TAB_UNAVAILABLE si onglet en chargement ou sans id', async () => {
    const exec = await importExecutor();
    const loading = exec.checkAnalyzable(tab('https://a.com', 'loading') as never);
    expect(!loading!.ok && loading!.code).toBe('TAB_UNAVAILABLE');
    const noId = exec.checkAnalyzable({
      url: 'https://a.com',
      status: 'complete',
    } as never);
    expect(!noId!.ok && noId!.code).toBe('TAB_UNAVAILABLE');
    expect(exec.checkAnalyzable(null)).not.toBeNull();
  });
});

describe('runAuditOnActiveTab', () => {
  it('retourne un rapport et le persiste en cas de succès', async () => {
    const report = fakeReport();
    executeScript.mockImplementation((_opts: unknown, cb?: (r: unknown) => void) => {
      const res = [{ result: report, documentId: 'd', frameId: 0 }];
      cb?.(res);
      return Promise.resolve(res);
    });
    queryTabs.mockResolvedValue([tab('https://example.com/')]);

    const exec = await importExecutor();
    const result = await exec.runAuditOnActiveTab();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.score.score).toBe(100);
    // Persistance best-effort dans chrome.storage.local
    expect(storageStore.size).toBeGreaterThan(0);
  });

  it('sans chrome disponible → NO_TAB_ACCESS propre', async () => {
    delete (globalThis as Record<string, unknown>).chrome;
    const exec = await importExecutor();
    const result = await exec.runAuditOnActiveTab();
    expect(!result.ok && result.code).toBe('NO_TAB_ACCESS');
  });

  it('erreur d’injection « Cannot access » → NO_TAB_ACCESS', async () => {
    queryTabs.mockResolvedValue([tab('https://example.com/')]);
    executeScript.mockImplementation((_opts: unknown, cb?: (r: unknown) => void) => {
      (
        globalThis as { chrome: { runtime: { lastError?: { message: string } } } }
      ).chrome.runtime.lastError = {
        message:
          'Cannot access contents of the page. Extension manifest must request permission…',
      };
      cb?.(undefined);
    });
    const exec = await importExecutor();
    const result = await exec.runAuditOnActiveTab();
    expect(!result.ok && result.code).toBe('NO_TAB_ACCESS');
  });

  it('résultat invalide (pas un rapport) → EMPTY_DOCUMENT', async () => {
    queryTabs.mockResolvedValue([tab('https://example.com/')]);
    executeScript.mockImplementation((_opts: unknown, cb?: (r: unknown) => void) => {
      const res = [{ result: null }];
      cb?.(res);
      return Promise.resolve(res);
    });
    const exec = await importExecutor();
    const result = await exec.runAuditOnActiveTab();
    expect(!result.ok && result.code).toBe('EMPTY_DOCUMENT');
  });

  it('les messages d’erreur sont en français et non vides', async () => {
    const exec = await importExecutor();
    for (const message of Object.values(exec.AUDIT_ERROR_MESSAGES_FR)) {
      expect(message.length).toBeGreaterThan(20);
    }
  });
});

describe('loadLastReport', () => {
  it('retourne null sans rapport stocké', async () => {
    const exec = await importExecutor();
    expect(await exec.loadLastReport()).toBeNull();
  });

  it('relit un rapport persisté valide', async () => {
    const report = fakeReport();
    storageStore.set('a11yLens:lastReport', JSON.stringify(report));
    const exec = await importExecutor();
    const loaded = await exec.loadLastReport();
    expect(loaded?.url).toBe('https://example.com/');
  });

  it('ignore une donnée corrompue (JSON invalide)', async () => {
    storageStore.set('a11yLens:lastReport', '{oops');
    const exec = await importExecutor();
    expect(await exec.loadLastReport()).toBeNull();
  });
});

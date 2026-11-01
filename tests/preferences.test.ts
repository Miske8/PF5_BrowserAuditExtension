/**
 * Tests unitaires — préférences et stockage (Étape 14, priorité « préférences »).
 *
 * Valide le contrat de robustesse du service : jamais de throw, toujours des
 * valeurs valides (défauts + sanitisation), migration douce de l'ancien champ
 * `developerMode`, conversion en options moteur consommables par le run d'audit.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  sanitizePreferences,
  preferencesToAuditOptions,
  minContrastConfidence,
} from '../src/services/preferences';

/* Mock minimal de chrome.storage.local (clé -> valeur brute). */
const store = new Map<string, unknown>();
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store.get(key) ?? undefined })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) store.set(k, v);
      }),
    },
  },
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe('sanitizePreferences — données corrompues ou absentes', () => {
  it('retourne les défauts pour null / undefined / non-objet', () => {
    for (const raw of [null, undefined, 42, 'string', []]) {
      expect(sanitizePreferences(raw)).toEqual(DEFAULT_PREFERENCES);
    }
  });

  it('ignore les ids non-string et déduplique disabledRuleIds', () => {
    const out = sanitizePreferences({
      disabledRuleIds: ['image-alt', 7, null, 'image-alt', 'label'],
    });
    expect(out.disabledRuleIds).toEqual(['image-alt', 'label']);
  });

  it('force contrastLevel à AA sauf valeur exactement AAA', () => {
    expect(sanitizePreferences({ contrastLevel: 'AAA' }).contrastLevel).toBe('AAA');
    expect(sanitizePreferences({ contrastLevel: 'A' }).contrastLevel).toBe('AA');
    expect(sanitizePreferences({ contrastLevel: 42 }).contrastLevel).toBe('AA');
  });

  it('migre l’ancien booléen developerMode vers sensitivity=developer', () => {
    expect(sanitizePreferences({ developerMode: true }).sensitivity).toBe('developer');
    expect(sanitizePreferences({ developerMode: false }).sensitivity).toBe('standard');
    expect(sanitizePreferences({ sensitivity: 'developer' }).sensitivity).toBe('developer');
    expect(sanitizePreferences({ sensitivity: 'nimporte' }).sensitivity).toBe('standard');
  });
});

describe('loadPreferences / savePreferences — chrome.storage', () => {
  it('loadPreferences renvoie les défauts quand rien n’est stocké', async () => {
    expect(await loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it('round-trip save → load conserve des préférences valides', async () => {
    const prefs = {
      disabledRuleIds: ['color-contrast'],
      contrastLevel: 'AAA' as const,
      sensitivity: 'developer' as const,
    };
    await savePreferences(prefs);
    expect(await loadPreferences()).toEqual(prefs);
    // L'écriture est sanitisée avant stockage (jamais de données brutes).
    expect(store.size).toBe(1);
  });

  it('une lecture qui lève retourne les défauts sans propager l’erreur', async () => {
    const failing = vi
      .spyOn(chrome.storage.local, 'get')
      .mockRejectedValue(new Error('storage down'));
    expect(await loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    failing.mockRestore();
  });

  it('savePreferences ne throw jamais si le stockage échoue', async () => {
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(new Error('quota'));
    await expect(savePreferences(DEFAULT_PREFERENCES)).resolves.toBeUndefined();
  });

  it('sans chrome.*, tout retombe sur les défauts (contexte de test pur)', async () => {
    const savedChrome = (globalThis as unknown as { chrome: unknown }).chrome;
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
    try {
      expect(await loadPreferences()).toEqual(DEFAULT_PREFERENCES);
      await expect(savePreferences(DEFAULT_PREFERENCES)).resolves.toBeUndefined();
    } finally {
      (globalThis as unknown as { chrome: unknown }).chrome = savedChrome;
    }
  });
});

describe('préférences → moteur d’audit', () => {
  it('preferencesToAuditOptions transmet contraste et règles désactivées', () => {
    const options = preferencesToAuditOptions({
      disabledRuleIds: ['landmarks'],
      contrastLevel: 'AAA',
      sensitivity: 'standard',
    });
    expect(options.contrastLevel).toBe('AAA');
    expect(options.disabledRules).toEqual(['landmarks']);
  });

  it('minContrastConfidence : standard filtre l’incertain, développeur tout affiche', () => {
    expect(minContrastConfidence('standard')).toBeGreaterThanOrEqual(0.5);
    expect(minContrastConfidence('developer')).toBe(0);
  });

  it('les options produites sont acceptées par resolveOptions du moteur', async () => {
    const { runAudit } = await import('../src/audit/audit-engine');
    const { getRules } = await import('../src/audit/registry');
    const doc = new DOMParser().parseFromString(
      '<html lang="fr"><head><title>T</title></head><body><img src="a.png"></body></html>',
      'text/html',
    );
    const prefs = {
      disabledRuleIds: ['image-alt'],
      contrastLevel: 'AA' as const,
      sensitivity: 'standard' as const,
    };
    const output = runAudit(
      doc,
      'https://example.com',
      preferencesToAuditOptions(prefs),
      getRules(),
    );
    // Règle désactivée : aucune issue image-alt, mais trace « skipped ».
    expect(output.issues.every((i) => i.ruleId !== 'image-alt')).toBe(true);
    const trace = output.traces.find((t) => t.ruleId === 'image-alt');
    expect(trace?.status).toBe('skipped');
  });
});

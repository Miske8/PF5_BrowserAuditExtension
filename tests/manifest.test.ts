import { describe, it, expect } from 'vitest';
import { buildManifest } from '../scripts/manifest.config.mjs';

describe('manifest V3', () => {
  const manifest = buildManifest();

  it('utilise Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('demande uniquement les permissions minimales', () => {
    expect(manifest.permissions).toEqual(['activeTab', 'scripting']);
  });

  it('ne déclare aucun content script permanent', () => {
    expect(manifest['content_scripts']).toBeUndefined();
  });

  it('pointe vers la popup et la page d’options', () => {
    const action = manifest.action as Record<string, string>;
    const optionsUi = manifest.options_ui as Record<string, string>;
    expect(action['default_popup']).toBe('src/popup/index.html');
    expect(optionsUi['page']).toBe('src/options/index.html');
  });
});

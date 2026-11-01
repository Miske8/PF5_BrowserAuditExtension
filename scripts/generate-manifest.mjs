#!/usr/bin/env node
// @ts-check
/**
 * Génère le manifest.json de A11y Lens (Manifest V3).
 * Source unique de vérité : scripts/manifest.config.mjs
 * Sortie : dist/manifest.json
 */
import { mkdirFile } from './lib/fs-utils.mjs';
import { buildManifest } from './manifest.config.mjs';

const json = JSON.stringify(buildManifest(), null, 2) + '\n';
await mkdirFile('dist/manifest.json', json);
console.log('✔ manifest.json généré dans dist/');

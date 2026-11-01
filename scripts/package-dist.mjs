#!/usr/bin/env node
/**
 * Étape 15 — Packaging de distribution.
 *
 * Vérifie l'intégrité du build (manifest + tous les chemins référencés présents)
 * puis emballe dist/ dans release/a11y-lens-<version>.zip, prêt pour le
 * Chrome Web Store (le ZIP doit avoir manifest.json à la racine).
 *
 * Zéro dépendance : utilise `zip` si disponible, sinon repli sur une archive
 * .tar.gz via Node, sinon simple copie du dossier (dist/ reste chargeable tel quel).
 *
 * Usage : node scripts/package-dist.mjs   (ou `npm run package`)
 */
import { readFileSync, existsSync, statSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const RELEASE_DIR = join(ROOT, 'release');

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

// 1. dist/ doit exister (build préalable requis)
if (!existsSync(join(DIST, 'manifest.json'))) {
  fail('dist/manifest.json introuvable — lancez d’abord : npm run build');
}

// 2. Lecture et validation basique du manifest
const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) fail('Le manifest n’est pas Manifest V3');
if (!manifest.name || !manifest.version || !manifest.description) {
  fail('manifest.json incomplet (name/version/description requis)');
}

// 3. Tous les fichiers référencés par le manifest doivent exister dans dist/
const referenced = new Set();
for (const icon of Object.values(manifest.icons ?? {})) referenced.add(icon);
for (const icon of Object.values(manifest.action?.default_icon ?? {}))
  referenced.add(icon);
if (manifest.action?.default_popup) referenced.add(manifest.action.default_popup);
if (manifest.options_ui?.page) referenced.add(manifest.options_ui.page);
for (const path of referenced) {
  const abs = join(DIST, path.replace(/^\/+/, ''));
  if (!existsSync(abs)) fail(`Chemin du manifest introuvable dans dist/ : ${path}`);
}

// 4. Nom de l’artefact
const slug = `${manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${manifest.version}`;
mkdirSync(RELEASE_DIR, { recursive: true });
const zipPath = join(RELEASE_DIR, `${slug}.zip`);
rmSync(zipPath, { force: true });

// 5. Compression : `zip` système, repli tar.gz, repli dossier copié
let artefact;
try {
  execSync(`cd "${DIST}" && zip -qr "${zipPath}" . -x '*.DS_Store'`, { stdio: 'pipe' });
  artefact = relative(ROOT, zipPath);
} catch {
  try {
    const tgz = join(RELEASE_DIR, `${slug}.tar.gz`);
    rmSync(tgz, { force: true });
    execSync(`tar -czf "${tgz}" -C "${DIST}" .`, { stdio: 'pipe' });
    artefact = relative(ROOT, tgz);
    console.warn(
      '⚠ `zip` indisponible — archive .tar.gz produite (rezippez avant le Web Store).',
    );
  } catch {
    const dir = join(RELEASE_DIR, slug);
    rmSync(dir, { recursive: true, force: true });
    cpSync(DIST, dir, { recursive: true });
    artefact = relative(ROOT, dir);
    console.warn(
      '⚠ Aucun outil d’archive — dossier copié (chargeable en “extension non empaquetée”).',
    );
  }
}

const artefactAbs = existsSync(zipPath) ? zipPath : join(ROOT, artefact);
const size = (statSync(artefactAbs).size / 1024).toFixed(1);
console.log(`✔ Artefact de release : ${artefact} (${size} Ko)`);
console.log(
  '  Fichiers inclus :',
  [...referenced].sort().join(', '),
  '+ assets JS/CSS de dist/assets/',
);

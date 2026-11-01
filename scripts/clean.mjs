#!/usr/bin/env node
/** Étape 15 — Supprime dist/ et release/ pour un build de production propre. */
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of ['dist', 'release']) {
  rmSync(join(ROOT, dir), { recursive: true, force: true });
  console.log(`✔ ${dir}/ supprimé`);
}

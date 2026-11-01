// @ts-check
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Écrit un fichier en créant les dossiers parents si nécessaire.
 * @param {string} filePath chemin relatif ou absolu
 * @param {string | Buffer} content contenu du fichier
 */
export async function mkdirFile(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

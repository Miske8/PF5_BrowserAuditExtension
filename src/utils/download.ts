/**
 * Utilitaires de téléchargement partagés par les exports (Étape 11).
 *
 * En popup MV3, `URL.createObjectURL` + `<a download>` suffit : pas besoin
 * de chrome.downloads ni de permission supplémentaire.
 */

/** Télécharge un Blob via un lien temporaire révoqué proprement. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Laisse au navigateur le temps d'initier le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Racine de nom de fichier safe dérivée de l'URL auditée. */
export function sanitizeFilenameStem(url: string): string {
  let base = url;
  try {
    const parsed = new URL(url);
    base = `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    // URL relative ou invalide : on part du brut.
  }
  const cleaned = base
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || 'page';
}

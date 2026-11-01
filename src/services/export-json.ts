/**
 * Export JSON du rapport (Étape 11).
 *
 * Le rapport A11y Lens est déjà entièrement sérialisable (contrainte MV3
 * testée à l'Étape 8) : l'export JSON n'est donc qu'une sérialisation
 * lisible + un nom de fichier daté. La validation d'intégrité (`isA11yReport`)
 * est importée depuis le builder pour refuser toute donnée mal formée.
 */

import type { A11yReport } from '../audit/report-builder';
import { isA11yReport } from '../audit/report-builder';
import { downloadBlob, sanitizeFilenameStem } from '../utils/download';

/** Sérialise le rapport en JSON indenté (2 espaces), prêt à copier/coller. */
export function serializeReportJson(report: A11yReport): string {
  if (!isA11yReport(report)) {
    throw new TypeError('Rapport invalide : structure A11yReport non respectée.');
  }
  return JSON.stringify(report, null, 2);
}

/** Nom de fichier daté : a11y-lens-<url>-<YYYY-MM-DD-HHmmss>.json */
export function buildJsonFilename(report: Pick<A11yReport, 'url' | 'timestamp'>): string {
  return `a11y-lens-${sanitizeFilenameStem(report.url)}-${stamp(report.timestamp)}.json`;
}

/** Télécharge le rapport en fichier .json depuis la popup. */
export function exportReportJson(report: A11yReport): void {
  const content = serializeReportJson(report);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, buildJsonFilename(report));
}

/** Horodatage compact utilisé dans les noms de fichiers. */
export function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown-date';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

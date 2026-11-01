/**
 * Export CSV du rapport (Étape 11).
 *
 * Une ligne par OCCURRENCE (élément concerné), avec les colonnes exigées :
 *   ruleId · severity · message · selector · recommendation
 * Complétées par des colonnes utiles sans alourdir : title, wcag, tag,
 * snippet, url, timestamp.
 *
 * Conformité RFC 4180 + BOM UTF-8 pour Excel ; protection anti-injection de
 * formule (cellules commençant par = + - @ sont préfixées d'une apostrophe).
 */

import type { A11yReport } from '../audit/report-builder';
import { isA11yReport } from '../audit/report-builder';
import { SEVERITY_LABELS_FR } from '../core/severity';
import { downloadBlob, sanitizeFilenameStem } from '../utils/download';
import { stamp } from './export-json';

/** En-têtes exactes du CSV (ordre garanti). */
export const CSV_HEADERS = [
  'ruleId',
  'severity',
  'message',
  'selector',
  'recommendation',
  'title',
  'wcag',
  'tag',
  'snippet',
  'url',
  'timestamp',
] as const;

/** Échappe une cellule selon la RFC 4180. */
export function escapeCsvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[";\n\r]/.test(guarded) || guarded !== guarded.trim()) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** Aplatisse le rapport en lignes (une par élément concerné, min. 1 par issue). */
export function reportToCsvRows(report: A11yReport): string[][] {
  const rows: string[][] = [];
  for (const issue of report.issues) {
    // message = détail propre à l'élément si présent, sinon description de l'issue.
    const elements = issue.elements.length > 0 ? issue.elements : [null];
    for (const el of elements) {
      rows.push([
        issue.ruleId,
        SEVERITY_LABELS_FR[issue.severity] ?? issue.severity,
        el?.detail && el.detail.length > 0 ? el.detail : issue.description,
        el?.selector ?? '',
        issue.recommendation,
        issue.title,
        issue.wcag ?? '',
        el?.tag ?? '',
        el?.snippet ?? '',
        report.url,
        report.timestamp,
      ]);
    }
  }
  return rows;
}

/** Sérialise tout le rapport en texte CSV complet (avec BOM). */
export function serializeReportCsv(report: A11yReport): string {
  if (!isA11yReport(report)) {
    throw new TypeError('Rapport invalide : structure A11yReport non respectée.');
  }
  const lines = [CSV_HEADERS.slice(), ...reportToCsvRows(report)].map((cells) =>
    cells.map(escapeCsvCell).join(';'),
  );
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Nom de fichier daté : a11y-lens-<url>-<stamp>.csv */
export function buildCsvFilename(report: Pick<A11yReport, 'url' | 'timestamp'>): string {
  return `a11y-lens-${sanitizeFilenameStem(report.url)}-${stamp(report.timestamp)}.csv`;
}

/** Télécharge le rapport en fichier .csv depuis la popup. */
export function exportReportCsv(report: A11yReport): void {
  const content = serializeReportCsv(report);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, buildCsvFilename(report));
}

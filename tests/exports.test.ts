/**
 * Tests unitaires — exports JSON / CSV / Markdown (Étape 14, priorité « exports »).
 *
 * Valide :
 *  - la sérialisation JSON fidèle + le refus des rapports mal formés ;
 *  - le CSV RFC 4180 : en-têtes exactes exigées par le cahier des charges,
 *    échappement, protection anti-injection de formule, BOM UTF-8, une ligne
 *    par occurrence ;
 *  - le résumé Markdown (structure, troncation à 5 éléments, page propre) ;
 *  - les noms de fichiers datés ;
 *  - copyReportMarkdown avec presse-papiers mocké.
 */

import { describe, expect, it, vi } from 'vitest';
import type { AuditIssue } from '../src/types';
import { runAudit } from '../src/audit/audit-engine';
import { getRules } from '../src/audit/registry';
import { buildReport, type A11yReport } from '../src/audit/report-builder';
import {
  serializeReportJson,
  buildJsonFilename,
  exportReportJson,
  stamp,
} from '../src/services/export-json';
import {
  CSV_HEADERS,
  escapeCsvCell,
  reportToCsvRows,
  serializeReportCsv,
  buildCsvFilename,
  exportReportCsv,
} from '../src/services/export-csv';
import {
  serializeReportMarkdown,
  copyReportMarkdown,
} from '../src/services/export-markdown';

const URL = 'https://example.com/page';
const BASE_RULES = getRules().filter((r) => r.id !== 'color-contrast');

function audit(html: string): A11yReport {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html>${html}`, 'text/html');
  return buildReport(runAudit(doc, URL, {}, BASE_RULES), { version: '0.1.0' });
}

const DIRTY_HTML = `
  <html lang="fr">
    <head><title>Page =sale</title></head>
    <body>
      <img src="a.png" alt="">
      <img src="b.png">
      <button></button>
      <main><h3>Saut de titre</h3><nav aria-label="Menu"><a href="#">Accueil</a></nav></main>
    </body>
  </html>`;

const CLEAN_HTML = `
  <html lang="fr">
    <head><title>Propre</title></head>
    <body>
      <header><nav aria-label="Navigation"><a href="/">Accueil</a></nav></header>
      <main><h1>Bonjour</h1><p>Contenu.</p></main>
      <footer>Pied</footer>
    </body>
  </html>`;

/* ------------------------------------------------------------------ */
/* JSON                                                                */
/* ------------------------------------------------------------------ */

describe('export JSON', () => {
  it('sérialise un rapport valide puis se recharge à l’identique (round-trip)', () => {
    const report = audit(DIRTY_HTML);
    const text = serializeReportJson(report);
    expect(typeof text).toBe('string');
    expect(text.startsWith('{')).toBe(true);
    const parsed = JSON.parse(text) as A11yReport;
    expect(parsed.url).toBe(URL);
    expect(parsed.score.score).toBe(report.score.score);
    expect(parsed.issues.length).toBe(report.issues.length);
    // Indentation 2 espaces (lisible pour revue manuelle).
    expect(text).toContain('\n  "url"');
  });

  it('refuse un objet qui n’est pas un A11yReport (TypeError)', () => {
    expect(() => serializeReportJson({} as A11yReport)).toThrow(TypeError);
    expect(() => serializeReportJson(null as unknown as A11yReport)).toThrow(TypeError);
    expect(() => serializeReportCsv({ url: 'x' } as unknown as A11yReport)).toThrow(
      TypeError,
    );
    expect(() =>
      serializeReportMarkdown({ issues: [] } as unknown as A11yReport),
    ).toThrow(TypeError);
  });

  it('produit un nom de fichier daté safe', () => {
    const report = audit(CLEAN_HTML);
    const name = buildJsonFilename(report);
    expect(name).toMatch(/^a11y-lens-example\.com-page-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
  });

  it('stamp() retombe sur « unknown-date » pour une date invalide', () => {
    expect(stamp('pas-une-date')).toBe('unknown-date');
    expect(stamp('2026-11-01T10:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}$/);
  });
});

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

describe('export CSV', () => {
  it('contient les colonnes exigées en tête (ruleId, severity, message, selector, recommendation)', () => {
    expect(CSV_HEADERS.slice(0, 5)).toEqual([
      'ruleId',
      'severity',
      'message',
      'selector',
      'recommendation',
    ]);
  });

  it('escapeCsvCell applique la RFC 4180', () => {
    expect(escapeCsvCell('simple')).toBe('simple');
    expect(escapeCsvCell('avec "guillemet"')).toBe('"avec ""guillemet"""');
    expect(escapeCsvCell('avec\nretour')).toBe('"avec\nretour"');
    // Les espaces simples ne déclenchent pas le quoting (pas de sens RFC 4180).
    expect(escapeCsvCell('leading space')).toBe('leading space');
    // En revanche un point-virgule (séparateur alternatif Excel FR) force le quoting.
    expect(escapeCsvCell('a;b')).toBe('"a;b"');
  });

  it('escapeCsvCell protège contre l’injection de formule Excel', () => {
    expect(escapeCsvCell('=CMD()')).toBe("'=CMD()");
    expect(escapeCsvCell('+1')).toBe("'+1");
    expect(escapeCsvCell('-2')).toBe("'-2");
    expect(escapeCsvCell('@ref')).toBe("'@ref");
  });

  it('une ligne par occurrence, avec sélecteur et snippet renseignés', () => {
    const report = audit(DIRTY_HTML);
    const rows = reportToCsvRows(report);
    const totalOccurrences = report.issues.reduce(
      (sum, i) => sum + Math.max(i.elements.length, 1),
      0,
    );
    expect(rows.length).toBe(totalOccurrences);
    for (const row of rows) {
      expect(row.length).toBe(CSV_HEADERS.length);
      expect(row[0]).toBeTruthy(); // ruleId jamais vide
    }
    const imgRow = rows.find((r) => r[0] === 'image-alt');
    expect(imgRow?.[3]).toContain('img'); // colonne selector
  });

  it('issue sans élément conserve une ligne (message = description)', () => {
    const report = audit(CLEAN_HTML);
    const fake: AuditIssue = {
      ruleId: 'test-rule',
      id: 'test-rule:0',
      title: 'Sans élément',
      description: 'Description globale',
      recommendation: 'Rien',
      severity: 'minor',
      category: 'document',
      elements: [],
    };
    report.issues.push(fake);
    const rows = reportToCsvRows(report);
    const orphan = rows.find((r) => r[0] === 'test-rule');
    expect(orphan).toBeDefined();
    expect(orphan?.[2]).toBe('Description globale');
    expect(orphan?.[3]).toBe('');
  });

  it('fichier complet : BOM UTF-8, CRLF, en-tête + lignes', () => {
    const csv = serializeReportCsv(audit(DIRTY_HTML));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\r\n');
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(CSV_HEADERS.join(';'));
    expect(lines.at(-2)).toBeTruthy(); // dernière ligne de données non vide
    expect(lines.at(-1)).toBe(''); // terminee par un CRLF
  });

  it('nom de fichier CSV daté et sanitized', () => {
    const name = buildCsvFilename(audit(CLEAN_HTML));
    expect(name).toMatch(/^a11y-lens-[\w.-]+-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/);
    expect(name).not.toContain('=');
  });

  it('exportReportJson/Csv déclenchent un téléchargement depuis la popup', () => {
    // `URL` du module étant une string locale, on patche l'objet global URL.
    const UrlCtor = globalThis.URL as unknown as {
      createObjectURL: (b: Blob) => string;
      revokeObjectURL: (u: string) => void;
    };
    const objectUrl = 'blob:mock';
    const originalCreate = UrlCtor.createObjectURL;
    const originalRevoke = UrlCtor.revokeObjectURL;
    UrlCtor.createObjectURL = () => objectUrl;
    const revoke = vi.fn();
    UrlCtor.revokeObjectURL = revoke;

    const clicks: Array<{ href: string; download: string }> = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.download });
    };

    try {
      const report = audit(DIRTY_HTML);
      exportReportJson(report);
      exportReportCsv(report);

      expect(clicks).toHaveLength(2);
      expect(clicks[0]!.href).toBe(objectUrl);
      expect(clicks[0]!.download).toMatch(/\.json$/);
      expect(clicks[1]!.download).toMatch(/\.csv$/);
      expect(revoke).not.toHaveBeenCalled(); // révocation différée (setTimeout)
    } finally {
      UrlCtor.createObjectURL = originalCreate;
      UrlCtor.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });
});

/* ------------------------------------------------------------------ */
/* Markdown                                                            */
/* ------------------------------------------------------------------ */

describe('résumé Markdown', () => {
  it('structure complète : titre, score, tableau par sévérité, problèmes', () => {
    const md = serializeReportMarkdown(audit(DIRTY_HTML));
    expect(md).toContain("# Rapport d'accessibilité");
    expect(md).toContain(`**Score A11y Lens** : ${audit(DIRTY_HTML).score.score}/100`);
    expect(md).toContain('## Résumé par sévérité');
    expect(md).toContain('| Sévérité | Problèmes | Occurrences |');
    expect(md).toContain('## Problèmes (');
    expect(md).toContain('**Recommandation :**');
    expect(md).toContain('Généré par A11y Lens');
  });

  it('page propre : mention explicite « aucun problème »', () => {
    const md = serializeReportMarkdown(audit(CLEAN_HTML));
    expect(md).toContain('Aucun problème détecté');
    expect(md).not.toContain('## Problèmes (');
  });

  it('tronque la liste d’éléments à 5 avec renvoi vers l’export complet', () => {
    const report = audit(CLEAN_HTML);
    report.issues.push({
      ruleId: 'image-alt',
      id: 'image-alt:0',
      title: 'Images sans alt',
      description: 'd',
      recommendation: 'r',
      severity: 'critical',
      category: 'images',
      elements: Array.from({ length: 7 }, (_, i) => ({
        selector: `img:nth-of-type(${i})`,
        tag: 'img',
        snippet: '<img>',
      })),
    });
    const md = serializeReportMarkdown(report);
    expect(md).toContain('2 élément(s) de plus');
  });

  it('copyReportMarkdown écrit le texte dans le presse-papiers', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    const ok = await copyReportMarkdown(audit(DIRTY_HTML));
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    const written = writeText.mock.calls[0]?.[0] as string;
    expect(written).toContain('# Rapport');
  });

  it('copyReportMarkdown retourne false si clipboard ET execCommand échouent', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
      writable: true,
    });
    document.execCommand = () => false;
    const ok = await copyReportMarkdown(audit(CLEAN_HTML));
    expect(ok).toBe(false);
  });
});

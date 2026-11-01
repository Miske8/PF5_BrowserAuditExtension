/**
 * Résumé Markdown du rapport (Étape 11) — copie presse-papiers.
 *
 * Format pensé pour être collé tel quel dans un ticket GitLab/GitHub ou un
 * compte-rendu d'audit : score, tableau par sévérité, liste des problèmes
 * avec sélecteurs et recommandations.
 */

import type { A11yReport } from '../audit/report-builder';
import { isA11yReport } from '../audit/report-builder';
import { SEVERITY_LABELS_FR } from '../core/severity';
import type { Severity } from '../types';

const SEVERITY_ORDER: Severity[] = ['critical', 'major', 'moderate', 'minor'];

/** Génère le résumé Markdown complet du rapport. */
export function serializeReportMarkdown(report: A11yReport): string {
  if (!isA11yReport(report)) {
    throw new TypeError('Rapport invalide : structure A11yReport non respectée.');
  }
  const out: string[] = [];
  out.push(`# Rapport d'accessibilité — ${report.page.title || report.url}`);
  out.push('');
  out.push(`- **Page** : <${report.url}>`);
  out.push(`- **Date** : ${report.timestamp}`);
  out.push(
    `- **Score A11y Lens** : ${report.score.score}/100 (${report.score.level.toUpperCase()})`,
  );
  out.push(
    `- **Outil** : ${report.meta.tool} v${report.meta.version} (schéma ${report.meta.schemaVersion})`,
  );
  out.push('');

  out.push('## Résumé par sévérité');
  out.push('');
  out.push('| Sévérité | Problèmes | Occurrences |');
  out.push('| --- | --: | --: |');
  for (const sev of SEVERITY_ORDER) {
    out.push(
      `| ${SEVERITY_LABELS_FR[sev]} | ${report.summary.issues[sev]} | ${report.summary.occurrences[sev]} |`,
    );
  }
  out.push('');

  if (report.issues.length === 0) {
    out.push('✅ Aucun problème détecté par les règles activées.');
    out.push('');
  } else {
    out.push(`## Problèmes (${report.issues.length})`);
    out.push('');
    for (const issue of report.issues) {
      out.push(
        `### ${SEVERITY_LABELS_FR[issue.severity]} — ${issue.title} (\`${issue.ruleId}\`)`,
      );
      out.push('');
      out.push(issue.description);
      if (issue.wcag) out.push('', `*Critère : ${issue.wcag}*`);
      out.push('', '**Éléments concernés :**');
      for (const el of issue.elements.slice(0, 5)) {
        out.push(`- \`${el.selector}\` — \`${el.snippet}\``);
      }
      if (issue.elements.length > 5) {
        out.push(
          `- … ${issue.elements.length - 5} élément(s) de plus (voir l'export JSON/CSV)`,
        );
      }
      out.push('', `**Recommandation :** ${issue.recommendation}`);
      out.push('');
    }
  }

  out.push('---');
  out.push(
    `_Généré par A11y Lens — audit local, aucune donnée envoyée hors du navigateur._`,
  );
  return out.join('\n');
}

/** Copie le résumé dans le presse-papiers (API clipboard + repli execCommand). */
export async function copyReportMarkdown(report: A11yReport): Promise<boolean> {
  const text = serializeReportMarkdown(report);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Repli popup (contexte parfois restreint) : textarea + execCommand.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

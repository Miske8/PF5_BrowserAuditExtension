/**
 * Rendu des résultats d'un audit dans la popup (Étape 10).
 *
 * Contient :
 *  - le score global (gauge + niveau, accessible via aria-live sur le conteneur) ;
 *  - le résumé par sévérité ;
 *  - la liste des problèmes triée par sévérité décroissante, chaque problème
 *    étant une carte dépliable (<details>) avec description, éléments HTML
 *    concernés et recommandation.
 */

import type { A11yReport } from '../../audit/report-builder';
import type { AuditIssue, Severity } from '../../types';
import { SEVERITY_LABELS_FR, SEVERITY_ORDER } from '../../core/severity';
import { el, text, formatDateTimeFr, formatDuration } from '../../utils/ui';

const SEVERITIES: Severity[] = ['critical', 'major', 'moderate', 'minor'];

/** Carte de score : chiffre + niveau + métadonnées techniques discrètes. */
export function renderScoreCard(report: A11yReport): HTMLElement {
  const card = el('section', { class: `score score--${report.score.level}` }, [
    el('p', { class: 'score__value' }, [text(String(report.score.score))]),
    el('div', { class: 'score__meta' }, [
      el('p', { class: 'score__label' }, [
        text(`Score / 100 · niveau ${levelLabel(report.score.level)}`),
      ]),
      // Barre de pénalité (Étape 16) : poids visuel des sévérités présentes,
      // décorative — les compteurs textuels du résumé restent la source d'info.
      renderPenaltyBar(report),
    ]),
  ]);
  return card;
}

/** Mini-barre empilée montrant la répartition des pénalités par sévérité. */
function renderPenaltyBar(report: A11yReport): HTMLElement {
  const bar = el('div', { class: 'penalty-bar', 'aria-hidden': 'true' });
  for (const severity of SEVERITIES) {
    const penalty = report.score.penaltiesBySeverity[severity];
    if (!penalty || penalty <= 0) continue;
    bar.append(
      el('span', {
        class: `penalty-bar__seg penalty-bar__seg--${severity}`,
        style: `flex-grow: ${penalty}`,
      }),
    );
  }
  if (bar.children.length === 0) {
    bar.append(el('span', { class: 'penalty-bar__seg penalty-bar__seg--clean' }));
  }
  return bar;
}

/** Résumé par sévérité : compteurs cliquables (filtre rapide à l'étape 16). */
export function renderSeveritySummary(report: A11yReport): HTMLElement {
  const list = el('ul', { class: 'summary', role: 'list' });
  for (const severity of SEVERITIES) {
    const count = report.summary.issues[severity];
    const occurrences = report.summary.occurrences[severity];
    const li = el('li', { class: `summary__item summary__item--${severity}` }, [
      el('span', { class: 'summary__count' }, [text(String(count))]),
      el('span', { class: 'summary__label' }, [text(SEVERITY_LABELS_FR[severity])]),
      el('span', { class: 'summary__detail' }, [
        text(occurrences > 0 ? `${occurrences} élément(s)` : 'aucun'),
      ]),
    ]);
    list.append(li);
  }
  return el('section', { class: 'summary-section' }, [
    el('h2', { class: 'section-title' }, [text('Problèmes par sévérité')]),
    list,
  ]);
}

/** Liste complète des problèmes du rapport. */
export function renderIssuesList(report: A11yReport): HTMLElement {
  if (report.issues.length === 0) {
    return el('section', { class: 'results results--clean' }, [
      el('p', { class: 'results__empty' }, [
        text('Aucun problème détecté sur les règles vérifiées.'),
      ]),
    ]);
  }
  const list = el('ol', { class: 'issues-list' });
  for (const issue of report.issues) {
    list.append(renderIssueCard(issue));
  }
  return el('section', { class: 'results' }, [
    el('h2', { class: 'section-title' }, [text('Détail des problèmes')]),
    list,
  ]);
}

/** Une carte de problème : titre, sévérité, description, éléments, reco. */
export function renderIssueCard(issue: AuditIssue): HTMLElement {
  const details = el('details', { class: `issue issue--${issue.severity}` });
  const summary = el('summary', { class: 'issue__header' }, [
    el('span', { class: `badge badge--${issue.severity}` }, [
      text(SEVERITY_LABELS_FR[issue.severity]),
    ]),
    el('span', { class: 'issue__title' }, [text(issue.title)]),
    el('span', { class: 'issue__count' }, [
      text(`${issue.elements.length || 1} élément(s)`),
    ]),
    // Chevron décoratif (Étape 16) : l'indicateur d'état ouvert/fermé est
    // aussi conveyed par la rotation CSS et le texte du résumé natif.
    el('span', { class: 'issue__chevron', 'aria-hidden': 'true' }, [text('▾')]),
  ]);
  details.append(summary);

  const body = el('div', { class: 'issue__body' });
  body.append(el('p', { class: 'issue__description' }, [text(issue.description)]));

  if (issue.overlapsOtherRule === true) {
    body.append(
      el('p', { class: 'issue__overlap' }, [
        text(
          'Cet élément est aussi signalé par une autre règle : une seule correction peut résoudre plusieurs constats.',
        ),
      ]),
    );
  }

  if (issue.elements.length > 0) {
    const list = el('ul', { class: 'issue__elements' });
    for (const finding of issue.elements) {
      const item = el('li', { class: 'issue__element' });
      if (finding.tag) {
        item.append(el('code', { class: 'issue__tag' }, [text(finding.tag)]));
      }
      if (finding.selector) {
        item.append(el('code', { class: 'issue__selector' }, [text(finding.selector)]));
      }
      if (finding.snippet) {
        item.append(el('pre', { class: 'issue__snippet' }, [text(finding.snippet)]));
      }
      if (finding.detail) {
        item.append(el('p', { class: 'issue__detail' }, [text(finding.detail)]));
      }
      list.append(item);
    }
    body.append(list);
  }

  body.append(
    el('p', { class: 'issue__recommendation' }, [
      el('strong', {}, [text('Recommandation : ')]),
      text(issue.recommendation),
    ]),
  );

  if (issue.wcag) {
    body.append(el('p', { class: 'issue__wcag' }, [text(issue.wcag)]));
  }

  const actions = el('div', { class: 'issue__actions' });
  const copyButton = el('button', { type: 'button', class: 'btn btn--ghost' }, [
    text('Copier les détails'),
  ]);
  copyButton.addEventListener('click', () => {
    void copyIssueDetails(issue);
    copyButton.textContent = 'Copié ✓';
    window.setTimeout(() => {
      copyButton.textContent = 'Copier les détails';
    }, 2000);
  });
  actions.append(copyButton);

  const docUrl = documentationUrl(issue);
  if (docUrl) {
    actions.append(
      el(
        'a',
        {
          class: 'btn btn--ghost issue__doc-link',
          href: docUrl,
          target: '_blank',
          rel: 'noreferrer',
        },
        [text('Documentation')],
      ),
    );
  }
  body.append(actions);

  details.append(body);
  return details;
}

/** Copie les détails d'une issue dans le presse-papiers (repli silencieux). */
async function copyIssueDetails(issue: AuditIssue): Promise<void> {
  const lines = [
    `[${SEVERITY_LABELS_FR[issue.severity]}] ${issue.title} (${issue.ruleId})`,
    issue.description,
    ...issue.elements.map(
      (element) => `  • ${element.selector ?? element.tag ?? 'élément'} ${element.snippet ?? ''}`.trimEnd(),
    ),
    `Recommandation : ${issue.recommendation}`,
    issue.wcag ? `Référence : ${issue.wcag}` : '',
    documentationUrl(issue) ? `Documentation : ${documentationUrl(issue)}` : '',
  ].filter(Boolean);
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
  } catch {
    /* presse-papiers indisponible (contexte sans permission) : on ignore */
  }
}

/** URL de documentation d'une issue (Étape 16) : helpUrl sinon critère WCAG W3C. */
export function documentationUrl(issue: AuditIssue): string | null {
  if (issue.helpUrl) return issue.helpUrl;
  const match = /WCAG\s+(\d+(?:\.\d+)?)/i.exec(issue.wcag ?? '');
  const criterion = match?.[1];
  if (!criterion) return null;
  return `https://www.w3.org/WAI/WCAG22/Understanding/${wcagSlug(criterion)}/`;
}

/** Convertit un numéro de critère WCAG en slug « Understanding » (ex: 1.1.1 → non-text-content). */
const WCAG_SLUGS: Record<string, string> = {
  '1.1.1': 'non-text-content',
  '1.3.1': 'info-and-relationships',
  '2.1.1': 'keyboard',
  '2.4.2': 'page-titled',
  '2.4.3': 'focus-order',
  '2.4.4': 'link-purpose-in-context',
  '2.4.6': 'headings-and-labels',
  '3.1.1': 'language-of-page',
  '3.3.2': 'labels-or-instructions',
  '4.1.2': 'name-role-value',
};

function wcagSlug(criterion: string): string {
  return WCAG_SLUGS[criterion] ?? `criteria-${criterion.replace(/\./g, '-')}`;
}

/** Assemblage complet de la vue « résultats ». */
export function renderResults(report: A11yReport): DocumentFragment {
  const fragment = document.createDocumentFragment();

  fragment.append(renderScoreCard(report));
  fragment.append(
    el('p', { class: 'meta' }, [
      text(
        `Audit du ${formatDateTimeFr(report.timestamp)} · ${formatDuration(report.durationMs)} · ${report.rulesStats.executed}/${report.rulesStats.total} règles`,
      ),
    ]),
  );
  fragment.append(renderSeveritySummary(report));
  fragment.append(renderIssuesList(report));

  // Actions d'export (Étape 16) : les services purs sont chargés paresseusement
  // pour garder le premier rendu de la popup léger.
  fragment.append(
    el('div', { class: 'exports' }, [
      exportButton('JSON', () => importExport('json', report)),
      exportButton('CSV', () => importExport('csv', report)),
      exportButton('Markdown', () => importExport('markdown', report)),
    ]),
  );

  return fragment;
}

/** Bouton d'export (type ghost, libellé explicite « Exporter … »). */
function exportButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'btn btn--ghost' }, [
    text(`Exporter ${label}`),
  ]);
  button.addEventListener('click', onClick);
  return button;
}

/** Charge à la demande le service d'export correspondant puis l'exécute. */
async function importExport(
  format: 'json' | 'csv' | 'markdown',
  report: A11yReport,
): Promise<void> {
  if (format === 'json') {
    const { exportReportJson } = await import('../services/export-json');
    exportReportJson(report);
  } else if (format === 'csv') {
    const { exportReportCsv } = await import('../services/export-csv');
    exportReportCsv(report);
  } else {
    const { copyReportMarkdown } = await import('../services/export-markdown');
    await copyReportMarkdown(report);
  }
}

function levelLabel(level: string): string {
  switch (level) {
    case 'excellent':
      return 'excellent';
    case 'good':
      return 'bon';
    case 'average':
      return 'moyen';
    default:
      return 'faible';
  }
}

// Ré-exporte l'ordre pour que l'UI puisse réordonner si besoin sans dépendance directe.
export { SEVERITY_ORDER };

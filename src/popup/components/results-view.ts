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
    el('p', { class: 'score__label' }, [
      text(`Score / 100 · niveau ${levelLabel(report.score.level)}`),
    ]),
  ]);
  return card;
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
  ]);
  details.append(summary);

  const body = el('div', { class: 'issue__body' });
  body.append(el('p', { class: 'issue__description' }, [text(issue.description)]));

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

  details.append(body);
  return details;
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

  return fragment;
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

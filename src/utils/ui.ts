/**
 * Utilitaires DOM partagés par l'UI de la popup (Étape 9).
 * Style « createElement only » : pas d'innerHTML avec des données de page.
 */

/** Fabrique typée d'un élément HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name.startsWith('on')) continue; // jamais de gestionnaires inline
    node.setAttribute(name, value);
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

/** Noeud texte. */
export function text(value: string): Text {
  return document.createTextNode(value);
}

/** Vide un conteneur et y insère les enfants donnés. */
export function replaceChildren(container: HTMLElement, ...children: Node[]): void {
  container.replaceChildren(...children);
}

/** Formate une date ISO en date/heure locale fr-FR (ex: 1 nov. 2026, 14:32). */
export function formatDateTimeFr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Formate une durée en ms de façon lisible ("12 ms", "1,4 s"). */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(ms / 1000)} s`;
}

/** Tronque proprement un texte long (titre de page dans l'en-tête). */
export function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Utilitaires DOM pour les règles d'audit et le moteur (Étapes 5-7).
 *
 * Fonctions pures opérant sur un Document : testables avec happy-dom,
 * aucune dépendance aux API chrome.*.
 */

/** Attributs qui identifient un élément — utilisés pour construire un sélecteur stable. */
const IDENTIFYING_ATTRS = [
  'id',
  'name',
  'role',
  'href',
  'src',
  'type',
  'alt',
  'aria-label',
] as const;

/** Échappe un valeur pour un sélecteur CSS de type [attr="v"] (guillemets + backslashes). */
export function escapeCssValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Sélecteur CSS heuristique simple : balise + attributs identifiants éventuels. */
export function buildTagSelector(el: Element): string {
  let selector = el.tagName.toLowerCase();
  for (const attr of IDENTIFYING_ATTRS) {
    const value = el.getAttribute(attr);
    if (value !== null && value !== '') {
      selector += `[${attr}="${escapeCssValue(value)}"]`;
    }
  }
  return selector;
}

/**
 * Construit un sélecteur CSS « de chemin » (nth-child) permettant de retrouver
 * approximativement l'élément dans la page : `body > div:nth-of-type(2) > img`.
 * Borné à `maxDepth` ancêtres pour rester lisible.
 */
export function cssPath(el: Element, maxDepth = 4): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && parts.length < maxDepth && current.tagName.toLowerCase() !== 'html') {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    const tag = current.tagName.toLowerCase();
    const sameTag = Array.from(parent.children).filter(
      (c) => c.tagName === current?.tagName,
    );
    if (sameTag.length > 1) {
      const index = sameTag.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
    } else {
      parts.unshift(tag);
    }
    current = parent;
  }
  if (parts.length === 0) {
    return buildTagSelector(el);
  }
  return parts.join(' > ');
}

/** Tronque une chaîne proprement (avec ellipse) — utilisé pour les extraits HTML. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/**
 * Extrait HTML borné d'un élément, prêt à afficher :
 *  - uniquement la balise ouvrante (+ enfants textuels courts), jamais tout le subtree ;
 *  - tronqué à `maxLength` caractères.
 * L'échappement est laissé à l'UI (qui doit insérer du texte, pas de l'HTML).
 */
export function elementSnippet(el: Element, maxLength = 120): string {
  const outer = el.outerHTML;
  // Cas simple : balise sans enfants -> outerHTML complet, souvent court.
  if (el.children.length === 0) {
    return truncate(outer, maxLength);
  }
  // Sinon : on garde la balise ouvrante seule + indice sur le contenu.
  const match = /^<[^>]*>/.exec(outer);
  const openTag = match ? match[0] : `<${el.tagName.toLowerCase()}>`;
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const suffix = text ? `…>${truncate(text, 40)}</${el.tagName.toLowerCase()}>` : '…';
  return truncate(openTag + suffix, maxLength);
}

/** Vrai si l'élément a un attribut non vide. */
export function hasNonEmptyAttr(el: Element, name: string): boolean {
  const value = el.getAttribute(name);
  return value !== null && value.trim() !== '';
}

/** Nom accessible calculé à la volée (WCAG accName, simplifié) pour boutons/liens/champs. */
export function accessibleName(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim() !== '') return ariaLabel.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const doc = el.ownerDocument;
    if (doc) {
      const texts = labelledBy
        .split(/\s+/)
        .map((id) => doc.getElementById(id))
        .filter((node): node is HTMLElement => node !== null)
        .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter((t) => t !== '');
      if (texts.length > 0) return texts.join(' ');
    }
  }

  const title = el.getAttribute('title');
  if (title && title.trim() !== '') return title.trim();

  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

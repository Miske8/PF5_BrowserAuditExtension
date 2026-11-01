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

/** Rôles ARIA explicites portant une sémantique de lien ou de bouton. */
const LINK_ROLES = ['link', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'treeitem'];
const BUTTON_ROLES = ['button', 'submit', 'reset'];

/** Balises formables natives (HTMLFormElement.elements n'existe pas sur les documents happy-dom : on s'appuie sur les balises). */
export const FORM_FIELD_TAGS = new Set([
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'BUTTON',
  'OUTPUT',
  'FIELDSET',
]);

/** Vrai si l'élément est un lien (<a href> ou role="link"…). */
export function isLinkElement(el: Element): boolean {
  if (el.tagName === 'A') return el.hasAttribute('href');
  const role = el.getAttribute('role');
  return role !== null && LINK_ROLES.includes(role.toLowerCase());
}

/** Vrai si l'élément est un bouton (<button> ou role="button"…). */
export function isButtonElement(el: Element): boolean {
  if (el.tagName === 'BUTTON') return true;
  const role = el.getAttribute('role');
  return role !== null && BUTTON_ROLES.includes(role.toLowerCase());
}

/** Champ de formulaire « étiquetable » : input (hors boutons cachés), select, textarea. */
export function isFormFieldElement(el: Element): boolean {
  const tag = el.tagName.toUpperCase();
  if (tag === 'SELECT' || tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  const type = (el.getAttribute('type') ?? 'text').toLowerCase();
  // Types non étiquetables au sens WCAG 1.3.1/3.3.2 (boutons natifs, conteneurs).
  return !['button', 'submit', 'reset', 'image', 'hidden'].includes(type);
}

/**
 * Résout le <label> associé nativement à un champ (WCAG « label ») :
 *  1. `<label for="id">` pointant vers le champ ;
 *  2. `<label>` ancêtre enveloppant le champ.
 * Retourne null si aucune association native n'existe (aria-label ne compte pas ici).
 */
export function findAssociatedLabel(field: Element): Element | null {
  const doc = field.ownerDocument;
  const id = field.getAttribute('id');
  if (doc && id && id.trim() !== '') {
    const byFor = doc.querySelector(`label[for="${escapeCssValue(id.trim())}"]`);
    if (byFor) return byFor;
  }
  let ancestor: Element | null = field.parentElement;
  while (ancestor) {
    if (ancestor.tagName === 'LABEL') return ancestor;
    ancestor = ancestor.parentElement;
  }
  return null;
}

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

/**
 * Nom accessible calculé à la volée (algorithme WCAG accName, simplifié).
 * Ordre de priorité : aria-label → aria-labelledby → <label> associé natif →
 * title → contenu textuel (images : alt en dernier recours si l'UI le demande).
 */
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

  // Association native <label for>/englobant — pertinent pour les champs.
  const label = findAssociatedLabel(el);
  if (label) {
    const labelText = (label.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (labelText !== '') return labelText;
  }

  const title = el.getAttribute('title');
  if (title && title.trim() !== '') return title.trim();

  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Vrai si l'élément est nativement focusable au clavier (hors tabindex). */
export function isNativelyFocusable(el: Element): boolean {
  const tag = el.tagName.toUpperCase();
  if (tag === 'A') return el.hasAttribute('href');
  if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    return type !== 'hidden';
  }
  if (tag === 'IFRAME' || tag === 'SUMMARY') return true;
  return (
    el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false'
  );
}

/** Vrai si l'élément est focusable au clavier (natif ou via tabindex ≥ 0). */
export function isFocusable(el: Element): boolean {
  if (isNativelyFocusable(el)) {
    // Un tabindex négatif reste focusable programmatiquement ; on le compte
    // comme focusable pour aria-hidden (il reste atteignable par JS/script).
    return true;
  }
  const tabindex = el.getAttribute('tabindex');
  if (tabindex === null) return false;
  const value = Number.parseInt(tabindex, 10);
  return !Number.isNaN(value) && value >= 0;
}

/** Small DOM helpers shared by the screens: element lookup, modal card, toast. */

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type CardButton = [label: string, action: () => void, primary?: boolean];

export interface CardOptions {
  kind?: 'win' | '';
  media?: HTMLElement;
}

export function showCard(title: string, text: string, buttons: CardButton[], opts: CardOptions = {}): void {
  const overlay = $('overlay');
  const card = $('card');
  overlay.className = opts.kind ?? '';
  card.replaceChildren();
  const h = document.createElement('h2');
  h.textContent = title;
  card.append(h);
  if (opts.media) card.append(opts.media);
  if (text) {
    const p = document.createElement('p');
    p.textContent = text;
    card.append(p);
  }
  for (const [label, action, primary] of buttons) {
    const b = document.createElement('button');
    b.textContent = label;
    if (primary) b.className = 'primary';
    b.addEventListener('click', () => {
      hideOverlay();
      action();
    });
    card.append(b);
  }
  overlay.hidden = false;
}

export function hideOverlay(): void {
  $('overlay').hidden = true;
}

export function overlayOpen(): boolean {
  return !$('overlay').hidden;
}

let toastTimer = 0;
export function showToast(text: string): void {
  const toast = $('toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 1800);
}

export function setIconButton(id: string, icon: string, label: string, action: () => void): void {
  const b = $(id);
  const ico = b.querySelector('.ico');
  const lbl = b.querySelector('.lbl');
  if (ico) ico.innerHTML = icon;
  else b.innerHTML = icon;
  if (lbl) lbl.textContent = label;
  else b.setAttribute('aria-label', label);
  b.addEventListener('click', action);
}

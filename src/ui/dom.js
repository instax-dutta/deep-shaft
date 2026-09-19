/**
 * Small DOM construction helper.
 *
 * Creating elements explicitly (rather than with innerHTML strings) keeps player-visible copy
 * out of markup parsing and makes the panels straightforward to test in jsdom.
 */

export function createElement(tag, options = {}) {
  const node = document.createElement(tag);

  if (options.className) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value !== undefined && value !== null) {
      node.setAttribute(name, String(value));
    }
  }
  for (const [name, value] of Object.entries(options.dataset ?? {})) {
    node.dataset[name] = String(value);
  }
  for (const child of options.children ?? []) {
    if (child) {
      node.append(child);
    }
  }

  return node;
}

export function field(name, text = '') {
  return createElement('span', { text, attrs: { 'data-field': name } });
}

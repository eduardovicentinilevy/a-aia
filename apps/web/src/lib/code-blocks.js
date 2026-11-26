/**
 * Adds a header with the language name and a "Copiar" button to each code block of a
 * rendered (already sanitized) answer.
 *
 * DOMPurify removes every <button> that comes from the model, so the buttons created
 * here are the only ones inside an answer; clicks are handled by delegation in Message.
 */

const COPY_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/></svg>';

export const COPY_LABEL = 'Copiar';
export const COPIED_LABEL = 'Copiado!';

/**
 * @param {HTMLElement} root  Element whose innerHTML is the sanitized Markdown.
 */
export function enhanceCodeBlocks(root) {
  for (const pre of root.querySelectorAll('pre')) {
    if (pre.parentElement?.classList.contains('code-block')) continue; // already done
    const code = pre.querySelector('code');
    const language = /language-([\w+#.-]+)/.exec(code?.className ?? '')?.[1] ?? 'código';

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    const head = document.createElement('div');
    head.className = 'code-block__head';
    const label = document.createElement('span');
    label.className = 'code-block__lang';
    label.textContent = language; // textContent: never parsed as HTML
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-block__copy';
    button.innerHTML = `${COPY_ICON}<span>${COPY_LABEL}</span>`; // constant markup, no model text

    head.append(label, button);
    pre.replaceWith(wrapper);
    wrapper.append(head, pre);
  }
}

/**
 * The code text of the block that contains `button`.
 * @param {Element} button
 */
export function codeOf(button) {
  return button.closest('.code-block')?.querySelector('pre')?.textContent ?? '';
}

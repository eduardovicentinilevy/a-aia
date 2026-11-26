import DOMPurify from 'dompurify';
import { Marked } from 'marked';

/**
 * Markdown → SAFE HTML for the assistant's answers.
 *
 * Model output is untrusted (a prompt injection could make it write <script> or
 * <img onerror=...>). So: marked turns Markdown into HTML, then DOMPurify removes
 * anything that could run code. Only the sanitized result ever reaches the page.
 */

const marked = new Marked({ gfm: true, breaks: true });

/** @type {import('dompurify').DOMPurify|null} */
let purifier = null;

function getPurifier() {
  if (purifier) return purifier;
  purifier = DOMPurify(window);
  // Links open in a new tab, without giving the new page access to ours.
  purifier.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  return purifier;
}

/**
 * @param {string} markdown
 * @returns {string} sanitized HTML
 */
export function renderMarkdown(markdown) {
  const html = /** @type {string} */ (marked.parse(markdown, { async: false }));
  return getPurifier().sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'img'],
    FORBID_ATTR: ['style'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
  });
}

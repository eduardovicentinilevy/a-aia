// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { codeOf, enhanceCodeBlocks } from '../src/lib/code-blocks.js';
import { renderMarkdown } from '../src/lib/markdown.js';

/** @param {string} markdown */
function render(markdown) {
  const root = document.createElement('div');
  root.innerHTML = renderMarkdown(markdown);
  enhanceCodeBlocks(root);
  return root;
}

describe('enhanceCodeBlocks', () => {
  it('wraps each block with its language and a copy button that copies the code', () => {
    const root = render('Veja:\n\n```js\nconst a = 1;\n```\n\n```\nsem linguagem\n```');
    const blocks = root.querySelectorAll('.code-block');
    expect(blocks).toHaveLength(2);
    expect([...root.querySelectorAll('.code-block__lang')].map((el) => el.textContent)).toEqual(['js', 'código']);
    const buttons = root.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(codeOf(buttons[0])).toBe('const a = 1;\n');
  });

  it('is idempotent (effects can run twice)', () => {
    const root = render('```py\nprint(1)\n```');
    enhanceCodeBlocks(root);
    expect(root.querySelectorAll('.code-block')).toHaveLength(1);
    expect(root.querySelectorAll('button')).toHaveLength(1);
  });

  it('never turns a hostile language name into HTML', () => {
    const root = render('```<img src=x onerror=alert(1)>\nx\n```');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelectorAll('button')).toHaveLength(1);
  });

  it('leaves inline code alone', () => {
    const root = render('use `npm test`');
    expect(root.querySelector('.code-block')).toBeNull();
  });
});

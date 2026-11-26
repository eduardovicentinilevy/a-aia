// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown.js';

describe('renderMarkdown', () => {
  it('renders common Markdown: bold, lists, code and tables', () => {
    const html = renderMarkdown('**oi**\n\n- um\n- dois\n\n```js\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<strong>oi</strong>');
    expect(html).toContain('<li>um</li>');
    expect(html).toContain('<code class="language-js">const a = 1;');
    expect(html).toContain('<table>');
  });

  it('opens links in a new tab safely', () => {
    const html = renderMarkdown('[FIAP](https://www.fiap.com.br)');
    expect(html).toContain('href="https://www.fiap.com.br"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it.each([
    ['script tags', '<script>alert(1)</script>oi', /<script/i],
    ['event handlers', '<a href="https://x.com" onclick="alert(1)">x</a>', /onclick/i],
    ['javascript: links', '[clique](javascript:alert(1))', /javascript:/i],
    ['images (can leak data via URL)', '![x](https://evil.example/track.png)', /<img/i],
    ['iframes', '<iframe src="https://evil.example"></iframe>', /<iframe/i],
    ['inline styles', '<p style="position:fixed">x</p>', /style=/i],
    ['img onerror', '<img src=x onerror=alert(1)>', /onerror|<img/i],
  ])('removes %s', (_label, markdown, forbidden) => {
    expect(renderMarkdown(markdown)).not.toMatch(forbidden);
  });
});

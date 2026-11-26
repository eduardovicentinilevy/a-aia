import { describe, expect, it } from 'vitest';
import { formatMs, metaLine, tierLabel } from '../src/lib/format.js';

describe('formatMs', () => {
  it.each([
    [null, '—'],
    [undefined, '—'],
    [0, '0 ms'],
    [850, '850 ms'],
    [1000, '1,0 s'],
    [1234, '1,2 s'],
  ])('%s → %s', (input, expected) => {
    expect(formatMs(input)).toBe(expected);
  });
});

describe('tierLabel', () => {
  it('names the two tiers', () => {
    expect(tierLabel('pro')).toBe('AçaIA Pro');
    expect(tierLabel('copinho')).toBe('AçaIA Copinho');
    expect(tierLabel('moderation')).toBe('Segurança');
  });
});

describe('metaLine', () => {
  const base = { id: 'a1', role: /** @type {const} */ ('assistant'), text: 'oi', meta: { tier: 'pro', model: 'mock' } };

  it('shows model and timings when done', () => {
    const line = metaLine({ ...base, status: 'done', stats: { firstTokenMs: 21, latencyMs: 1500 } });
    expect(line).toBe('AçaIA Pro · mock · 1ª palavra em 21 ms · total 1,5 s');
  });

  it('shows the model while streaming and marks stopped answers', () => {
    expect(metaLine({ ...base, status: 'streaming' })).toBe('AçaIA Pro · mock');
    expect(metaLine({ ...base, status: 'stopped' })).toBe('AçaIA Pro · mock · interrompida');
  });

  it('labels moderation refusals simply', () => {
    expect(metaLine({ ...base, meta: { tier: 'moderation', model: 'keyword' }, status: 'done', stats: { firstTokenMs: 1, latencyMs: 1 } })).toBe('Segurança');
  });

  it('is empty for user messages and for answers without meta yet', () => {
    expect(metaLine({ id: 'u1', role: 'user', text: 'oi', status: 'done' })).toBe('');
    expect(metaLine({ ...base, meta: null, status: 'streaming' })).toBe('');
  });
});

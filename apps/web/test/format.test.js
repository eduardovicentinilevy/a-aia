import { describe, expect, it } from 'vitest';
import { formatMs, greeting, groupConversations, metaLine, tierLabel } from '../src/lib/format.js';

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
    expect(tierLabel('pro')).toBe('Pro');
    expect(tierLabel('copinho')).toBe('Copinho');
    expect(tierLabel('moderation')).toBe('Segurança');
  });
});

describe('metaLine', () => {
  const base = { id: 'a1', role: /** @type {const} */ ('assistant'), text: 'oi', meta: { tier: 'pro', model: 'mock' } };

  it('shows model and timings when done', () => {
    const line = metaLine({ ...base, status: 'done', stats: { firstTokenMs: 21, latencyMs: 1500 } });
    expect(line).toBe('mock · 1ª palavra em 21 ms · total 1,5 s');
  });

  it('shows the model while streaming and marks stopped answers', () => {
    expect(metaLine({ ...base, status: 'streaming' })).toBe('mock');
    expect(metaLine({ ...base, status: 'stopped' })).toBe('mock · interrompida');
  });

  it('stays empty for moderation refusals (the badge already says it)', () => {
    expect(metaLine({ ...base, meta: { tier: 'moderation', model: 'keyword' }, status: 'done', stats: { firstTokenMs: 1, latencyMs: 1 } })).toBe('');
  });

  it('is empty for user messages and for answers without meta yet', () => {
    expect(metaLine({ id: 'u1', role: 'user', text: 'oi', status: 'done' })).toBe('');
    expect(metaLine({ ...base, meta: null, status: 'streaming' })).toBe('');
  });
});

describe('greeting', () => {
  it.each([
    [4, 'Boa noite'],
    [5, 'Bom dia'],
    [11, 'Bom dia'],
    [12, 'Boa tarde'],
    [17, 'Boa tarde'],
    [18, 'Boa noite'],
    [23, 'Boa noite'],
  ])('%sh → %s', (hour, expected) => {
    expect(greeting(new Date(2026, 10, 26, hour, 30))).toBe(expected);
  });
});

describe('groupConversations', () => {
  const now = new Date(2026, 10, 26, 9, 0); // 26/11/2026, 9h (local time)
  /** @param {string} id @param {Date} date */
  const conv = (id, date) => ({ id, updatedAt: date.toISOString() });

  it('splits by calendar day and keeps the order inside each section', () => {
    const items = [
      conv('a', new Date(2026, 10, 26, 8, 59)),
      conv('b', new Date(2026, 10, 26, 0, 1)),
      conv('c', new Date(2026, 10, 25, 23, 59)), // 9 minutes ago in hours, but yesterday
      conv('d', new Date(2026, 10, 19, 12, 0)), // 7 days
      conv('e', new Date(2026, 10, 18, 12, 0)), // 8 days
      conv('f', new Date(2026, 9, 27, 12, 0)), // 30 days
      conv('g', new Date(2025, 0, 1, 12, 0)),
    ];
    expect(groupConversations(items, now).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Hoje', ['a', 'b']],
      ['Ontem', ['c']],
      ['Últimos 7 dias', ['d']],
      ['Últimos 30 dias', ['e', 'f']],
      ['Mais antigas', ['g']],
    ]);
  });

  it('leaves empty sections out', () => {
    expect(groupConversations([conv('a', new Date(2026, 10, 26, 1))], now)).toEqual([
      { label: 'Hoje', items: [expect.objectContaining({ id: 'a' })] },
    ]);
    expect(groupConversations([], now)).toEqual([]);
  });

  it('treats future dates (clock skew) as today and invalid dates as old', () => {
    const groups = groupConversations([conv('a', new Date(2026, 10, 27, 10)), { id: 'b', updatedAt: 'nope' }], now);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Hoje', ['a']],
      ['Mais antigas', ['b']],
    ]);
  });
});

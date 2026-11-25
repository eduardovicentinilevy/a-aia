import { describe, expect, it } from 'vitest';
import { dayInSaoPaulo, monthRangeInSaoPaulo } from '../src/lib/time.js';

describe('dayInSaoPaulo', () => {
  it('uses the São Paulo calendar day, not UTC', () => {
    // 02:30 UTC on Dec 2 is still 23:30 on Dec 1 in São Paulo (UTC−3).
    expect(dayInSaoPaulo(new Date('2026-12-02T02:30:00Z'))).toBe('2026-12-01');
    expect(dayInSaoPaulo(new Date('2026-12-02T03:30:00Z'))).toBe('2026-12-02');
  });
});

describe('monthRangeInSaoPaulo', () => {
  it('returns the first and last day of the month', () => {
    expect(monthRangeInSaoPaulo(new Date('2026-12-15T12:00:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(monthRangeInSaoPaulo(new Date('2028-02-10T12:00:00Z'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('follows the São Paulo day at month boundaries', () => {
    expect(monthRangeInSaoPaulo(new Date('2027-01-01T01:00:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

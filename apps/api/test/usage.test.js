import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/db/memory-store.js';
import { costCents, createUsageLimits, estimateTokens } from '../src/orchestrator/usage.js';

describe('estimateTokens and costCents', () => {
  it('estimates ~4 characters per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcdefghi')).toBe(3);
  });

  it('computes centavos from the price per 1M tokens', () => {
    expect(costCents({ tokensIn: 1_000_000, tokensOut: 0 }, { inputBrlPer1M: 3, outputBrlPer1M: 15 })).toBe(300);
    expect(costCents({ tokensIn: 100, tokensOut: 100 }, undefined)).toBe(0);
  });
});

describe('createUsageLimits', () => {
  const clock = () => new Date('2026-12-10T15:00:00Z');

  it('blocks a user who reached the daily token limit (429)', async () => {
    const store = createMemoryStore();
    const limits = createUsageLimits({ store, dailyTokenLimit: 1000, monthlyBudgetCents: 0, clock });
    await expect(limits.assertWithinLimits('u1')).resolves.toBeUndefined();
    await limits.record('u1', { tokensIn: 600, tokensOut: 400, costCents: 0 });
    await expect(limits.assertWithinLimits('u1')).rejects.toMatchObject({ status: 429, code: 'daily_limit_reached' });
    await expect(limits.assertWithinLimits('u2')).resolves.toBeUndefined(); // other users unaffected
  });

  it('blocks everybody when the monthly budget is spent (503)', async () => {
    const store = createMemoryStore();
    const limits = createUsageLimits({ store, dailyTokenLimit: 0, monthlyBudgetCents: 100, clock });
    await limits.record('u1', { tokensIn: 1, tokensOut: 1, costCents: 60 });
    await expect(limits.assertWithinLimits('u2')).resolves.toBeUndefined();
    await limits.record('u2', { tokensIn: 1, tokensOut: 1, costCents: 40 });
    await expect(limits.assertWithinLimits('u3')).rejects.toMatchObject({ status: 503, code: 'monthly_budget_reached' });
  });

  it('treats 0 as "no limit"', async () => {
    const store = createMemoryStore();
    const limits = createUsageLimits({ store, dailyTokenLimit: 0, monthlyBudgetCents: 0, clock });
    await limits.record('u1', { tokensIn: 10_000_000, tokensOut: 0, costCents: 1_000_000 });
    await expect(limits.assertWithinLimits('u1')).resolves.toBeUndefined();
  });
});

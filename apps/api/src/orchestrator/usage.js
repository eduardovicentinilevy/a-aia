import { dayInSaoPaulo, monthRangeInSaoPaulo } from '../lib/time.js';
import { HttpError } from '../middleware/errors.js';

/**
 * Rough token estimate (~4 characters per token in Portuguese/English) for when the
 * provider does not report usage — e.g. the answer was interrupted.
 * @param {string} text
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Estimated cost in centavos (BRL) from token counts and the model's price per 1M tokens.
 * @param {{ tokensIn: number, tokensOut: number }} usage
 * @param {import('../providers/model/types.js').Pricing|undefined} pricing
 */
export function costCents(usage, pricing) {
  if (!pricing) return 0;
  const brl = (usage.tokensIn * pricing.inputBrlPer1M + usage.tokensOut * pricing.outputBrlPer1M) / 1_000_000;
  return brl * 100;
}

/**
 * Per-user daily token limit and global monthly budget (CLAUDE.md §5.7 step 1).
 * A value of 0 disables that limit.
 * @param {object} deps
 * @param {import('../db/store.js').Store} deps.store
 * @param {number} deps.dailyTokenLimit
 * @param {number} deps.monthlyBudgetCents
 * @param {() => Date} [deps.clock]
 */
export function createUsageLimits({ store, dailyTokenLimit, monthlyBudgetCents, clock = () => new Date() }) {
  return {
    /**
     * Throws an HttpError (429 or 503) when the user or the whole app is over its limit.
     * @param {string} userId
     */
    async assertWithinLimits(userId) {
      const now = clock();
      if (dailyTokenLimit > 0) {
        const usage = await store.getUsage(userId, dayInSaoPaulo(now));
        if (usage.tokensIn + usage.tokensOut >= dailyTokenLimit) {
          throw new HttpError(
            429,
            'daily_limit_reached',
            'Você atingiu o limite de uso de hoje. Ele renova à meia-noite (horário de Brasília).',
          );
        }
      }
      if (monthlyBudgetCents > 0) {
        const { from, to } = monthRangeInSaoPaulo(now);
        if ((await store.getTotalCostCents(from, to)) >= monthlyBudgetCents) {
          throw new HttpError(503, 'monthly_budget_reached', 'A AçaIA atingiu o orçamento deste mês. Volte no mês que vem!');
        }
      }
    },

    /**
     * Adds one answer's usage to today's total.
     * @param {string} userId
     * @param {import('../db/store.js').Usage} usage
     */
    async record(userId, usage) {
      await store.addUsage(userId, dayInSaoPaulo(clock()), usage);
    },
  };
}

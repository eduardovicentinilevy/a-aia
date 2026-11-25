/**
 * Mock moderation for tests and offline development.
 * Blocks any text containing `blockWord` (default "BLOQUEAR"), allows the rest.
 * @param {{ blockWord?: string, category?: string }} [options]
 * @returns {import('./types.js').ModerationProvider}
 */
export function createMockModerationProvider({ blockWord = 'BLOQUEAR', category = 'test' } = {}) {
  return {
    name: 'mock',
    async check(text) {
      return text.includes(blockWord)
        ? { allowed: false, category, reason: 'mock block word' }
        : { allowed: true, category: null, reason: null };
    },
  };
}

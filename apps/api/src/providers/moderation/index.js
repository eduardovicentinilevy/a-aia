import { createKeywordModerationProvider } from './keyword.js';
import { createMockModerationProvider } from './mock.js';

/**
 * Picks the moderation provider from MODERATION_PROVIDER.
 * @param {'keyword'|'mock'} name
 * @returns {import('./types.js').ModerationProvider}
 */
export function createModerationProvider(name) {
  switch (name) {
    case 'keyword':
      return createKeywordModerationProvider();
    case 'mock':
      return createMockModerationProvider();
    default:
      throw new Error(`Unknown MODERATION_PROVIDER: ${name}`);
  }
}

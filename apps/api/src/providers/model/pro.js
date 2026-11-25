import { createMockProvider } from './mock.js';
import { createOpenAICompatibleProvider } from './openai-compatible.js';

/**
 * Builds the AçaIA Pro provider from configuration. No vendor is hard-coded:
 * PRO_PROVIDER picks the adapter, PRO_BASE_URL / PRO_MODEL pick the vendor and model.
 * @param {import('../../config.js').ProConfig} pro
 * @returns {import('./types.js').ModelProvider}
 */
export function createProProvider(pro) {
  switch (pro.provider) {
    case 'mock':
      return createMockProvider({ name: 'pro', model: 'mock' });
    case 'openai-compatible':
      return createOpenAICompatibleProvider({
        name: 'pro',
        baseUrl: /** @type {string} */ (pro.baseUrl),
        apiKey: /** @type {string} */ (pro.apiKey),
        model: /** @type {string} */ (pro.model),
        timeoutMs: pro.timeoutMs,
      });
    default:
      throw new Error(`Unknown PRO_PROVIDER: ${pro.provider}`);
  }
}

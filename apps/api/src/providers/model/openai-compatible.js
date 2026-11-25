import { parseSSE } from '../../lib/sse-parser.js';
import { ProviderError } from '../errors.js';

/** @typedef {import('./types.js').ModelProvider} ModelProvider */

/**
 * Reads a short, log-safe description of an HTTP error body.
 * @param {Response} response
 */
async function readErrorDetail(response) {
  try {
    const text = (await response.text()).slice(0, 2000);
    try {
      const json = JSON.parse(text);
      const body = Array.isArray(json) ? json[0] : json;
      return String(body?.error?.message ?? text).slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return undefined;
  }
}

/**
 * Client for any OpenAI-compatible `POST /chat/completions` endpoint with streaming.
 * Used by the Pro tier (e.g. Gemini's OpenAI-compatible endpoint) and, from Phase 3,
 * by the Copinho tier (vLLM exposes the same API).
 *
 * @param {object} options
 * @param {string} options.name        Logical tier name ('pro', 'copinho').
 * @param {string} options.baseUrl     e.g. https://host/v1 (without /chat/completions).
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {number} [options.timeoutMs] Max wait for the first streamed chunk.
 * @param {boolean} [options.includeUsage] Ask for token counts in the stream (needed for limits and cost).
 * @param {import('./types.js').Pricing} [options.pricing]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {ModelProvider}
 */
export function createOpenAICompatibleProvider({ name, baseUrl, apiKey, model, timeoutMs = 30_000, includeUsage = true, pricing, fetchImpl = fetch }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return {
    name,
    model,
    pricing,
    async *stream({ messages, maxTokens, temperature, signal }) {
      // One controller cancels the HTTP request for any reason: caller abort, timeout or early stop.
      const controller = new AbortController();
      const onCallerAbort = () => controller.abort();
      if (signal?.aborted) controller.abort();
      signal?.addEventListener('abort', onCallerAbort, { once: true });

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      /** @param {unknown} err */
      const toProviderError = (err) => {
        if (err instanceof ProviderError) return err;
        if (signal?.aborted) return new ProviderError('Request aborted', { code: 'aborted', cause: err });
        if (timedOut) return new ProviderError(`No response within ${timeoutMs} ms`, { code: 'timeout', cause: err });
        return new ProviderError('Network error calling model provider', { code: 'network', cause: err });
      };

      /** @type {import('./types.js').Usage|null} */
      let usage = null;
      /** @type {string|null} */
      let finishReason = null;

      try {
        let response;
        try {
          /** @type {Record<string, unknown>} */
          const body = { model, messages, stream: true, max_tokens: maxTokens };
          if (temperature !== undefined) body.temperature = temperature;
          // Without this, most providers (Gemini, vLLM) send no token counts when streaming.
          if (includeUsage) body.stream_options = { include_usage: true };
          response = await fetchImpl(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } catch (err) {
          throw toProviderError(err);
        }

        if (!response.ok) {
          throw new ProviderError(`Provider responded with HTTP ${response.status}`, {
            code: 'http_error',
            status: response.status,
            detail: await readErrorDetail(response),
          });
        }
        if (!response.body) throw new ProviderError('Provider returned an empty body', { code: 'bad_response' });

        try {
          for await (const event of parseSSE(response.body)) {
            clearTimeout(timer); // the first chunk arrived: no more timeout
            if (event.data === '[DONE]') break;

            let chunk;
            try {
              chunk = JSON.parse(event.data);
            } catch (err) {
              throw new ProviderError('Provider sent an invalid JSON chunk', { code: 'bad_response', cause: err });
            }
            if (chunk.error) {
              throw new ProviderError('Provider reported an error mid-stream', {
                code: 'http_error',
                status: Number(chunk.error.code) || undefined,
                detail: String(chunk.error.message ?? '').slice(0, 300),
              });
            }

            const choice = chunk.choices?.[0];
            const text = choice?.delta?.content;
            if (typeof text === 'string' && text.length > 0) yield { type: 'token', text };
            if (choice?.finish_reason) finishReason = choice.finish_reason;
            if (chunk.usage) {
              usage = { tokensIn: chunk.usage.prompt_tokens ?? 0, tokensOut: chunk.usage.completion_tokens ?? 0 };
            }
          }
        } catch (err) {
          throw toProviderError(err);
        }
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onCallerAbort);
        // If the consumer stopped early, this cancels the HTTP request; otherwise it is a no-op.
        controller.abort();
      }

      yield { type: 'done', usage, finishReason };
    },
  };
}

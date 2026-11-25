/**
 * Error raised by any external provider (model, embeddings, search, moderation).
 * `code` is stable and safe to show; `detail` is for logs only.
 */
export class ProviderError extends Error {
  /**
   * @param {string} message
   * @param {{ code: 'timeout'|'aborted'|'network'|'http_error'|'bad_response', status?: number, detail?: string, cause?: unknown }} options
   */
  constructor(message, { code, status, detail, cause }) {
    super(message, { cause });
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

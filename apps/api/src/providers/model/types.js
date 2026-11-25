// Shared JSDoc types for model providers (no runtime code).

/**
 * @typedef {'system'|'user'|'assistant'} Role
 *
 * @typedef {object} ChatMessage
 * @property {Role} role
 * @property {string} content
 *
 * @typedef {object} Usage
 * @property {number} tokensIn
 * @property {number} tokensOut
 *
 * @typedef {{ type: 'token', text: string }} TokenEvent
 * @typedef {{ type: 'done', usage?: Usage|null, finishReason?: string|null }} DoneEvent
 * @typedef {TokenEvent | DoneEvent} StreamEvent
 *
 * @typedef {object} StreamParams
 * @property {ChatMessage[]} messages
 * @property {number} maxTokens
 * @property {number} [temperature]
 * @property {AbortSignal} [signal]
 *
 * @typedef {object} Pricing  Estimated price in BRL per 1 million tokens.
 * @property {number} inputBrlPer1M
 * @property {number} outputBrlPer1M
 *
 * @typedef {object} ModelProvider
 * @property {string} name   Logical tier: 'pro' | 'copinho'.
 * @property {string} model  Concrete model id sent to the backend (e.g. 'mock').
 * @property {Pricing} [pricing]
 * @property {(params: StreamParams) => AsyncIterable<StreamEvent>} stream
 */

export {};

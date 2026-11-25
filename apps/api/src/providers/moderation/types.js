// Shared JSDoc types for moderation providers (no runtime code).

/**
 * @typedef {object} ModerationVerdict
 * @property {boolean} allowed
 * @property {string|null} category  e.g. 'csam', 'weapons', 'drugs' (null when allowed)
 * @property {string|null} reason    Short, log-safe explanation (never the user's text)
 *
 * @typedef {object} ModerationProvider
 * @property {string} name
 * @property {(text: string, options: { direction: 'in'|'out' }) => Promise<ModerationVerdict>} check
 */

export {};

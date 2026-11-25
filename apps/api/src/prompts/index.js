import { readFileSync } from 'node:fs';

/** Version of the system prompt in use. Bump it (and add system.vN.md) to change the persona. */
export const SYSTEM_PROMPT_VERSION = 'v1';

/**
 * Loads a versioned system prompt from this folder.
 * @param {string} [version]
 */
export function loadSystemPrompt(version = SYSTEM_PROMPT_VERSION) {
  if (!/^v\d+$/.test(version)) throw new Error(`Invalid prompt version: ${version}`);
  return readFileSync(new URL(`./system.${version}.md`, import.meta.url), 'utf8').trim();
}

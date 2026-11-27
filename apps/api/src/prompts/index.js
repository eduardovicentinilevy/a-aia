import { readFileSync } from 'node:fs';

/** Version of the system prompt in use. Bump it (and add system.vN.md) to change the persona. */
export const SYSTEM_PROMPT_VERSION = 'v1';

/** Version of the "Humanizar" prompt (humanize.vN.md). */
export const HUMANIZE_PROMPT_VERSION = 'v1';

/**
 * Loads a versioned prompt file (<name>.<version>.md) from this folder.
 * @param {string} name     e.g. 'system', 'humanize'
 * @param {string} version  e.g. 'v1'
 */
export function loadPrompt(name, version) {
  if (!/^[a-z]+$/.test(name)) throw new Error(`Invalid prompt name: ${name}`);
  if (!/^v\d+$/.test(version)) throw new Error(`Invalid prompt version: ${version}`);
  return readFileSync(new URL(`./${name}.${version}.md`, import.meta.url), 'utf8').trim();
}

/**
 * Loads a versioned system prompt from this folder.
 * @param {string} [version]
 */
export function loadSystemPrompt(version = SYSTEM_PROMPT_VERSION) {
  return loadPrompt('system', version);
}

/**
 * Basic moderation (Phase 1): a SHORT list of high-precision patterns for clearly harmful
 * requests in Portuguese. It is deliberately narrow — false positives annoy real users —
 * and is NOT the safety system: the system prompt and the model's own safety do most of the
 * work, and Phase 5 replaces this with a real classifier plus jailbreak tests.
 *
 * Self-harm is intentionally NOT blocked: the assistant must answer with care and point to
 * help (CVV 188), which the system prompt already instructs.
 */

/** @typedef {import('./types.js').ModerationProvider} ModerationProvider */

/**
 * Lowercase and strip accents, so "cocaína", "COCAINA" and "cocaina" all match.
 * @param {string} text
 */
export function normalize(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

const HOW_TO = String.raw`(como|passo a passo|tutorial|receita|instrucoes|me ensina|ensine)`;
const MAKE = String.raw`(fazer|fabricar|montar|construir|produzir|preparar|sintetizar|cozinhar)`;

/**
 * Protective or educational context ("how to report", "what does the law say"...):
 * those questions must reach the model and get a helpful answer.
 */
const PROTECTIVE_CONTEXT = /\b(o que e|denunci\w*|proteg\w*|prevenir|prevencao|combat\w*|leis?|crime|sinais|identificar|ajuda|vitimas?|conselho tutelar)\b/;

/** @type {{ category: string, pattern: RegExp, unless?: RegExp }[]} */
export const RULES = [
  {
    category: 'csam',
    pattern: /\b(pornografia|porno|sexo|nudes?|fotos? (intimas|nuas|pelad[ao]s?)|conteudo sexual)\b.{0,40}\b(infantil|crianca|criancas|menor(es)? de idade|pre-?adolescentes?)\b/,
    unless: PROTECTIVE_CONTEXT,
  },
  {
    category: 'csam',
    pattern: /\b(crianca|criancas|menor(es)? de idade)\b.{0,40}\b(pornografia|porno|nudes?|pelad[ao]s?|sexo)\b/,
    unless: PROTECTIVE_CONTEXT,
  },
  {
    category: 'weapons',
    pattern: new RegExp(String.raw`\b${HOW_TO}\b.{0,40}\b${MAKE}\b.{0,30}\b(bomba|explosivos?|artefato explosivo|coquetel molotov|arma caseira|arma de fogo caseira|silenciador caseiro)\b`),
    // "bomba de chocolate" is a dessert; "bomba d'água" is plumbing.
    unless: /\bbombas? (de |do |da |d['’])?(chocolate|creme|brigadeiro|agua|ar|calor|piscina|chuveiro|combustivel|gasolina|vacuo|sementes?)\b/,
  },
  {
    category: 'drugs',
    pattern: new RegExp(String.raw`\b${HOW_TO}\b.{0,40}\b${MAKE}\b.{0,30}\b(metanfetamina|cocaina|crack|lsd|ecstasy|mdma|heroina|fentanil)\b`),
  },
];

/**
 * @param {{ rules?: typeof RULES }} [options]
 * @returns {ModerationProvider}
 */
export function createKeywordModerationProvider({ rules = RULES } = {}) {
  return {
    name: 'keyword',
    async check(text) {
      const normalized = normalize(text);
      for (const rule of rules) {
        if (rule.pattern.test(normalized) && !rule.unless?.test(normalized)) {
          return { allowed: false, category: rule.category, reason: `matched keyword rule: ${rule.category}` };
        }
      }
      return { allowed: true, category: null, reason: null };
    },
  };
}

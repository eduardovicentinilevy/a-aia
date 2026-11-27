/**
 * "Raio-x" of a text: cheap, deterministic signals that usually make writing sound
 * robotic (clichés, repeated sentence openers, uniform rhythm, repeated words, too many
 * dashes). It runs in the browser, needs no model and explains *why* a text sounds
 * artificial. It is NOT an AI detector: a person can write like this too.
 */

/** Ready-made phrases that pile up in artificial-sounding text (PT-BR first, a few in English). */
export const CLICHES = [
  'é importante ressaltar',
  'é importante destacar',
  'é importante notar',
  'é importante lembrar',
  'é fundamental destacar',
  'vale ressaltar',
  'vale destacar',
  'vale lembrar',
  'cabe ressaltar',
  'cabe destacar',
  'em suma',
  'em síntese',
  'em conclusão',
  'em resumo',
  'no cenário atual',
  'no mundo atual',
  'no mundo de hoje',
  'nos dias de hoje',
  'nos dias atuais',
  'em um mundo cada vez mais',
  'num mundo cada vez mais',
  'desempenha um papel fundamental',
  'desempenha um papel crucial',
  'desempenha um papel essencial',
  'papel crucial',
  'de suma importância',
  'por fim, mas não menos importante',
  'uma ampla gama',
  'uma vasta gama',
  'no âmbito de',
  'nesse contexto',
  'neste contexto',
  'nesse sentido',
  'vamos mergulhar',
  'mergulhar fundo',
  'outrossim',
  'it is important to note',
  'it is worth noting',
  'in today’s world',
  "in today's world",
  'plays a crucial role',
  'in conclusion',
  'delve into',
  'a testament to',
];

/** Words that open sentences mechanically when repeated. */
const CONNECTORS = [
  'além disso',
  'ademais',
  'dessa forma',
  'desse modo',
  'dessa maneira',
  'portanto',
  'assim',
  'por fim',
  'por outro lado',
  'nesse sentido',
  'em seguida',
  'furthermore',
  'moreover',
  'additionally',
  'however',
];

/** Frequent words of 5+ letters that are not a sign of repetition. */
const STOPWORDS = new Set(
  (
    'sobre entre quando também porque assim ainda sendo podem muito muitos muitas desse dessa deste desta ' +
    'nesse nessa neste nesta esses essas estes estas outro outra outros outras mesmo mesma todos todas ' +
    'depois antes apenas foram seria seriam estão estava tinha temos fazer forma parte pelos pelas ' +
    'which there their about would could should these those other where while being'
  ).split(' '),
);

const LETTER = '[\\p{L}\\p{N}]';
const STARTS_WITH_LETTER = new RegExp(`^${LETTER}`, 'u');

/** @param {string} value */
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Case-insensitive match of a whole phrase (no partial words: "resumo" ≠ "resumos").
 * Apostrophes are compared loosely (' or ’).
 * @param {string} phrase
 */
function phraseRegExp(phrase) {
  const body = escapeRegExp(phrase).replace(/['’]/g, "['’]").replace(/\s+/g, '\\s+');
  return new RegExp(`(?<!${LETTER})${body}(?!${LETTER})`, 'giu');
}

const CLICHE_PATTERNS = CLICHES.map((phrase) => ({ phrase, re: phraseRegExp(phrase) }));

/** @param {string} text */
export function splitSentences(text) {
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s));
}

/** @param {string} text */
export function words(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []);
}

/**
 * @typedef {{ id: string, label: string, detail: string }} Signal
 * @typedef {{ signals: Signal[], wordCount: number, sentenceCount: number }} XRay
 */

/**
 * Analyzes a text and lists the signals found (empty list = nothing suspicious).
 * @param {string} text
 * @returns {XRay}
 */
export function analyzeText(text) {
  const sentences = splitSentences(text);
  const allWords = words(text);
  /** @type {Signal[]} */
  const signals = [];

  // 1. Clichés
  const cliches = CLICHE_PATTERNS.map(({ phrase, re }) => ({ phrase, count: (text.match(re) ?? []).length }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
  if (cliches.length > 0) {
    const total = cliches.reduce((sum, c) => sum + c.count, 0);
    signals.push({
      id: 'cliches',
      label: total === 1 ? '1 clichê' : `${total} clichês`,
      detail: cliches.map((c) => (c.count > 1 ? `"${c.phrase}" (${c.count}×)` : `"${c.phrase}"`)).join(', '),
    });
  }

  // 2. Sentences opened by the same kind of connective
  const openers = sentences
    .map((s) => s.toLowerCase())
    .map((s) => CONNECTORS.find((c) => s.startsWith(c) && !STARTS_WITH_LETTER.test(s.slice(c.length))))
    .filter(Boolean);
  if (openers.length >= 3 || (sentences.length >= 4 && openers.length / sentences.length >= 0.3)) {
    const distinct = [...new Set(openers)].map((c) => `"${c}"`);
    signals.push({
      id: 'connectors',
      label: 'Conectivos em série',
      detail: `${openers.length} de ${sentences.length} frases começam com ${distinct.join(', ')}.`,
    });
  }

  // 3. Uniform rhythm: every sentence about the same length
  const lengths = sentences.map((s) => words(s).length).filter((n) => n > 0);
  if (lengths.length >= 5) {
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const sd = Math.sqrt(lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length);
    if (mean >= 8 && sd / mean < 0.3) {
      signals.push({
        id: 'rhythm',
        label: 'Ritmo uniforme',
        detail: `As frases têm quase o mesmo tamanho (média de ${Math.round(mean)} palavras). Misture frases curtas e longas.`,
      });
    }
  }

  // 4. Repeated content words
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const word of allWords) {
    if (word.length >= 5 && !STOPWORDS.has(word) && !/^\d+$/.test(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const threshold = Math.max(4, Math.ceil(allWords.length / 60));
  const repeated = [...counts]
    .filter(([, n]) => n >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (repeated.length > 0) {
    signals.push({
      id: 'repetition',
      label: 'Palavras repetidas',
      detail: repeated.map(([word, n]) => `"${word}" (${n}×)`).join(', '),
    });
  }

  // 5. Too many em dashes
  const dashes = (text.match(/—/g) ?? []).length;
  if (dashes >= 3 && dashes / Math.max(1, sentences.length) >= 0.25) {
    signals.push({ id: 'dashes', label: 'Muitos travessões', detail: `${dashes} travessões (—) no texto.` });
  }

  return { signals, wordCount: allWords.length, sentenceCount: sentences.length };
}

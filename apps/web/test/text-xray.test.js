import { describe, expect, it } from 'vitest';
import { analyzeText, splitSentences, words } from '../src/lib/text-xray.js';

const ids = (text) => analyzeText(text).signals.map((s) => s.id);

describe('splitSentences / words', () => {
  it('splits on sentence punctuation and line breaks', () => {
    expect(splitSentences('Oi. Tudo bem? Sim!\nNova linha… fim')).toEqual(['Oi.', 'Tudo bem?', 'Sim!', 'Nova linha…', 'fim']);
  });

  it('keeps accents and hyphenated words together', () => {
    expect(words('Açaí é bom-demais, né?')).toEqual(['açaí', 'é', 'bom-demais', 'né']);
  });
});

describe('analyzeText', () => {
  it('finds nothing in a short, natural text', () => {
    expect(analyzeText('Fui à feira cedo. Comprei manga, banana e um açaí enorme para o café da manhã.').signals).toEqual([]);
    expect(analyzeText('').signals).toEqual([]);
  });

  it('counts clichés, ignoring case and line breaks inside the phrase', () => {
    const { signals } = analyzeText('É importante ressaltar que funciona. Em suma, é IMPORTANTE\nRESSALTAR o óbvio.');
    expect(signals[0]).toMatchObject({ id: 'cliches', label: '3 clichês' });
    expect(signals[0].detail).toBe('"é importante ressaltar" (2×), "em suma"');
  });

  it('matches whole phrases only', () => {
    expect(ids('Li os resumos em sumários antigos.')).toEqual([]);
    expect(ids('Em resumo: deu certo.')).toEqual(['cliches']);
  });

  it('flags sentences that keep opening with connectives', () => {
    const text = 'O plano é bom. Além disso, é barato. Além disso, é rápido. Dessa forma, todos ganham.';
    const signal = analyzeText(text).signals.find((s) => s.id === 'connectors');
    expect(signal?.detail).toBe('3 de 4 frases começam com "além disso", "dessa forma".');
    // "Assimilar" starts with "assim" but is not the connective.
    expect(ids('Assimilar leva tempo. Assimilamos aos poucos. Assimilação é isso.')).not.toContain('connectors');
  });

  it('flags a uniform rhythm and accepts a varied one', () => {
    const uniform = Array.from({ length: 6 }, (_, i) => `A frase número ${i} tem exatamente o mesmo tamanho que as outras.`).join(' ');
    expect(ids(uniform)).toContain('rhythm');
    const varied =
      'Choveu. A gente ficou em casa jogando baralho a tarde inteira, rindo das mesmas piadas de sempre. ' +
      'Depois, pizza. Ninguém reclamou. No fim da noite, já cansados, combinamos de repetir tudo no próximo domingo sem falta.';
    expect(ids(varied)).not.toContain('rhythm');
  });

  it('flags repeated content words, not common ones', () => {
    const text = 'O processo começa cedo. O processo segue. Depois o processo termina, e o processo recomeça.';
    expect(analyzeText(text).signals.find((s) => s.id === 'repetition')?.detail).toBe('"processo" (4×)');
    expect(ids('sobre sobre sobre sobre sobre')).not.toContain('repetition');
  });

  it('flags too many em dashes', () => {
    expect(ids('Ele veio — tarde — e saiu — cedo. Fim.')).toContain('dashes');
    expect(ids('Ele veio — tarde. Saiu cedo. Voltou depois. Dormiu.')).not.toContain('dashes');
  });

  it('reports word and sentence counts', () => {
    expect(analyzeText('Uma frase. Outra frase.')).toMatchObject({ wordCount: 4, sentenceCount: 2 });
  });
});

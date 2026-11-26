/**
 * Formats milliseconds the Brazilian way: "850 ms", "1,2 s".
 * @param {number|null|undefined} ms
 */
export function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/** @param {string} tier */
export function tierLabel(tier) {
  if (tier === 'copinho') return 'AçaIA Copinho';
  if (tier === 'moderation') return 'Segurança';
  return 'AçaIA Pro';
}

/**
 * The small line under an answer: model, time to first word, total time.
 * @param {import('./chat-reducer.js').ChatMessage} message
 */
export function metaLine(message) {
  if (message.role !== 'assistant') return '';
  const parts = [];
  if (message.meta?.tier === 'moderation') return tierLabel('moderation');
  if (message.meta) parts.push(tierLabel(message.meta.tier), message.meta.model);
  if (message.status === 'done' && message.stats) {
    parts.push(`1ª palavra em ${formatMs(message.stats.firstTokenMs)}`, `total ${formatMs(message.stats.latencyMs)}`);
  }
  if (message.status === 'stopped') parts.push('interrompida');
  return parts.join(' · ');
}

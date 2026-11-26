/**
 * Formats milliseconds the Brazilian way: "850 ms", "1,2 s".
 * @param {number|null|undefined} ms
 */
export function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/**
 * Short name of who answered, shown as a badge next to "AçaIA".
 * @param {string} tier
 */
export function tierLabel(tier) {
  if (tier === 'copinho') return 'Copinho';
  if (tier === 'moderation') return 'Segurança';
  return 'Pro';
}

/**
 * The small line under an answer: model, time to first word, total time.
 * The tier (Pro, Copinho, Segurança) is shown as a badge, so it is not repeated here.
 * @param {import('./chat-reducer.js').ChatMessage} message
 */
export function metaLine(message) {
  if (message.role !== 'assistant' || message.meta?.tier === 'moderation') return '';
  const parts = [];
  if (message.meta?.model) parts.push(message.meta.model);
  if (message.status === 'done' && message.stats) {
    parts.push(`1ª palavra em ${formatMs(message.stats.firstTokenMs)}`, `total ${formatMs(message.stats.latencyMs)}`);
  }
  if (message.status === 'stopped') parts.push('interrompida');
  return parts.join(' · ');
}

/** "Bom dia" / "Boa tarde" / "Boa noite", by the local hour. @param {Date} now */
export function greeting(now) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const GROUPS = /** @type {const} */ ([
  ['Hoje', 0],
  ['Ontem', 1],
  ['Últimos 7 dias', 7],
  ['Últimos 30 dias', 30],
  ['Mais antigas', Infinity],
]);

/**
 * Splits conversations (already sorted, newest first) into date sections for the sidebar,
 * by calendar day in the browser's time zone. Empty sections are left out.
 * @template {{ updatedAt: string }} T
 * @param {T[]} items
 * @param {Date} now
 * @returns {{ label: string, items: T[] }[]}
 */
export function groupConversations(items, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  /** @type {Map<string, T[]>} */
  const buckets = new Map(GROUPS.map(([label]) => [label, []]));
  for (const item of items) {
    const date = new Date(item.updatedAt);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    // Math.round absorbs the 23h/25h days of daylight saving time changes.
    const daysAgo = Number.isNaN(day) ? Infinity : Math.max(0, Math.round((today - day) / DAY_MS));
    const [label] = /** @type {(typeof GROUPS)[number]} */ (GROUPS.find(([, maxDays]) => daysAgo <= maxDays));
    /** @type {T[]} */ (buckets.get(label)).push(item);
  }
  return [...buckets].filter(([, list]) => list.length > 0).map(([label, list]) => ({ label, items: list }));
}

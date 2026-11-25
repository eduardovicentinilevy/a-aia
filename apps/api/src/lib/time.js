/** Usage limits reset at midnight in Brazil, not in UTC. */
export const APP_TIME_ZONE = 'America/Sao_Paulo';

// en-CA formats dates as YYYY-MM-DD.
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * Calendar day (YYYY-MM-DD) in São Paulo for a given instant.
 * @param {Date} [date]
 */
export function dayInSaoPaulo(date = new Date()) {
  return dayFormatter.format(date);
}

/**
 * First and last day (YYYY-MM-DD) of the São Paulo calendar month that contains `date`.
 * @param {Date} [date]
 */
export function monthRangeInSaoPaulo(date = new Date()) {
  const [year, month] = dayInSaoPaulo(date).split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); // day 0 of next month = last day of this one
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

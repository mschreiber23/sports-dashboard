import { easternYmd } from './upcomingGames.js';

const MONTH_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
});

function byDate(events) {
  return [...(events || [])]
    .filter((event) => event?.date && easternYmd(event.date))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function scheduleMonths(events) {
  const groups = new Map();
  for (const event of byDate(events)) {
    const key = easternYmd(event.date).slice(0, 6);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: MONTH_FMT.format(new Date(event.date)),
        events: [],
      });
    }
    groups.get(key).events.push(event);
  }
  return [...groups.values()];
}

export function defaultScheduleMonth(months, now = new Date()) {
  const key = easternYmd(now).slice(0, 6);
  if ((months || []).some((month) => month.key === key)) return key;
  return ((months || []).find((month) => month.key >= key) || months?.[months.length - 1])?.key || '';
}

export function focusScheduleEvent(events, now = new Date()) {
  const today = easternYmd(now);
  const rows = byDate(events);
  return rows.find((event) => easternYmd(event.date) === today)
    || rows.find((event) => easternYmd(event.date) > today)
    || rows[rows.length - 1]
    || null;
}

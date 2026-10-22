// Home cards use the Eastern sports day. A team with no game on that day
// gets the next games that have not been played yet.

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

const YMD_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function easternYmd(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = YMD_FMT.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}${get('month')}${get('day')}`;
}

const LINE_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatKickoff(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return { date: '', time: '', label: '' };
  const day = DATE_FMT.format(date);
  const time = TIME_FMT.format(date);
  return { date: day, time, label: `${day} · ${time}` };
}

export function formatScheduleLine(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = LINE_FMT.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const minute = get('minute');
  const clock = minute === '00' ? get('hour') : `${get('hour')}:${minute}`;
  const period = (get('dayPeriod') || '').toLowerCase().startsWith('p') ? 'p' : 'a';
  return `${get('month')}/${get('day')} ${clock}${period}`;
}

export function gameOnDay(event, dayYmd) {
  if (!event) return null;
  if (!event.date) return event;
  return easternYmd(event.date) === dayYmd ? event : null;
}

export function gameOpponent(event, teamId) {
  const rows = event?.competitions?.[0]?.competitors || [];
  const mine = rows.find((row) => String(row?.team?.id) === String(teamId));
  const other = rows.find((row) => String(row?.team?.id) !== String(teamId));
  return {
    prefix: mine?.homeAway === 'home' ? 'vs' : '@',
    abbr: other?.team?.abbreviation || '',
    name: other?.team?.shortDisplayName || other?.team?.displayName || other?.team?.abbreviation || '',
  };
}

export function selectUpcomingGames(events, dayYmd, now = new Date(), limit = 5) {
  const nowMs = now.getTime();
  return (events || [])
    .filter((event) => {
      const when = new Date(event?.date);
      if (!Number.isFinite(when.getTime())) return false;
      if (easternYmd(when) <= dayYmd) return false;
      const state = event?.competitions?.[0]?.status?.type?.state;
      if (state === 'post') return false;
      if (state !== 'in' && when.getTime() < nowMs) return false;
      return true;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, limit);
}

const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd' };

export function nbaPeriodLabel(period) {
  const n = Number(period?.number);
  if (n >= 1 && n <= 4) return ORDINALS[n] || `${n}th`;
  if (n === 5) return 'OT';
  if (n > 5) return `${n - 4}OT`;
  const display = String(period?.displayValue || '');
  const match = display.match(/(\d+)(st|nd|rd|th)/i);
  if (match) return `${match[1]}${match[2].toLowerCase()}`;
  if (/ot/i.test(display)) return 'OT';
  return display;
}

export function nbaPlayClock(play) {
  const clock = String(play?.clock?.displayValue || '').trim();
  const period = nbaPeriodLabel(play?.period);
  if (clock && period) return `${clock} - ${period}`;
  return clock || period;
}

/* The gamecast feed keeps the plays ESPN puts in that card:
   scores, timeouts, and steals. Misses, rebounds, and fouls stay off it. */
export function nbaPlayTitle(play) {
  const type = String(play?.type?.text || '').replace(/\s+/g, ' ');
  const text = String(play?.text || '');
  const short = String(play?.shortDescription || '').trim();
  if (/timeout/i.test(type) || /^timeout$/i.test(short)) return 'Timeout';
  if (play?.scoringPlay) {
    if (/^\+\d/.test(short)) return short;
    const points = Number(play.scoreValue);
    if (points === 1) return '+1 Point';
    if (points > 1) return `+${points} Points`;
    return 'Score';
  }
  if (/steals/i.test(text)) return 'Steal';
  return '';
}

export function nbaNotablePlays(plays) {
  return (plays || []).filter((play) => nbaPlayTitle(play)).slice().reverse();
}

export function nbaWinLabel(homeWin, awayAbbr, homeAbbr) {
  if (homeWin == null || homeWin === '') return '';
  const pct = Number(homeWin);
  if (!Number.isFinite(pct)) return '';
  const homeFavored = pct >= 0.5;
  const shown = (homeFavored ? pct : 1 - pct) * 100;
  const abbr = homeFavored ? homeAbbr : awayAbbr;
  if (!abbr) return '';
  return `Win %: ${abbr}, ${shown.toFixed(1)}`;
}

function statAt(stats, labels, name) {
  const index = (labels || []).indexOf(name);
  if (index < 0) return '—';
  const value = stats?.[index];
  return value == null || value === '' ? '—' : value;
}

export function nbaOnCourt(statGroup) {
  const labels = statGroup?.labels || [];
  return (statGroup?.athletes || [])
    .filter((athlete) => athlete?.active && !athlete.didNotPlay)
    .map((athlete) => {
      const player = athlete.athlete || {};
      const shot = player.headshot;
      return {
        id: player.id || '',
        name: player.shortName || player.displayName || '',
        headshot: typeof shot === 'string' ? shot : shot?.href || '',
        jersey: player.jersey || '',
        pos: athlete.position?.abbreviation || player.position?.abbreviation || '',
        pts: statAt(athlete.stats, labels, 'PTS'),
        fg: statAt(athlete.stats, labels, 'FG'),
        reb: statAt(athlete.stats, labels, 'REB'),
        ast: statAt(athlete.stats, labels, 'AST'),
        pf: statAt(athlete.stats, labels, 'PF'),
      };
    });
}

export function nbaCourtSides(boxscore, competitors) {
  const comps = competitors || [];
  const away = comps.find((comp) => comp.homeAway === 'away') || comps[0];
  const home = comps.find((comp) => comp.homeAway === 'home') || comps[1];
  const groups = boxscore?.players || [];
  const side = (comp) => {
    if (!comp) return null;
    const id = String(comp.team?.id || comp.id || '');
    const group = groups.find((item) => String(item.team?.id) === id);
    const players = nbaOnCourt(group?.statistics?.[0]);
    if (!players.length) return null;
    return {
      id,
      name: comp.team?.name || comp.team?.shortDisplayName || group?.team?.name || comp.team?.displayName || group?.team?.displayName || '',
      team: comp.team || group?.team || null,
      players,
    };
  };
  return [side(away), side(home)].filter(Boolean);
}

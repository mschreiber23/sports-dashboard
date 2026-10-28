const LINE = [
  ['PTS', 'p'],
  ['REB', 'r'],
  ['AST', 'a'],
  ['STL', 's'],
  ['BLK', 'b'],
  ['TO', 't'],
  ['PF', 'f'],
];

function statNumber(value) {
  const match = String(value ?? '').match(/-?\d+/);
  return match ? String(Number(match[0])) : '0';
}

export function minutesPlayed(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '--' || /^dnp/i.test(text)) return 0;
  const match = text.match(/^(\d+)(?::(\d+))?/);
  if (!match) return 0;
  return Number(match[1]) + (match[2] ? Number(match[2]) / 60 : 0);
}

export function playedName(athlete) {
  const short = String(athlete?.shortName || '').trim();
  if (/^[A-Za-z]\. /.test(short)) return short;
  const first = String(athlete?.firstName || '').trim();
  const last = String(athlete?.lastName || '').trim();
  if (first && last) return `${first[0].toUpperCase()}. ${last}`;
  const parts = String(athlete?.displayName || short).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return short || parts[0] || '';
  return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`;
}

export function nbaStatLine(labels, stats) {
  const index = new Map((labels || []).map((label, i) => [label, i]));
  return LINE.map(([label, letter]) => `${statNumber(stats?.[index.get(label)])}${letter}`).join('/');
}

export function nbaPlayedSides(summary, awayId, homeId) {
  const groups = summary?.boxscore?.players || [];
  const sides = groups.map((group) => {
    const statGroup = (group.statistics || [])[0] || {};
    const labels = statGroup.labels || [];
    const minuteIndex = labels.indexOf('MIN');
    const pointIndex = labels.indexOf('PTS');
    const players = (statGroup.athletes || [])
      .filter((row) => !row.didNotPlay && minutesPlayed(minuteIndex >= 0 ? row.stats?.[minuteIndex] : '') > 0)
      .map((row) => ({
        id: String(row.athlete?.id || row.athlete?.displayName || ''),
        name: playedName(row.athlete),
        points: Number(statNumber(pointIndex >= 0 ? row.stats?.[pointIndex] : 0)),
        line: nbaStatLine(labels, row.stats),
      }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    return {
      id: String(group.team?.id || ''),
      abbr: group.team?.abbreviation || '',
      order: group.displayOrder ?? 99,
      players,
    };
  });
  const byId = (id) => sides.find((side) => id && side.id === String(id));
  const away = byId(awayId) || sides.find((side) => side.order === 1) || sides[0];
  const home = byId(homeId) || sides.find((side) => side !== away);
  return [away, home].filter(Boolean);
}

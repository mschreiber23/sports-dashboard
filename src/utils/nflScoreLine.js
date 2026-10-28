import { playedName } from './nbaScoreLine.js';

export const NFL_STAT_GROUPS = [
  {
    key: 'passing',
    label: 'Passing',
    columns: [
      { key: 'C/ATT', label: 'C/ATT', raw: true },
      { key: 'YDS', label: 'YDS' },
      { key: 'TD', label: 'TD' },
      { key: 'INT', label: 'INT' },
    ],
  },
  {
    key: 'rushing',
    label: 'Rushing',
    columns: [
      { key: 'CAR', label: 'CAR' },
      { key: 'YDS', label: 'YDS' },
      { key: 'TD', label: 'TD' },
    ],
  },
  {
    key: 'receiving',
    label: 'Receiving',
    columns: [
      { key: 'REC', label: 'REC' },
      { key: 'YDS', label: 'YDS' },
      { key: 'TD', label: 'TD' },
    ],
  },
];

function statNumber(value) {
  const text = String(value ?? '').replace(/,/g, '');
  const match = text.match(/-?\d+/);
  return match ? String(Number(match[0])) : '0';
}

function statText(value) {
  const text = String(value ?? '').trim();
  return text || '0/0';
}

function attempts(value) {
  const match = String(value ?? '').match(/(\d+)\s*\/\s*(\d+)/);
  return match ? Number(match[2]) : 0;
}

function playedGroup(group, spec) {
  const labels = group?.labels || [];
  const index = new Map(labels.map((label, i) => [label, i]));
  const read = (row, key) => row.stats?.[index.get(key)];
  const players = (group?.athletes || [])
    .map((row) => {
      const values = {};
      for (const col of spec.columns) {
        values[col.key] = col.raw ? statText(read(row, col.key)) : statNumber(read(row, col.key));
      }
      return {
        id: String(row.athlete?.id || row.athlete?.displayName || ''),
        name: playedName(row.athlete),
        yards: Number(statNumber(read(row, 'YDS'))),
        targets: Number(statNumber(read(row, 'TGTS'))),
        values,
      };
    })
    .filter((player) => {
      if (spec.key === 'passing') return attempts(player.values['C/ATT']) > 0;
      if (spec.key === 'rushing') return Number(player.values.CAR) > 0;
      return Number(player.values.REC) > 0 || player.targets > 0;
    })
    .sort((a, b) => b.yards - a.yards || a.name.localeCompare(b.name))
    .map((player) => ({
      id: player.id,
      name: player.name,
      stats: spec.columns.map((col) => player.values[col.key]),
    }));
  return players;
}

export function nflPlayedSides(summary, awayId, homeId) {
  const groups = summary?.boxscore?.players || [];
  const sides = groups.map((group) => {
    const byName = new Map((group.statistics || []).map((stat) => [stat.name || stat.type, stat]));
    const sections = NFL_STAT_GROUPS
      .map((spec) => ({
        key: spec.key,
        label: spec.label,
        columns: spec.columns,
        players: playedGroup(byName.get(spec.key), spec),
      }))
      .filter((section) => section.players.length > 0);
    return {
      id: String(group.team?.id || ''),
      abbr: group.team?.abbreviation || '',
      order: group.displayOrder ?? 99,
      sections,
    };
  });
  const byId = (id) => sides.find((side) => id && side.id === String(id));
  const away = byId(awayId) || sides.find((side) => side.order === 1) || sides[0];
  const home = byId(homeId) || sides.find((side) => side !== away);
  return [away, home].filter(Boolean);
}

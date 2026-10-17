// NHL box-score groups reuse abbreviations. SOG on that feed is shootout
// goals. Shots on goal are S. A skater can also sit in a later group with a
// different label set, so the card takes the first matching skater group.

const SKATER_GROUPS = ['forwards', 'defenses', 'skaters'];

export function nhlCardSeasonYear(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value);
  return month >= 9 ? year + 1 : year;
}

export function nhlCardSeasonLabel(now = new Date()) {
  const end = nhlCardSeasonYear(now);
  return `${end - 1}-${String(end).slice(-2)}`;
}

function labeled(labels, values) {
  const map = {};
  (labels || []).forEach((label, index) => {
    map[label] = values?.[index] ?? '—';
  });
  return map;
}

export function nhlGameStatMap(groups, athleteId, goalie) {
  const id = String(athleteId || '');
  if (!id) return null;
  const order = goalie ? ['goalies'] : SKATER_GROUPS;
  const ranked = [...(groups || [])].sort((a, b) => {
    const ai = order.indexOf(a?.name);
    const bi = order.indexOf(b?.name);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  for (const group of ranked) {
    if (goalie && group?.name !== 'goalies') continue;
    if (!goalie && group?.name === 'goalies') continue;
    const athlete = (group?.athletes || []).find((row) => String(row?.athlete?.id) === id);
    if (!athlete?.stats?.length) continue;
    return labeled(group.labels, athlete.stats);
  }
  return null;
}

function categoryMap(categories) {
  const byName = {};
  for (const category of categories || []) {
    const stats = {};
    for (const stat of category?.stats || []) stats[stat.abbreviation] = stat.displayValue;
    byName[category?.name] = stats;
  }
  return byName;
}

export function nhlSeasonStatMap(categories, goalie) {
  const byName = categoryMap(categories);
  if (goalie) {
    const defense = byName.defensive || {};
    return {
      SV: defense.SV,
      SA: defense.SA,
      GA: defense.GA,
      'SV%': defense['SV%'],
    };
  }
  const offense = byName.offensive || {};
  const defense = byName.defensive || {};
  const general = byName.general || {};
  const penalties = byName.penalties || {};
  return {
    G: offense.G,
    A: offense.A,
    '+/-': general['+/-'],
    S: offense.S,
    HT: defense.HT,
    BS: defense.BS,
    PIM: penalties.PIM,
    TK: undefined,
    GV: undefined,
    TOI: general.TOI,
  };
}

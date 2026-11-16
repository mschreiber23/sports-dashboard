/* NFL player cards. ESPN repeats abbreviations inside one category
   (passing TD, then total TD, both called TD). Read by stat name. */

const DEFENSE = new Set([
  'DE', 'DT', 'NT', 'DL', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB',
  'CB', 'S', 'SS', 'FS', 'DB', 'SAF', 'NB', 'DI',
]);

const HOME = {
  qb: [['GP', 'GP'], ['YDS', 'YDS'], ['TD', 'TD'], ['INT', 'INT']],
  rb: [['GP', 'GP'], ['CAR', 'CAR'], ['YDS', 'YDS'], ['TD', 'TD']],
  wr: [['GP', 'GP'], ['REC', 'REC'], ['YDS', 'YDS'], ['TD', 'TD']],
  te: [['GP', 'GP'], ['REC', 'REC'], ['YDS', 'YDS'], ['TD', 'TD']],
  def: [['GP', 'GP'], ['TOT', 'TOT'], ['SACK', 'SACK'], ['INT', 'INT']],
  k: [['GP', 'GP'], ['FG', 'FG'], ['XP', 'XP'], ['PTS', 'PTS']],
  p: [['GP', 'GP'], ['NO', 'NO'], ['AVG', 'AVG'], ['IN20', 'IN20']],
};

const FOLD = {
  qb: [
    ['passing', 'passingYards', 'YDS', 'YDS', 0],
    ['passing', 'passingTouchdowns', 'TD', 'TD', 0],
    ['passing', 'interceptions', 'INT', 'INT', 0],
  ],
  rb: [
    ['rushing', 'rushingAttempts', 'CAR', 'CAR', 0],
    ['rushing', 'rushingYards', 'YDS', 'YDS', 0],
    ['rushing', 'rushingTouchdowns', 'TD', 'TD', 0],
  ],
  wr: [
    ['receiving', 'receptions', 'REC', 'REC', 0],
    ['receiving', 'receivingYards', 'YDS', 'YDS', 0],
    ['receiving', 'receivingTouchdowns', 'TD', 'TD', 0],
  ],
  te: [
    ['receiving', 'receptions', 'REC', 'REC', 0],
    ['receiving', 'receivingYards', 'YDS', 'YDS', 0],
    ['receiving', 'receivingTouchdowns', 'TD', 'TD', 0],
  ],
  def: [
    ['defensive', 'totalTackles', 'TOT', 'TOT', 0],
    ['defensive', 'sacks', 'SACK', 'SACK', 0],
    ['defensiveInterceptions', 'interceptions', 'INT', 'INT', 0],
  ],
  k: [
    ['kicking', 'totalKickingPoints', 'PTS', 'PTS', 0],
  ],
  p: [
    ['punting', 'punts', 'PUNTS', 'PUNTS', 0],
  ],
};

export function nflPositionGroup(position) {
  const pos = String(position || '').toUpperCase().trim();
  if (pos === 'QB') return 'qb';
  if (pos === 'RB' || pos === 'HB' || pos === 'FB') return 'rb';
  if (pos === 'WR') return 'wr';
  if (pos === 'TE') return 'te';
  if (pos === 'PK' || pos === 'K') return 'k';
  if (pos === 'P') return 'p';
  if (DEFENSE.has(pos)) return 'def';
  return null;
}

function category(categories, name) {
  const want = name.toLowerCase();
  return (categories || []).find((cat) => (cat.name || '').toLowerCase() === want) || null;
}

function read(cat, name, abbr) {
  const stats = cat?.stats || [];
  const named = name ? stats.find((stat) => stat.name === name) : null;
  if (named && named.displayValue != null && named.displayValue !== '') return named.displayValue;
  const found = abbr ? stats.find((stat) => stat.abbreviation === abbr) : null;
  return found?.displayValue ?? null;
}

function amount(value) {
  const n = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function pair(made, attempts) {
  if (made == null && attempts == null) return null;
  return `${made ?? '0'}/${attempts ?? '0'}`;
}

function show(map, key, value) {
  map[key] = value == null || value === '' ? '—' : value;
}

export function inferNflGroup(categories) {
  if (amount(read(category(categories, 'passing'), 'passingAttempts', 'ATT')) > 0) return 'qb';
  const rushes = amount(read(category(categories, 'rushing'), 'rushingAttempts', 'CAR'));
  const catches = amount(read(category(categories, 'receiving'), 'receptions', 'REC'));
  if (rushes > 0 && rushes >= catches) return 'rb';
  if (catches > 0) return 'wr';
  const tackles = amount(read(category(categories, 'defensive'), 'totalTackles', 'TOT'));
  const sacks = amount(read(category(categories, 'defensive'), 'sacks', 'SACK'));
  if (tackles > 0 || sacks > 0) return 'def';
  const kicks = amount(read(category(categories, 'kicking'), 'fieldGoalsMade', 'FGM'))
    + amount(read(category(categories, 'kicking'), 'extraPointsMade', 'XPM'));
  if (kicks > 0) return 'k';
  if (amount(read(category(categories, 'punting'), 'punts', 'PUNTS')) > 0) return 'p';
  return null;
}

export function nflSeasonStatMap(categories, position) {
  const group = nflPositionGroup(position) || inferNflGroup(categories);
  if (!group) return {};
  const passing = category(categories, 'passing');
  const rushing = category(categories, 'rushing');
  const receiving = category(categories, 'receiving');
  const defensive = category(categories, 'defensive');
  const picks = category(categories, 'defensiveInterceptions');
  const kicking = category(categories, 'kicking');
  const punting = category(categories, 'punting');
  const general = category(categories, 'general');
  const map = {};
  const games = read(general, 'gamesPlayed', 'GP');
  if (games != null) map.GP = games;

  if (group === 'qb') {
    const cmp = read(passing, 'completions', 'CMP');
    const att = read(passing, 'passingAttempts', 'ATT');
    show(map, 'C/ATT', pair(cmp, att));
    show(map, 'YDS', read(passing, 'passingYards', 'YDS'));
    show(map, 'TD', read(passing, 'passingTouchdowns', 'TD'));
    show(map, 'INT', read(passing, 'interceptions', 'INT'));
    show(map, 'CAR', read(rushing, 'rushingAttempts', 'CAR'));
    show(map, 'RYDS', read(rushing, 'rushingYards', 'YDS'));
    show(map, 'RTD', read(rushing, 'rushingTouchdowns', 'TD'));
  } else if (group === 'rb') {
    show(map, 'CAR', read(rushing, 'rushingAttempts', 'CAR'));
    show(map, 'YDS', read(rushing, 'rushingYards', 'YDS'));
    show(map, 'TD', read(rushing, 'rushingTouchdowns', 'TD'));
    show(map, 'REC', read(receiving, 'receptions', 'REC'));
    show(map, 'TGTS', read(receiving, 'receivingTargets', 'TGTS'));
    show(map, 'RECYDS', read(receiving, 'receivingYards', 'YDS'));
    show(map, 'RECTD', read(receiving, 'receivingTouchdowns', 'TD'));
  } else if (group === 'wr' || group === 'te') {
    show(map, 'REC', read(receiving, 'receptions', 'REC'));
    show(map, 'TGTS', read(receiving, 'receivingTargets', 'TGTS'));
    show(map, 'RECYDS', read(receiving, 'receivingYards', 'YDS'));
    show(map, 'RECTD', read(receiving, 'receivingTouchdowns', 'TD'));
  } else if (group === 'def') {
    show(map, 'TOT', read(defensive, 'totalTackles', 'TOT'));
    show(map, 'SOLO', read(defensive, 'soloTackles', 'SOLO'));
    show(map, 'SACK', read(defensive, 'sacks', 'SACK'));
    show(map, 'TFL', read(defensive, 'tacklesForLoss', 'TFL'));
    show(map, 'PD', read(defensive, 'passesDefended', 'PD'));
    show(map, 'INT', read(picks, 'interceptions', 'INT') ?? '0');
  } else if (group === 'k') {
    show(map, 'FG', pair(read(kicking, 'fieldGoalsMade', 'FGM'), read(kicking, 'fieldGoalAttempts', 'FGA')));
    show(map, 'PCT', read(kicking, 'fieldGoalPct', 'FG%'));
    show(map, 'LONG', read(kicking, 'longFieldGoalMade', 'LNG'));
    show(map, 'XP', pair(read(kicking, 'extraPointsMade', 'XPM'), read(kicking, 'extraPointAttempts', 'XPA')));
    show(map, 'PTS', read(kicking, 'totalKickingPoints', 'PTS'));
  } else if (group === 'p') {
    show(map, 'NO', read(punting, 'punts', 'PUNTS'));
    show(map, 'AVG', read(punting, 'grossAvgPuntYards', 'AVG'));
    show(map, 'NET', read(punting, 'netAvgPuntYards', 'NET'));
    show(map, 'TB', read(punting, 'touchbacks', 'TB'));
    show(map, 'IN20', read(punting, 'puntsInside20', 'IN20'));
    show(map, 'LONG', read(punting, 'longPunt', 'LNG'));
  }

  const lost = read(general, 'fumblesLost', 'LST');
  if (lost != null) map.FUM = lost;
  return map;
}

export function nflHomeLines(statsData) {
  const categories = statsData?.splits?.categories || [];
  const group = nflPositionGroup(statsData?._position) || inferNflGroup(categories);
  const specs = HOME[group];
  if (!specs) return [];
  const map = nflSeasonStatMap(categories, statsData?._position || '');
  return specs.map(([key, label]) => ({ label, value: map[key] ?? '—' }));
}

function groupValues(groups, name) {
  const grp = (groups || []).find((item) => (item.name || '').toLowerCase() === name);
  if (!grp) return null;
  const map = {};
  (grp.labels || []).forEach((label, index) => {
    map[label] = grp.stats?.[index] ?? '0';
  });
  return map;
}

export function nflGameStatMap(groups, position) {
  const group = nflPositionGroup(position);
  if (!group) return {};
  const passing = groupValues(groups, 'passing');
  const rushing = groupValues(groups, 'rushing');
  const receiving = groupValues(groups, 'receiving');
  const defensive = groupValues(groups, 'defensive');
  const picks = groupValues(groups, 'interceptions');
  const kicking = groupValues(groups, 'kicking');
  const punting = groupValues(groups, 'punting');
  const fumbles = groupValues(groups, 'fumbles');
  const map = {};

  if (group === 'qb') {
    if (!passing) return {};
    map['C/ATT'] = passing['C/ATT'];
    map.YDS = passing.YDS;
    map.TD = passing.TD;
    map.INT = passing.INT;
    map.CAR = rushing?.CAR ?? '0';
    map.RYDS = rushing?.YDS ?? '0';
    map.RTD = rushing?.TD ?? '0';
  } else if (group === 'rb') {
    if (!rushing && !receiving) return {};
    map.CAR = rushing?.CAR ?? '0';
    map.YDS = rushing?.YDS ?? '0';
    map.TD = rushing?.TD ?? '0';
    map.REC = receiving?.REC ?? '0';
    map.TGTS = receiving?.TGTS ?? '0';
    map.RECYDS = receiving?.YDS ?? '0';
    map.RECTD = receiving?.TD ?? '0';
  } else if (group === 'wr' || group === 'te') {
    if (!receiving) return {};
    map.REC = receiving.REC;
    map.TGTS = receiving.TGTS;
    map.RECYDS = receiving.YDS;
    map.RECTD = receiving.TD;
  } else if (group === 'def') {
    if (!defensive && !picks) return {};
    map.TOT = defensive?.TOT ?? '0';
    map.SOLO = defensive?.SOLO ?? '0';
    map.SACK = defensive?.SACKS ?? '0';
    map.TFL = defensive?.TFL ?? '0';
    map.PD = defensive?.PD ?? '0';
    map.INT = picks?.INT ?? '0';
    map.FF = '0';
  } else if (group === 'k') {
    if (!kicking) return {};
    map.FG = kicking.FG;
    map.PCT = kicking.PCT;
    map.LONG = kicking.LONG;
    map.XP = kicking.XP;
    map.PTS = kicking.PTS;
  } else if (group === 'p') {
    if (!punting) return {};
    map.NO = punting.NO;
    map.AVG = punting.AVG;
    map.TB = punting.TB;
    map.IN20 = punting['In 20'];
    map.LONG = punting.LONG;
  }

  if (fumbles?.LOST != null) map.FUM = fumbles.LOST;
  else if (fumbles?.FUM != null) map.FUM = fumbles.FUM;
  return map;
}

export function nflFoldTargets(position, categories) {
  const group = nflPositionGroup(position) || inferNflGroup(categories);
  return (FOLD[group] || []).map(([cat, name, abbr, label, index]) => ({ cat, name, abbr, label, index }));
}

/* Season lines for the home player cards. Four stats stay in the grid.
   Games played is separate so the grid does not grow. */

function categoryStats(cat) {
  const result = {};
  (cat?.stats || []).forEach((stat) => { result[stat.abbreviation] = stat.displayValue; });
  return result;
}

function namedStat(cat, names) {
  const stats = cat?.stats || [];
  for (const name of names) {
    const found = stats.find((stat) => stat.name === name);
    if (found?.displayValue != null && found.displayValue !== '') return found.displayValue;
  }
  return null;
}

export function gamesPlayedValue(statsData, sport) {
  if (!statsData) return null;
  if (statsData._merged && Object.prototype.hasOwnProperty.call(statsData._merged, 'GP')) {
    return statsData._merged.GP ?? null;
  }
  const categories = statsData.splits?.categories || [];
  if (sport === 'mlb') {
    const pitching = categories.find((cat) => cat.name === 'pitching');
    if (pitching) return namedStat(pitching, ['gamesPlayed']);
    return namedStat(categories.find((cat) => cat.name === 'batting'), ['gamesPlayed']);
  }
  const general = categories.find((cat) => cat.name === 'general');
  return namedStat(general, ['gamesPlayed', 'games']);
}

export function gamesPlayedLine(stats, value) {
  if (value == null || value === '') return null;
  if ((stats || []).some((stat) => stat.label === 'GP')) return null;
  return String(value);
}

export function extractSeasonStats(statsData, sport) {
  if (!statsData) return [];
  const categories = statsData.splits?.categories || [];
  const position = (statsData._position || '').toUpperCase();

  const mergeAll = () => {
    const merged = {};
    categories.forEach((cat) => Object.assign(merged, categoryStats(cat)));
    return merged;
  };

  if (sport === 'mlb') {
    const pitching = categories.find((cat) => cat.name === 'pitching');
    const batting = categories.find((cat) => cat.name === 'batting');
    if (pitching) {
      const pitchingStats = categoryStats(pitching);
      const general = categoryStats(categories.find((cat) => cat.name === 'general'));
      const wins = general.WINS || pitchingStats.W || '—';
      const losses = pitchingStats.L || '—';
      return [
        { label: 'W-L', value: wins && losses && wins !== '—' ? `${wins}-${losses}` : '—' },
        { label: 'ERA', value: pitchingStats.ERA },
        { label: 'WHIP', value: pitchingStats.WHIP },
        { label: 'K', value: pitchingStats.K || pitchingStats.SO },
      ];
    }
    const battingStats = categoryStats(batting || categories[0]);
    return [
      { label: 'AVG', value: battingStats.AVG },
      { label: 'OBP', value: battingStats.OBP },
      { label: 'HR', value: battingStats.HR },
      { label: 'RBI', value: battingStats.RBI },
    ];
  }

  if (sport === 'nba') {
    const merged = statsData._merged || mergeAll();
    const steals = parseFloat(merged.STL || 0);
    const blocks = parseFloat(merged.BLK || 0);
    const stocks = (steals + blocks).toFixed(1);
    return [
      { label: 'PTS', value: merged.PTS },
      { label: 'REB', value: merged.REB },
      { label: 'AST', value: merged.AST },
      { label: 'STOCKS', value: stocks === '0.0' ? '—' : stocks },
    ];
  }

  if (sport === 'nfl') {
    const passing = categories.find((cat) => cat.name?.includes('pass'));
    const rushing = categories.find((cat) => cat.name?.includes('rush'));
    const receiving = categories.find((cat) => cat.name?.includes('receiv'));
    const games = categoryStats(categories.find((cat) => cat.name === 'general')).GP || '—';

    if (['QB'].includes(position) || (!position && passing)) {
      const passingStats = categoryStats(passing);
      return [
        { label: 'GP', value: games },
        { label: 'YDS', value: passingStats.YDS },
        { label: 'TD', value: passingStats.TD },
        { label: 'INT', value: passingStats.INT },
      ];
    }
    if (['RB', 'HB', 'FB'].includes(position) || (!position && rushing && !passing)) {
      const rushingStats = categoryStats(rushing);
      return [
        { label: 'GP', value: games },
        { label: 'CAR', value: rushingStats.CAR },
        { label: 'YDS', value: rushingStats.YDS },
        { label: 'TD', value: rushingStats.TD },
      ];
    }
    const receivingStats = categoryStats(receiving);
    return [
      { label: 'GP', value: games },
      { label: 'REC', value: receivingStats.REC },
      { label: 'YDS', value: receivingStats.YDS },
      { label: 'TD', value: receivingStats.TD },
    ];
  }

  if (sport === 'nhl') {
    const merged = mergeAll();
    Object.assign(merged, categoryStats(categories.find((cat) => cat.name === 'offensive')));

    if (['G', 'GK'].includes(position)) {
      const defensive = categoryStats(categories.find((cat) => cat.name === 'defensive'));
      const general = categoryStats(categories.find((cat) => cat.name === 'general'));
      return [
        { label: 'W', value: general.WINS || merged.W },
        { label: 'GAA', value: defensive.GAA || merged.GAA },
        { label: 'SV%', value: defensive['SV%'] || merged['SV%'] },
        { label: 'SO', value: defensive.SO || merged.SO },
      ];
    }
    return [
      { label: 'G', value: merged.G },
      { label: 'A', value: merged.A },
      { label: 'PTS', value: merged.PTS },
      { label: '+/-', value: merged['+/-'] },
    ];
  }

  const first = categoryStats(categories[0]);
  return Object.entries(first).slice(0, 4).map(([label, value]) => ({ label, value }));
}

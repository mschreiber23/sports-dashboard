import { activeSeasonYear } from '../api/espn.js';
import { seasonLabel } from './nhlCareer.js';

const NBA_COLS = ['G', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG%', '3P%', 'FT%'];
const NFL_COLS = {
  Passing: ['G', 'C/ATT', 'YDS', 'TD', 'INT', 'RTG'],
  Rushing: ['G', 'CAR', 'YDS', 'AVG', 'TD'],
  Receiving: ['G', 'REC', 'YDS', 'AVG', 'TD'],
};
const NHL_SKATER_COLS = ['G', 'A', 'PTS', '+/-', 'PIM', 'SOG', 'PPG', 'SHG'];
const NHL_GOALIE_COLS = ['GP', 'W', 'L', 'GAA', 'SV%', 'SO'];

const POS_LABELS = {
  sp: 'SP', cl: 'CL', rp: 'RP', c: 'C', '1b': '1B', '2b': '2B', '3b': '3B',
  ss: 'SS', lf: 'LF', cf: 'CF', rf: 'RF', dh: 'DH', p: 'P',
  pg: 'PG', sg: 'SG', sf: 'SF', pf: 'PF',
  qb: 'QB', rb: 'RB', fb: 'FB', wr: 'WR', te: 'TE',
  wr1: 'WR1', wr2: 'WR2', wr3: 'WR3',
  lt: 'LT', lg: 'LG', rg: 'RG', rt: 'RT',
  lde: 'LDE', ldt: 'LDT', rdt: 'RDT', rde: 'RDE',
  wlb: 'WLB', mlb: 'MLB', slb: 'SLB',
  lcb: 'LCB', rcb: 'RCB', nb: 'NB', fs: 'FS',
  de: 'DE', dt: 'DT', lb: 'LB', cb: 'CB', s: 'S', k: 'K',
  pk: 'PK', h: 'H', pr: 'PR', kr: 'KR', ls: 'LS',
  lw: 'LW', rw: 'RW', ld: 'LD', rd: 'RD', g: 'G', d: 'D',
};

export function statsSeasonChoices(sport, now = new Date()) {
  const current = activeSeasonYear(sport, now);
  return [0, 1, 2, 3].map((offset) => {
    const year = current - offset;
    const label = sport === 'nba' || sport === 'nhl' ? seasonLabel(year) : String(year);
    return { year, label };
  });
}

/** First display value for each stat name. Later repeats (per-48, totals) are ignored. */
export function statsByName(data) {
  const out = {};
  for (const cat of data?.splits?.categories || []) {
    if (!cat?.name) continue;
    const bucket = {};
    for (const stat of cat.stats || []) {
      if (stat?.name && bucket[stat.name] == null) bucket[stat.name] = stat.displayValue;
    }
    out[cat.name] = bucket;
  }
  return out;
}

function from(byName, category, name) {
  const value = byName?.[category]?.[name];
  return value == null || value === '' ? null : value;
}

function anywhere(byName, name) {
  for (const cat of Object.values(byName || {})) {
    if (cat?.[name] != null && cat[name] !== '') return cat[name];
  }
  return null;
}

function cell(value) {
  return value == null || value === '' ? '—' : value;
}

function num(value) {
  const parsed = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function played(value) {
  return num(value) > 0;
}

function nbaRows(players) {
  const rows = players
    .map((player) => {
      const stats = {
        G: cell(anywhere(player.byName, 'gamesPlayed')),
        MIN: cell(anywhere(player.byName, 'avgMinutes')),
        PTS: cell(anywhere(player.byName, 'avgPoints')),
        REB: cell(anywhere(player.byName, 'avgRebounds')),
        AST: cell(anywhere(player.byName, 'avgAssists')),
        STL: cell(anywhere(player.byName, 'avgSteals')),
        BLK: cell(anywhere(player.byName, 'avgBlocks')),
        TO: cell(anywhere(player.byName, 'avgTurnovers')),
        'FG%': cell(anywhere(player.byName, 'fieldGoalPct')),
        '3P%': cell(anywhere(player.byName, 'threePointFieldGoalPct') ?? anywhere(player.byName, 'threePointPct')),
        'FT%': cell(anywhere(player.byName, 'freeThrowPct')),
      };
      return { ...player, stats };
    })
    .filter((player) => played(player.stats.G))
    .sort((a, b) => num(b.stats.PTS) - num(a.stats.PTS));
  return { cols: NBA_COLS, rows };
}

function nflRows(statsType, players) {
  const cols = NFL_COLS[statsType] || NFL_COLS.Passing;
  const rows = players
    .map((player) => {
      const games = from(player.byName, 'general', 'gamesPlayed');
      let stats;
      if (statsType === 'Rushing') {
        stats = {
          G: cell(games),
          CAR: cell(from(player.byName, 'rushing', 'rushingAttempts')),
          YDS: cell(from(player.byName, 'rushing', 'rushingYards')),
          AVG: cell(from(player.byName, 'rushing', 'yardsPerRushAttempt')),
          TD: cell(from(player.byName, 'rushing', 'rushingTouchdowns')),
        };
      } else if (statsType === 'Receiving') {
        stats = {
          G: cell(games),
          REC: cell(from(player.byName, 'receiving', 'receptions')),
          YDS: cell(from(player.byName, 'receiving', 'receivingYards')),
          AVG: cell(from(player.byName, 'receiving', 'yardsPerReception')),
          TD: cell(from(player.byName, 'receiving', 'receivingTouchdowns')),
        };
      } else {
        const completions = from(player.byName, 'passing', 'completions');
        const attempts = from(player.byName, 'passing', 'passingAttempts');
        stats = {
          G: cell(games),
          'C/ATT': completions == null && attempts == null ? '—' : `${cell(completions)}/${cell(attempts)}`,
          YDS: cell(from(player.byName, 'passing', 'passingYards')),
          TD: cell(from(player.byName, 'passing', 'passingTouchdowns')),
          INT: cell(from(player.byName, 'passing', 'interceptions')),
          RTG: cell(from(player.byName, 'passing', 'QBRating') ?? from(player.byName, 'passing', 'quarterbackRating')),
        };
      }
      return { ...player, stats };
    })
    .filter((player) => {
      if (statsType === 'Rushing') return played(player.stats.CAR);
      if (statsType === 'Receiving') return played(player.stats.REC);
      return played(from(player.byName, 'passing', 'passingAttempts'));
    })
    .sort((a, b) => num(b.stats.YDS) - num(a.stats.YDS));
  return { cols, rows };
}

function nhlRows(statsType, players) {
  const goalies = statsType === 'Goalies';
  const cols = goalies ? NHL_GOALIE_COLS : NHL_SKATER_COLS;
  const rows = players
    .filter((player) => {
      const isGoalie = player.pos === 'G';
      return goalies ? isGoalie : !isGoalie;
    })
    .map((player) => {
      const stats = goalies
        ? {
          GP: cell(from(player.byName, 'general', 'games')),
          W: cell(from(player.byName, 'general', 'wins')),
          L: cell(from(player.byName, 'general', 'losses')),
          GAA: cell(from(player.byName, 'defensive', 'avgGoalsAgainst')),
          'SV%': cell(from(player.byName, 'defensive', 'savePct')),
          SO: cell(from(player.byName, 'defensive', 'shutouts')),
        }
        : {
          G: cell(from(player.byName, 'offensive', 'goals')),
          A: cell(from(player.byName, 'offensive', 'assists')),
          PTS: cell(from(player.byName, 'offensive', 'points')),
          '+/-': cell(from(player.byName, 'general', 'plusMinus')),
          PIM: cell(from(player.byName, 'penalties', 'penaltyMinutes')),
          SOG: cell(from(player.byName, 'offensive', 'shotsTotal')),
          PPG: cell(from(player.byName, 'offensive', 'powerPlayGoals')),
          SHG: cell(from(player.byName, 'offensive', 'shortHandedGoals')),
        };
      return { ...player, stats };
    })
    .filter((player) => played(from(player.byName, 'general', goalies ? 'games' : 'games')))
    .sort((a, b) => num(b.stats.PTS || b.stats.W) - num(a.stats.PTS || a.stats.W));
  return { cols, rows };
}

export function buildTeamStatRows(sport, statsType, players) {
  const list = Array.isArray(players) ? players : [];
  if (sport === 'nba') return nbaRows(list);
  if (sport === 'nfl') return nflRows(statsType, list);
  if (sport === 'nhl') return nhlRows(statsType, list);
  return { cols: [], rows: [] };
}

export function depthCharts(data) {
  const charts = Array.isArray(data?.depthchart) ? data.depthchart : [];
  return charts
    .map((chart) => {
      const positions = chart?.positions || {};
      const rows = Object.keys(positions)
        .map((key) => ({
          key,
          label: POS_LABELS[key] || String(key).toUpperCase(),
          athletes: positions[key]?.athletes || [],
        }))
        .filter((row) => row.athletes.length);
      return { name: chart?.name || '', rows };
    })
    .filter((chart) => chart.rows.length);
}

export function scheduleOpponentLogo(team) {
  return team?.logo || team?.logos?.[0]?.href || null;
}

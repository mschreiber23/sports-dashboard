/* ─── MiLB API — MLB Stats API minor-league helpers ─── */

export const MILB_LEVELS = {
  11: 'AAA',
  12: 'AA',
  13: 'A+',
  14: 'A',
};

const STATSAPI = 'https://statsapi.mlb.com/api/v1';
const ALL_SPORT_IDS = '11,12,13,14';

export function levelShort(sportId) {
  return MILB_LEVELS[Number(sportId)] || '?';
}

export function milbState(game) {
  const s = game.status?.abstractGameState || '';
  if (s === 'Live') return 'in';
  if (s === 'Final') return 'post';
  return 'pre';
}

/** Fetch all MiLB games for a given ISO date (YYYY-MM-DD). */
export async function fetchMiLBSchedule(isoDate) {
  const r = await fetch(
    `${STATSAPI}/schedule?sportId=${ALL_SPORT_IDS}&date=${isoDate}` +
    `&hydrate=team,linescore&gameType=R,F,D,L,W,C`
  );
  const d = await r.json();
  const out = [];
  for (const dateObj of (d.dates || [])) {
    for (const game of (dateObj.games || [])) out.push(game);
  }
  return out;
}

/** Convert an MLB Stats API schedule game to an ESPN-compatible shape for sort/render. */
export function normalizeMiLBGame(game) {
  const away = game.teams?.away || {};
  const home = game.teams?.home || {};
  const state = milbState(game);
  const ls = game.linescore || {};

  const mkTeam = (side, t) => ({
    homeAway: side,
    score: String(t.score ?? ''),
    team: {
      id: String(t.team?.id || ''),
      abbreviation: t.team?.abbreviation || '',
      displayName: t.team?.name || '',
      shortDisplayName: t.team?.teamName || t.team?.name || '',
      color: null,
      alternateColor: null,
      logo: `https://www.mlbstatic.com/team-logos/${t.team?.id}.svg`,
    },
  });

  return {
    id: String(game.gamePk),
    _isMiLB: true,
    _gamePk: game.gamePk,
    _sportId: game.sport?.id,
    competitions: [{
      _gamePk: game.gamePk,
      _sportId: game.sport?.id,
      _linescore: ls,
      competitors: [mkTeam('away', away), mkTeam('home', home)],
      status: {
        type: {
          state,
          shortDetail: state === 'in'
            ? `${ls.inningHalf === 'Bottom' ? 'BOT' : 'TOP'} ${ls.currentInning || ''}`
            : state === 'post' ? 'Final' : '',
        },
      },
    }],
  };
}

/** Fetch season stats for a MiLB player from MLB Stats API. Returns ESPN-compatible stat map. */
export async function fetchMiLBSeasonStats(playerId, posAbb) {
  const isPitcher = /^(SP|RP|P|CP)$/i.test(posAbb || '');
  const group = isPitcher ? 'pitching' : 'hitting';
  const year = new Date().getFullYear();
  try {
    const r = await fetch(
      `${STATSAPI}/people/${playerId}/stats?stats=season&season=${year}` +
      `&group=${group}&sportId=${ALL_SPORT_IDS}`
    );
    const d = await r.json();
    const stat = d.stats?.[0]?.splits?.[0]?.stat || {};
    if (isPitcher) {
      return {
        IP:  stat.inningsPitched ?? '0.0',
        H:   String(stat.hits         ?? 0),
        R:   String(stat.runs         ?? 0),
        ER:  String(stat.earnedRuns   ?? 0),
        BB:  String(stat.baseOnBalls  ?? 0),
        K:   String(stat.strikeOuts   ?? 0),
        ERA: stat.era   ?? '0.00',
        PC:  String(stat.numberOfPitches ?? stat.pitchesThrown ?? 0),
      };
    }
    return {
      AB:  String(stat.atBats      ?? 0),
      H:   String(stat.hits        ?? 0),
      R:   String(stat.runs        ?? 0),
      RBI: String(stat.rbi         ?? 0),
      HR:  String(stat.homeRuns    ?? 0),
      BB:  String(stat.baseOnBalls ?? 0),
      K:   String(stat.strikeOuts  ?? 0),
      AVG: stat.avg ?? '.000',
      OBP: stat.obp ?? '.000',
      SLG: stat.slg ?? '.000',
    };
  } catch { return {}; }
}

/** Extract today's stats for a player from a MLB live feed response. Returns ESPN-compatible map. */
export function extractMiLBStats(liveFeedData, playerId, posAbb) {
  const isPitcher = /^(SP|RP|P|CP)$/i.test(posAbb || '');
  const boxTeams = liveFeedData?.liveData?.boxscore?.teams || {};
  for (const side of ['away', 'home']) {
    const p = boxTeams[side]?.players?.[`ID${playerId}`];
    if (!p) continue;
    if (!isPitcher && p.stats?.batting) {
      const b = p.stats.batting;
      const s = p.seasonStats?.batting || {};
      return {
        AB:  String(b.atBats      ?? 0),
        H:   String(b.hits        ?? 0),
        R:   String(b.runs        ?? 0),
        RBI: String(b.rbi         ?? 0),
        HR:  String(b.homeRuns    ?? 0),
        BB:  String(b.baseOnBalls ?? 0),
        K:   String(b.strikeOuts  ?? 0),
        AVG: s.avg ?? b.avg ?? '.000',
        OBP: s.obp ?? b.obp ?? '.000',
        SLG: s.slg ?? b.slg ?? '.000',
      };
    }
    if (isPitcher && p.stats?.pitching) {
      const pt = p.stats.pitching;
      const s  = p.seasonStats?.pitching || {};
      return {
        IP:  pt.inningsPitched ?? '0.0',
        H:   String(pt.hits        ?? 0),
        R:   String(pt.runs        ?? 0),
        ER:  String(pt.earnedRuns  ?? 0),
        BB:  String(pt.baseOnBalls ?? 0),
        K:   String(pt.strikeOuts  ?? 0),
        ERA: s.era ?? pt.era ?? '0.00',
        PC:  String(pt.numberOfPitches ?? pt.pitchesThrown ?? 0),
      };
    }
  }
  return null;
}

/** Build ESPN-compatible competitor/status shape from MLB live feed for MiLB box score page. */
export function buildMiLBComp(raw) {
  if (!raw?.gameData) return null;
  const gd = raw.gameData;
  const ls = raw.liveData?.linescore || {};
  const abstractState = gd.status?.abstractGameState || '';
  const state = abstractState === 'Live' ? 'in'
    : abstractState === 'Final' ? 'post' : 'pre';

  const awayRuns = ls.teams?.away?.runs;
  const homeRuns = ls.teams?.home?.runs;

  const mkComp = (side) => {
    const t = gd.teams?.[side] || {};
    return {
      homeAway: side,
      score: String(ls.teams?.[side]?.runs ?? ''),
      winner: state === 'post' &&
        (side === 'away' ? (awayRuns ?? 0) > (homeRuns ?? 0) : (homeRuns ?? 0) > (awayRuns ?? 0)),
      team: {
        id: String(t.id || ''),
        displayName: t.name || '',
        shortDisplayName: t.teamName || t.name || '',
        abbreviation: t.abbreviation || '',
        color: null, alternateColor: null,
        logo: `https://www.mlbstatic.com/team-logos/${t.id}.svg`,
      },
      records: [],
    };
  };

  const inningHalf = ls.inningHalf;
  const shortDetail = state === 'in'
    ? `${inningHalf === 'Bottom' ? 'BOT' : 'TOP'} ${ls.currentInning || ''}`
    : state === 'post' ? 'Final'
    : gd.status?.detailedState || '';

  return {
    competitors: [mkComp('away'), mkComp('home')],
    status: { type: { state, shortDetail } },
    date: gd.datetime?.dateTime || '',
    _sportId: gd.game?.type === 'R' ? gd.sport?.id : null,
    _levelShort: levelShort(gd.game?.id ? Math.floor(gd.game.id / 1000) : null),
  };
}

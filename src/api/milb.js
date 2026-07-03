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

/** Format a UTC game date string as a local time string. */
export function formatGameTime(gameDate) {
  if (!gameDate) return '';
  try {
    return new Date(gameDate).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
  } catch { return ''; }
}

/** Convert an MLB Stats API schedule game to an ESPN-compatible shape for sort/render. */
export function normalizeMiLBGame(game) {
  const away = game.teams?.away || {};
  const home = game.teams?.home || {};
  const state = milbState(game);
  const ls = game.linescore || {};
  // game.sport is null in schedule responses; sport ID lives on the team object
  const sportId = game.sport?.id
    ?? away.team?.sport?.id
    ?? home.team?.sport?.id;

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

  const gameTime = formatGameTime(game.gameDate);

  return {
    id: String(game.gamePk),
    _isMiLB: true,
    _gamePk: game.gamePk,
    _sportId: sportId,
    competitions: [{
      _gamePk: game.gamePk,
      _sportId: sportId,
      _linescore: ls,
      _gameTime: gameTime,
      competitors: [mkTeam('away', away), mkTeam('home', home)],
      status: {
        type: {
          state,
          shortDetail: state === 'in'
            ? `${ls.inningHalf === 'Bottom' ? 'BOT' : 'TOP'} ${ls.currentInning || ''}`
            : state === 'post' ? 'Final'
            : gameTime,
        },
      },
    }],
  };
}

/** MLB CDN headshot URL for a player (face-cropped, with generic fallback). */
export function milbHeadshotUrl(mlbId) {
  return mlbId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/c_fill,g_face,w_180,h_180/v1/people/${mlbId}/headshot/67/current`
    : null;
}

/** MLB static team logo URL. */
export function milbTeamLogoUrl(teamId) {
  return teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : null;
}

/**
 * Search for a player by name in MLB Stats API.
 * Returns the first match with currentTeam, or null.
 * If currentTeam.parentOrgId is set, the player is in MiLB.
 */
export async function searchMiLBPlayerByName(name) {
  try {
    const r = await fetch(
      `${STATSAPI}/people/search?names=${encodeURIComponent(name)}&hydrate=currentTeam`
    );
    const d = await r.json();
    return d.people?.[0] || null;
  } catch { return null; }
}

/** Fetch MiLB team details (abbreviation, sport level, etc.) */
export async function fetchMiLBTeam(teamId) {
  try {
    const r = await fetch(`${STATSAPI}/teams/${teamId}`);
    const d = await r.json();
    return d.teams?.[0] || null;
  } catch { return null; }
}

/* ── Team listing ──────────────────────────────────────── */
let _teamsCache = null;
/** Fetch all MiLB teams across all 4 levels (cached for the session). */
export async function fetchAllMiLBTeams() {
  if (_teamsCache) return _teamsCache;
  const results = await Promise.allSettled(
    [11, 12, 13, 14].map(id =>
      fetch(`${STATSAPI}/teams?sportId=${id}&season=${new Date().getFullYear()}&fields=teams,id,name,abbreviation,sport`)
        .then(r => r.json())
        .then(d => d.teams || [])
    )
  );
  _teamsCache = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  return _teamsCache;
}

/* ── Player index (comprehensive name search) ─────────── */
let _playerIndex = null;
let _playerIndexPromise = null;
/**
 * Lazy-load all active MiLB players across all 4 levels.
 * Returns a flat array cached for the session.
 */
export async function getMiLBPlayerIndex() {
  if (_playerIndex) return _playerIndex;
  if (_playerIndexPromise) return _playerIndexPromise;
  _playerIndexPromise = Promise.all(
    [11, 12, 13, 14].map(sportId =>
      fetch(
        `${STATSAPI}/sports/${sportId}/players?season=${new Date().getFullYear()}` +
        `&fields=people,id,fullName,currentTeam,primaryPosition,primaryNumber`
      ).then(r => r.json())
       .then(d => (d.people || []).map(p => ({ ...p, _sportId: sportId })))
       .catch(() => [])
    )
  ).then(arrays => {
    _playerIndex = arrays.flat();
    return _playerIndex;
  });
  return _playerIndexPromise;
}

/**
 * Search all MiLB players by name (uses the cached index).
 * Returns up to 20 matches with team info resolved.
 */
export async function searchMiLBByName(query) {
  const norm = s => (s || '').toLowerCase();
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const index = await getMiLBPlayerIndex();
  return index.filter(p => norm(p.fullName).includes(q)).slice(0, 20);
}

/** Fetch full player bio from MLB Stats API. */
export async function fetchMiLBPlayerBio(playerId) {
  try {
    const r = await fetch(`${STATSAPI}/people/${playerId}?hydrate=currentTeam`);
    const d = await r.json();
    return d.people?.[0] || null;
  } catch { return null; }
}

/**
 * Fetch year-by-year stats for a MiLB player across all four minor league levels.
 * Each level must be queried separately (comma-separated sportId is not supported).
 * Returns all splits sorted newest-first.
 */
export async function fetchMiLBAllStats(playerId, group = 'hitting') {
  const results = await Promise.allSettled(
    [11, 12, 13, 14].map(id =>
      fetch(`${STATSAPI}/people/${playerId}/stats?stats=yearByYear&group=${group}&sportId=${id}`)
        .then(r => r.json())
    )
  );
  const all = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      all.push(...(r.value.stats?.[0]?.splits || []));
    }
  }
  // Sort newest season first, then by level (AAA → A)
  all.sort((a, b) => {
    const sy = parseInt(b.season) - parseInt(a.season);
    if (sy !== 0) return sy;
    return (a.sport?.id || 99) - (b.sport?.id || 99);
  });
  return all;
}

/** Fetch recent game log for a MiLB player at a specific sport level. */
export async function fetchMiLBGameLog(playerId, group = 'hitting', sportId = 11) {
  const year = new Date().getFullYear();
  try {
    const r = await fetch(
      `${STATSAPI}/people/${playerId}/stats?stats=gameLog&season=${year}` +
      `&group=${group}&sportId=${sportId}`
    );
    const d = await r.json();
    return d.stats?.[0]?.splits || [];
  } catch { return []; }
}

/**
 * Fetch current-season stats for a MiLB player.
 * Queries each level separately (API rejects comma-separated sportId).
 * Returns stats from the level with the most games played.
 */
export async function fetchMiLBSeasonStats(playerId, posAbb) {
  const isPitcher = /^(SP|RP|P|CP)$/i.test(posAbb || '');
  const group = isPitcher ? 'pitching' : 'hitting';
  const year = new Date().getFullYear();
  try {
    const results = await Promise.allSettled(
      [11, 12, 13, 14].map(id =>
        fetch(`${STATSAPI}/people/${playerId}/stats?stats=season&season=${year}&group=${group}&sportId=${id}`)
          .then(r => r.json())
      )
    );
    let best = null, bestGames = -1;
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const split = r.value.stats?.[0]?.splits?.[0];
      if (!split) continue;
      const g = split.stat?.gamesPlayed ?? split.stat?.gamesStarted ?? 0;
      if (g > bestGames) { bestGames = g; best = split.stat; }
    }
    if (!best) return {};
    if (isPitcher) {
      return {
        IP:  best.inningsPitched ?? '0.0',
        H:   String(best.hits         ?? 0),
        R:   String(best.runs         ?? 0),
        ER:  String(best.earnedRuns   ?? 0),
        BB:  String(best.baseOnBalls  ?? 0),
        K:   String(best.strikeOuts   ?? 0),
        ERA: best.era ?? '0.00',
        PC:  String(best.numberOfPitches ?? best.pitchesThrown ?? 0),
      };
    }
    return {
      AB:  String(best.atBats      ?? 0),
      H:   String(best.hits        ?? 0),
      R:   String(best.runs        ?? 0),
      RBI: String(best.rbi         ?? 0),
      HR:  String(best.homeRuns    ?? 0),
      BB:  String(best.baseOnBalls ?? 0),
      K:   String(best.strikeOuts  ?? 0),
      AVG: best.avg ?? '.000',
      OBP: best.obp ?? '.000',
      SLG: best.slg ?? '.000',
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
    _sportId: gd.teams?.away?.sport?.id ?? gd.teams?.home?.sport?.id ?? null,
  };
}

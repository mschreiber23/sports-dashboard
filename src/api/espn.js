import axios from 'axios';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

/**
 * Returns the ESPN dark-mode (white) logo URL for a team object.
 * ESPN serves white logo variants at /500-dark/ instead of /500/.
 * Teams with bright logos (Reds red C, Pirates gold P) often have no dark
 * variant, so the onError fallback returns the original colored logo.
 */
export function getTeamLogo(team) {
  const logos = team?.logos || [];
  // Prefer explicit dark entry from logos array
  const darkEntry = logos.find((l) => Array.isArray(l.rel) && l.rel.includes('dark'));
  if (darkEntry?.href) return darkEntry.href;
  const orig = team?.logo || logos[0]?.href;
  if (!orig) return null;
  // Try ESPN's standard dark URL pattern: /500/ → /500-dark/
  return orig.replace(/(\/i\/teamlogos\/[^/]+\/)(\d+)(\/)/, '$1$2-dark$3');
}

/** Original colored logo URL (used as onError fallback). */
export function getTeamLogoFallback(team) {
  return team?.logo || team?.logos?.[0]?.href || null;
}

export const SPORTS = {
  nba: { league: 'basketball/nba', label: 'NBA' },
  nfl: { league: 'football/nfl', label: 'NFL' },
  mlb: { league: 'baseball/mlb', label: 'MLB' },
  nhl: { league: 'hockey/nhl', label: 'NHL' },
};

export async function getScoreboard(sport, dateStr) {
  const { league } = SPORTS[sport];
  const url = dateStr
    ? `${BASE}/${league}/scoreboard?dates=${dateStr}`
    : `${BASE}/${league}/scoreboard`;
  const { data } = await axios.get(url);
  return data.events || [];
}

export async function getTeamRoster(sport, teamId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(`${BASE}/${league}/teams/${teamId}/roster`);
  return data.athletes || [];
}

export async function getStatLeaders(sport) {
  const coreLeague = { nba: 'basketball/leagues/nba', nfl: 'football/leagues/nfl', mlb: 'baseball/leagues/mlb', nhl: 'hockey/leagues/nhl' }[sport];
  const year = new Date().getFullYear();
  // NFL: try current year, fall back to previous (offseason)
  const tryYear = async (y) => {
    const { data } = await axios.get(
      `https://sports.core.api.espn.com/v2/sports/${coreLeague}/seasons/${y}/types/2/leaders`
    );
    if (data.categories?.length) return data;
    throw new Error('no data');
  };
  try { return await tryYear(year); }
  catch { return await tryYear(year - 1); }
}

export async function getAthleteInfo(sport, athleteId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${athleteId}`
  );
  const a = data.athlete || {};
  return {
    id: athleteId,
    displayName: a.displayName || a.fullName || '',
    shortName: a.shortName || a.displayName || '',
    headshot: a.headshot?.href || `https://a.espncdn.com/i/headshots/${league.split('/')[0]}/players/full/${athleteId}.png`,
    team: a.team?.abbreviation || '',
    teamLogo: a.team?.logos?.[0]?.href || '',
    position: a.position?.abbreviation || '',
  };
}

export async function getPlayerSplits(sport, playerId, year) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${playerId}/splits?season=${year}`
  );
  return data;
}

export async function getPlayerGameLog(sport, playerId) {
  const { league } = SPORTS[sport];
  const year = new Date().getFullYear();
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${playerId}/gamelog?season=${year}`
  );
  return data;
}

export async function getPlayerBio(sport, playerId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${playerId}`
  );
  return data;
}

export async function getPlayerSeasonStats(sport, playerId, year) {
  const coreLeague = { nba: 'basketball/leagues/nba', nfl: 'football/leagues/nfl', mlb: 'baseball/leagues/mlb', nhl: 'hockey/leagues/nhl' }[sport];
  const { data } = await axios.get(
    `https://sports.core.api.espn.com/v2/sports/${coreLeague}/seasons/${year}/types/2/athletes/${playerId}/statistics/0`
  );
  return { year, data };
}

export async function getPlayerStats(sport, playerId) {
  const { league } = SPORTS[sport];
  const coreLeague = {
    nba: 'basketball/leagues/nba',
    nfl: 'football/leagues/nfl',
    mlb: 'baseball/leagues/mlb',
    nhl: 'hockey/leagues/nhl',
  }[sport];
  const year = new Date().getFullYear();

  const tryYear = async (y) => {
    const { data } = await axios.get(
      `https://sports.core.api.espn.com/v2/sports/${coreLeague}/seasons/${y}/types/2/athletes/${playerId}/statistics/0`
    );
    const cats = data?.splits?.categories || [];
    const hasData = cats.some((c) => (c.stats || []).some((s) => parseFloat(s.displayValue) > 0));
    if (!hasData) throw new Error('no data');
    return data;
  };

  // For NBA: use statsSummary from bio (official per-game averages) + defensive stats
  if (sport === 'nba') {
    const [bioResp, coreResp] = await Promise.allSettled([
      axios.get(`https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${playerId}`),
      tryYear(year).catch(() => tryYear(year - 1)),
    ]);
    const bio = bioResp.status === 'fulfilled' ? bioResp.value.data : null;
    const core = coreResp.status === 'fulfilled' ? coreResp.value : null;
    const summaryStats = bio?.athlete?.statsSummary?.statistics || [];

    // Build a unified stats object: statsSummary wins for PTS/REB/AST/FG%
    const result = { _isBioStats: true, _summaryStats: summaryStats };
    // Also attach defensive stats from core for STL/BLK
    if (core) {
      const defCat = core.splits?.categories?.find((c) => c.name === 'defensive');
      (defCat?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
    }
    summaryStats.forEach((s) => { result[s.abbreviation] = s.displayValue; });
    return { _merged: result, splits: { categories: [] } };
  }

  try { return await tryYear(year); }
  catch { return await tryYear(year - 1); }
}

export async function searchTeams(sport, query) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/v2/sports/${league}/standings`
  );
  const teams = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const entries = node.standings?.entries || node.entries;
    if (Array.isArray(entries)) {
      entries.forEach((e) => { if (e.team?.id) teams.push(e.team); });
    }
    (node.children || []).forEach(walk);
  };
  walk(data);
  const unique = Array.from(new Map(teams.map((t) => [t.id, t])).values());
  // Sort alphabetically by city/location
  unique.sort((a, b) => {
    const cityA = (a.location || a.displayName || '').toLowerCase();
    const cityB = (b.location || b.displayName || '').toLowerCase();
    return cityA.localeCompare(cityB);
  });
  if (!query) return unique;
  return unique.filter((t) => t.displayName.toLowerCase().includes(query.toLowerCase()));
}

export async function getTeamSchedule(sport, teamId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `${BASE}/${league}/teams/${teamId}/schedule`
  );
  return data.events || [];
}

export async function getGameBoxscore(sport, gameId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `${BASE}/${league}/summary?event=${gameId}`
  );
  return data;
}

export async function getTeamInfo(sport, teamId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(`${BASE}/${league}/teams/${teamId}`);
  return data.team || {};
}

export async function getTeamNews(sport, teamId, limit = 10) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `${BASE}/${league}/news?team=${teamId}&limit=${limit}`
  );
  return data.articles || [];
}

export async function getStandings(sport, level = 3) {
  const { league } = SPORTS[sport];
  const year = new Date().getFullYear();
  const tryYear = async (y) => {
    const params = `level=${level}${sport === 'nfl' ? `&season=${y}` : ''}`;
    const { data } = await axios.get(
      `https://site.web.api.espn.com/apis/v2/sports/${league}/standings?${params}`
    );
    return data;
  };
  try { return await tryYear(year); }
  catch { return await tryYear(year - 1); }
}

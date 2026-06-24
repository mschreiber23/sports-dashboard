import axios from 'axios';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

export const SPORTS = {
  nba: { league: 'basketball/nba', label: 'NBA' },
  nfl: { league: 'football/nfl', label: 'NFL' },
  mlb: { league: 'baseball/mlb', label: 'MLB' },
  nhl: { league: 'hockey/nhl', label: 'NHL' },
};

export async function getScoreboard(sport) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(`${BASE}/${league}/scoreboard`);
  return data.events || [];
}

export async function getTeamRoster(sport, teamId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(`${BASE}/${league}/teams/${teamId}/roster`);
  return data.athletes || [];
}

export async function getPlayerStats(sport, playerId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${playerId}/stats`
  );
  return data;
}

export async function searchTeams(sport, query) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(`${BASE}/${league}/teams?limit=100`);
  const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];
  if (!query) return teams.map((t) => t.team);
  return teams
    .map((t) => t.team)
    .filter((t) => t.displayName.toLowerCase().includes(query.toLowerCase()));
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

export async function getStandings(sport) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/v2/sports/${league}/standings`
  );
  return data;
}

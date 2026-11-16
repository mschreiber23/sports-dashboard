import axios from 'axios';
import { activeSeasonYear, getTeamRoster, getTeamSchedule, searchTeams } from './espn.js';
import { chartSeasons } from '../utils/chartSeasons.js';
import {
  facesNbaOpponent,
  gamesFromNbaLog,
  mergeGames,
  NBA_CATEGORIES,
  nextOpponent,
  playersFromRoster,
  seasonAverages,
  statSeries,
} from '../utils/nbaTeamPlayers.js';

const logCache = new Map();
let teamsPromise = null;

function gamelog(id, year) {
  const key = `${id}:${year}`;
  if (!logCache.has(key)) {
    const pending = axios.get(
      `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/gamelog?season=${year}`,
      { timeout: 20000 },
    ).then((res) => gamesFromNbaLog(res.data)).catch(() => []);
    logCache.set(key, pending);
  }
  return logCache.get(key);
}

async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

export function loadNbaTeams() {
  if (!teamsPromise) {
    teamsPromise = searchTeams('nba', '').catch((err) => {
      teamsPromise = null;
      throw err;
    });
  }
  return teamsPromise;
}

export async function loadNbaTeamBoard(teamId, onProgress, now = new Date()) {
  const year = activeSeasonYear('nba', now);
  const [groups, events] = await Promise.all([
    getTeamRoster('nba', teamId),
    getTeamSchedule('nba', teamId),
  ]);
  const players = playersFromRoster(groups);
  const opponent = nextOpponent(events, teamId, now.getTime());
  let done = 0;
  const logs = await mapPool(players, 6, async (player) => {
    const seasons = await chartSeasons(
      (season) => gamelog(player.id, season),
      year,
      opponent,
      facesNbaOpponent,
    );
    done += 1;
    onProgress?.(done, players.length);
    return seasons;
  });
  const rows = players.map((player, index) => {
    const [current, ...earlier] = logs[index];
    const games = mergeGames([current, ...earlier]);
    const versus = games.filter((game) => facesNbaOpponent(game, opponent));
    const last10 = {};
    const against = {};
    for (const category of NBA_CATEGORIES) {
      last10[category.key] = statSeries(games, category.key, 10);
      against[category.key] = statSeries(versus, category.key, 10);
    }
    return {
      ...player,
      averages: seasonAverages(current),
      last10,
      versus: against,
    };
  });
  return { season: year, opponent, players: rows };
}

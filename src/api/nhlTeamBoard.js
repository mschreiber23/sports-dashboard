import axios from 'axios';
import { activeSeasonYear, getTeamRoster, getTeamSchedule, searchTeams } from './espn.js';
import {
  facesOpponent,
  gamesFromNhlLog,
  mergeGames,
  nextOpponent,
  pointSeries,
  seasonTotals,
  skatersFromRoster,
} from '../utils/nhlTeamSkaters.js';

const logCache = new Map();
let teamsPromise = null;

function gamelog(id, year) {
  const key = `${id}:${year}`;
  if (!logCache.has(key)) {
    const pending = axios.get(
      `https://site.web.api.espn.com/apis/common/v3/sports/hockey/nhl/athletes/${id}/gamelog?season=${year}`,
      { timeout: 20000 },
    ).then((res) => gamesFromNhlLog(res.data)).catch(() => []);
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

export function loadNhlTeams() {
  if (!teamsPromise) {
    teamsPromise = searchTeams('nhl', '').catch((err) => {
      teamsPromise = null;
      throw err;
    });
  }
  return teamsPromise;
}

export async function loadNhlTeamBoard(teamId, onProgress, now = new Date()) {
  const year = activeSeasonYear('nhl', now);
  const [groups, events] = await Promise.all([
    getTeamRoster('nhl', teamId),
    getTeamSchedule('nhl', teamId),
  ]);
  const skaters = skatersFromRoster(groups);
  const opponent = nextOpponent(events, teamId, now.getTime());
  let done = 0;
  const logs = await mapPool(skaters, 6, async (skater) => {
    const seasons = await Promise.all([0, 1, 2].map((back) => gamelog(skater.id, year - back)));
    done += 1;
    onProgress?.(done, skaters.length);
    return seasons;
  });
  const rows = skaters.map((skater, index) => {
    const [current, ...earlier] = logs[index];
    const games = mergeGames([current, ...earlier]);
    const versus = games.filter((game) => facesOpponent(game, opponent));
    return {
      ...skater,
      ...seasonTotals(current),
      last10: pointSeries(games, 10),
      versus: pointSeries(versus, 10),
    };
  });
  return { season: year, opponent, skaters: rows };
}

import { playersFromBoxscore, combinePlayers } from '../utils/dayLeaders';

const WEB = 'https://site.web.api.espn.com/apis/site/v2/sports';
const LEAGUE = {
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
  nfl: 'football/nfl',
  mlb: 'baseball/mlb',
};
const LIMIT = 4;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  }
  const workers = Math.min(limit, items.length);
  if (workers > 0) await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

function gameState(event) {
  return event?.competitions?.[0]?.status?.type?.state || '';
}

/**
 * Today's played lines for one sport.
 * Finished games stay cached. Live and upcoming games are read again.
 * site.web.api.espn.com is the host the browser can call. The shared
 * scoreboard helpers stay on site.api.espn.com.
 */
export async function loadDayLeaders(sport, dateStr, previous) {
  const league = LEAGUE[sport];
  const sameDay = previous?.dateStr === dateStr;
  const data = await getJson(`${WEB}/${league}/scoreboard?dates=${dateStr}`);
  const events = data.events || [];
  const prevGames = sameDay ? (previous.games || {}) : {};
  const games = {};
  const fresh = [];
  for (const event of events) {
    const state = gameState(event);
    const cached = prevGames[event.id];
    if (cached && state === 'post' && cached.state === 'post') {
      games[event.id] = cached;
    } else {
      fresh.push(event);
    }
  }
  const summaries = await mapLimit(fresh, LIMIT, (event) =>
    getJson(`${WEB}/${league}/summary?event=${event.id}`).catch(() => null)
  );
  fresh.forEach((event, i) => {
    const state = gameState(event);
    const summary = summaries[i];
    const cached = prevGames[event.id];
    const players = summary
      ? playersFromBoxscore(sport, summary, event)
      : (cached?.players || []);
    games[event.id] = { state, players };
  });
  const players = combinePlayers(Object.values(games).flatMap((game) => game.players));
  return {
    dateStr,
    games,
    players,
    live: events.some((event) => gameState(event) === 'in'),
    scheduled: events.length,
    at: Date.now(),
  };
}

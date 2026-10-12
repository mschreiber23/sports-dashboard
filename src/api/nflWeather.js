// Outdoor wind and precipitation, from the ESPN game summary. A dome is a
// no-op. Gusts stand in for sustained wind only when the feed has no wind
// speed, and only once they are strong enough to mean a breezy game.

import { espnAbbr } from './teamForm.js';

const HOST = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl';
// AccuWeather icon numbers, which is what ESPN puts in conditionId.
// 12–18 and 39–42 are rain or storms. 19–26, 29, and 43–44 are snow, ice, or a mix.
// A fixed roof stays indoor even when the scoreboard leaves the indoor flag off.
const RAIN = new Set(['12', '13', '14', '15', '16', '17', '18', '39', '40', '41', '42']);
const SNOW = new Set(['19', '20', '21', '22', '23', '24', '25', '26', '29', '43', '44']);
const COVERED = /sofi stadium|allegiant stadium|lucas oil|u\.s\. bank stadium|ford field|superdome/i;

const boardCache = new Map();
const summaryCache = new Map();

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function easternDateKey(ms) {
  const text = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
  return text.replaceAll('-', '');
}

function coveredRoof(venue) {
  return COVERED.test(String(venue?.fullName || ''));
}

export function readWeather(gameInfo, venueIndoor) {
  const indoor = venueIndoor === true || gameInfo?.venue?.indoor === true || coveredRoof(gameInfo?.venue);
  if (indoor) return { indoor: true, wind: null, gust: null, rain: false, snow: false };
  const wx = gameInfo?.weather;
  if (!wx) return null;
  const condition = String(wx.conditionId || '');
  const snow = SNOW.has(condition);
  // precipitation on this feed is a percent, not inches. The icon is the rain signal.
  const rain = !snow && RAIN.has(condition);
  return {
    indoor: false,
    wind: number(wx.windSpeed),
    gust: number(wx.gust),
    rain,
    snow,
  };
}

function gameAbbrs(game) {
  const found = new Set();
  for (const row of game?.rows || []) {
    if (row.teamAbbr) found.add(espnAbbr(row.teamAbbr));
    if (row.opponentAbbr) found.add(espnAbbr(row.opponentAbbr));
    for (const team of row.teams || []) {
      if (team.abbr) found.add(espnAbbr(team.abbr));
    }
  }
  return [...found].filter(Boolean);
}

function eventAbbrs(event) {
  const comps = event?.competitions?.[0]?.competitors || [];
  return comps.map((comp) => espnAbbr(comp.team?.abbreviation)).filter(Boolean);
}

async function scoreboard(dateKey) {
  if (boardCache.has(dateKey)) return boardCache.get(dateKey);
  const pending = fetch(`${HOST}/scoreboard?dates=${dateKey}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.events || [])
    .catch(() => []);
  boardCache.set(dateKey, pending);
  return pending;
}

async function summary(eventId) {
  if (summaryCache.has(eventId)) return summaryCache.get(eventId);
  const pending = fetch(`${HOST}/summary?event=${eventId}`)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  summaryCache.set(eventId, pending);
  return pending;
}

export async function loadNflWeather(games) {
  const out = {};
  const pending = (games || []).filter((game) => game?.league === 'nfl' && game.key && game.gameStart);
  const byDate = new Map();
  for (const game of pending) {
    const dateKey = easternDateKey(game.gameStart);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(game);
  }
  await Promise.all([...byDate.entries()].map(async ([dateKey, slate]) => {
    const events = await scoreboard(dateKey);
    await Promise.all(slate.map(async (game) => {
      const abbrs = gameAbbrs(game);
      if (abbrs.length < 2) return;
      const event = events.find((item) => {
        const theirs = new Set(eventAbbrs(item));
        return abbrs.filter((abbr) => theirs.has(abbr)).length >= 2;
      });
      if (!event) return;
      const competition = event.competitions?.[0];
      if (competition?.venue?.indoor === true || coveredRoof(competition?.venue)) {
        out[game.key] = { indoor: true, wind: null, gust: null, rain: false, snow: false };
        return;
      }
      const data = await summary(event.id);
      const weather = readWeather(data?.gameInfo, competition?.venue?.indoor);
      if (weather) out[game.key] = weather;
    }));
  }));
  return out;
}

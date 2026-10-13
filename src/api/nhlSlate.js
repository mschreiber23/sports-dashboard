// The day's NHL games and the skaters who are healthy enough to play.
// Goalies and players listed out or on injured reserve stay off the list.

const HOST = 'https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl';
const rosterCache = new Map();

function outNote(athlete) {
  return (athlete?.injuries || []).map((row) => row.status).filter(Boolean).join(' ');
}

function isOut(athlete) {
  const note = outNote(athlete);
  if (!note) return false;
  if (/day-to-day|questionable/i.test(note)) return false;
  return /out|injured reserve|\bir\b|suspend|ltir/i.test(note);
}

function americanProb(odds) {
  const text = String(odds ?? '').replace(/[^\d+-]/g, '');
  const price = Number(text);
  if (!Number.isFinite(price) || price === 0) return null;
  if (price < 0) return (-price) / ((-price) + 100);
  return 100 / (price + 100);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function rosterFor(abbr) {
  const key = String(abbr || '').toUpperCase();
  if (!key) return [];
  if (!rosterCache.has(key)) {
    rosterCache.set(key, getJson(`${HOST}/teams/${key.toLowerCase()}/roster`).catch(() => null));
  }
  const data = await rosterCache.get(key);
  const players = [];
  for (const group of data?.athletes || []) {
    if (group.position === 'Goalies') continue;
    for (const athlete of group.items || []) {
      const position = athlete.position?.abbreviation || '';
      if (!athlete?.id || !athlete.displayName || position === 'G' || isOut(athlete)) continue;
      players.push({
        id: String(athlete.id),
        name: athlete.displayName,
        shortName: athlete.shortName || athlete.displayName,
        position,
        headshot: athlete.headshot?.href || '',
      });
    }
  }
  return players;
}

function favoriteOf(odds, home, away) {
  const homeP = americanProb(odds?.homeTeamOdds?.moneyLine ?? odds?.moneyline?.home?.close?.odds);
  const awayP = americanProb(odds?.awayTeamOdds?.moneyLine ?? odds?.moneyline?.away?.close?.odds);
  if (homeP == null && awayP == null) return { name: '', yes: null };
  if ((homeP ?? 0) >= (awayP ?? 0)) return { name: home?.team?.displayName || '', yes: homeP };
  return { name: away?.team?.displayName || '', yes: awayP };
}

async function gameOf(event) {
  const competition = event.competitions?.[0];
  const sides = competition?.competitors || [];
  const home = sides.find((side) => side.homeAway === 'home') || sides[1];
  const away = sides.find((side) => side.homeAway === 'away') || sides[0];
  if (!home?.team || !away?.team) return null;
  const summary = await getJson(`${HOST}/summary?event=${event.id}`).catch(() => null);
  const odds = summary?.pickcenter?.[0] || null;
  const extraOut = new Set();
  for (const group of summary?.injuries || []) {
    for (const row of group.injuries || []) {
      const status = String(row.status || '');
      if (/day-to-day|questionable/i.test(status)) continue;
      if (/out|injured reserve|\bir\b|suspend|ltir/i.test(status) && row.athlete?.displayName) {
        extraOut.add(row.athlete.displayName);
      }
    }
  }
  const favorite = favoriteOf(odds, home, away);
  const total = Number(odds?.overUnder);
  const start = new Date(event.date).getTime();
  const [homeRoster, awayRoster] = await Promise.all([
    rosterFor(home.team.abbreviation),
    rosterFor(away.team.abbreviation),
  ]);
  const players = [];
  for (const [side, roster, opponent] of [[home, homeRoster, away], [away, awayRoster, home]]) {
    for (const player of roster) {
      if (extraOut.has(player.name)) continue;
      players.push({
        ...player,
        teamAbbr: String(side.team.abbreviation || '').toUpperCase(),
        teamName: side.team.displayName || side.team.name || '',
        opponentAbbr: String(opponent.team.abbreviation || '').toUpperCase(),
        opponentName: opponent.team.displayName || opponent.team.name || '',
        home: side.homeAway === 'home',
        gameStart: start,
        gameTotal: Number.isFinite(total) ? total : null,
        favoriteName: favorite.name,
        favoriteYes: favorite.yes,
      });
    }
  }
  return {
    id: event.id,
    start,
    label: `${away.team.abbreviation} @ ${home.team.abbreviation}`,
    players,
  };
}

export async function loadNhlSlate(ymd) {
  const dates = String(ymd || '').replace(/-/g, '');
  if (!/^\d{8}$/.test(dates)) return [];
  const board = await getJson(`${HOST}/scoreboard?dates=${dates}`);
  const events = board?.events || [];
  const games = [];
  let next = 0;
  async function worker() {
    while (next < events.length) {
      const event = events[next++];
      try {
        const game = await gameOf(event);
        if (game) games.push(game);
      } catch { /* one game should not blank the day */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, events.length) }, worker));
  games.sort((a, b) => a.start - b.start);
  return games;
}

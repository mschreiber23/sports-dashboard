// How a defense has been thrown at, by position, from this season's box scores.
// Snap rate and routes are not in these feeds.

const HOST = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl';
const TYPICAL = { TE: 0.21, WR: 0.58, RB: 0.2 };
const ABBR = { JAC: 'JAX', WSH: 'WAS' };
const GROUP = { TE: 'TE', WR: 'WR', RB: 'RB', HB: 'RB', FB: 'RB' };

const teamCache = new Map();
const rosterCache = new Map();
const profileCache = new Map();

export function receivingGroup(position) {
  return GROUP[String(position || '').toUpperCase()] || '';
}

export function typicalTargetShare(group) {
  return TYPICAL[group] || null;
}

function canon(abbr) {
  const key = String(abbr || '').toUpperCase();
  return ABBR[key] || key;
}

async function teamId(abbr) {
  const key = canon(abbr);
  if (!key) return null;
  if (teamCache.has(key)) return teamCache.get(key);
  const pending = (async () => {
    const res = await fetch(`${HOST}/teams/${key.toLowerCase()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.team?.id ? String(data.team.id) : null;
  })().catch(() => null);
  teamCache.set(key, pending);
  return pending;
}

async function rosterPositions(id) {
  if (!id) return new Map();
  if (rosterCache.has(id)) return rosterCache.get(id);
  const pending = (async () => {
    const res = await fetch(`${HOST}/teams/${id}/roster`);
    const map = new Map();
    if (!res.ok) return map;
    const data = await res.json();
    for (const group of data.athletes || []) {
      for (const athlete of group.items || []) {
        const position = athlete.position?.abbreviation || '';
        if (athlete.id) map.set(String(athlete.id), receivingGroup(position));
      }
    }
    return map;
  })().catch(() => new Map());
  rosterCache.set(id, pending);
  return pending;
}

function statNum(stats, keys, name) {
  const index = keys.indexOf(name);
  if (index < 0) return null;
  const value = Number(stats?.[index]);
  return Number.isFinite(value) ? value : null;
}

async function gameReceiving(eventId, offenseId) {
  const res = await fetch(`${HOST}/summary?event=${eventId}`);
  if (!res.ok) return null;
  const data = await res.json();
  const side = (data.boxscore?.players || []).find((team) => String(team.team?.id) === String(offenseId));
  const receiving = side?.statistics?.find((category) => category.name === 'receiving');
  if (!receiving) return null;
  const keys = receiving.keys || [];
  const positions = await rosterPositions(offenseId);
  const groups = { TE: { targets: 0, catches: 0, yards: 0 }, WR: { targets: 0, catches: 0, yards: 0 }, RB: { targets: 0, catches: 0, yards: 0 } };
  let targets = 0;
  for (const athlete of receiving.athletes || []) {
    const caught = statNum(athlete.stats, keys, 'receptions');
    const yards = statNum(athlete.stats, keys, 'receivingYards');
    const aimed = statNum(athlete.stats, keys, 'receivingTargets');
    if (aimed == null) continue;
    targets += aimed;
    const group = positions.get(String(athlete.athlete?.id));
    if (!group || !groups[group]) continue;
    groups[group].targets += aimed;
    groups[group].catches += caught || 0;
    groups[group].yards += yards || 0;
  }
  return { targets, groups };
}

function seasonYear() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value);
  return month >= 3 && month <= 8 ? year - 1 : year;
}

async function buildProfile(abbr) {
  const id = await teamId(abbr);
  if (!id) return null;
  const res = await fetch(`${HOST}/teams/${id}/schedule?season=${seasonYear()}`);
  if (!res.ok) return null;
  const data = await res.json();
  const games = [];
  for (const event of data.events || []) {
    const competition = event.competitions?.[0];
    if (!competition?.status?.type?.completed) continue;
    const seasonType = event.seasonType?.type ?? competition.type?.type;
    if (seasonType != null && Number(seasonType) !== 2) continue;
    const offense = (competition.competitors || []).find((team) => String(team.team?.id) !== String(id));
    if (!offense?.team?.id) continue;
    games.push({ id: event.id, offenseId: offense.team.id });
  }
  const played = (await Promise.all(games.map((game) => gameReceiving(game.id, game.offenseId)))).filter(Boolean);
  if (played.length < 2) return null;
  const totals = {
    TE: { targets: 0, catches: 0, yards: 0 },
    WR: { targets: 0, catches: 0, yards: 0 },
    RB: { targets: 0, catches: 0, yards: 0 },
  };
  let targets = 0;
  for (const game of played) {
    targets += game.targets;
    for (const group of Object.keys(totals)) {
      totals[group].targets += game.groups[group].targets;
      totals[group].catches += game.groups[group].catches;
      totals[group].yards += game.groups[group].yards;
    }
  }
  const groups = {};
  for (const group of Object.keys(totals)) {
    const row = totals[group];
    groups[group] = {
      targets: row.targets,
      catches: row.catches,
      yards: row.yards,
      share: targets > 0 ? row.targets / targets : 0,
      ypt: row.targets > 0 ? row.yards / row.targets : 0,
    };
  }
  return { games: played.length, targets, groups };
}

export function opponentReceiving(abbr) {
  const key = canon(abbr);
  if (!key) return Promise.resolve(null);
  if (!profileCache.has(key)) {
    profileCache.set(key, buildProfile(key).catch(() => null));
  }
  return profileCache.get(key);
}

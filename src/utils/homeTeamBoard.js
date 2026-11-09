// Home "My Teams" splits a favorites list into score tiles and an upcoming
// list. The full cards on the Scores page are a separate layout.

export function teamLabel(team) {
  return team?.shortDisplayName || team?.displayName || team?.name || team?.abbreviation || '';
}

function statNumber(stats, name) {
  const stat = (stats || []).find((item) => item?.name === name);
  if (stat == null || stat.displayValue == null || stat.displayValue === '') return null;
  const value = Number(stat.displayValue);
  return Number.isFinite(value) ? value : null;
}

/** "4-6", "2-5-1", or the wins-losses-OT piece of "9-6-0, 18 PTS". */
export function seasonRecord(stats) {
  const list = stats || [];
  const overall = list.find((stat) => stat?.name === 'overall');
  const match = String(overall?.displayValue || '').match(/\d+-\d+(?:-\d+)?/);
  if (match) return match[0];
  const wins = statNumber(list, 'wins');
  const losses = statNumber(list, 'losses');
  if (wins == null || losses == null) return '';
  const ot = statNumber(list, 'otLosses');
  const ties = statNumber(list, 'ties');
  if (ot != null) return `${wins}-${losses}-${ot}`;
  if (ties) return `${wins}-${losses}-${ties}`;
  return `${wins}-${losses}`;
}

export function recordsByTeam(standings) {
  const map = {};
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const entries = node.standings?.entries || node.entries;
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const id = entry?.team?.id;
        const record = seasonRecord(entry?.stats);
        if (id && record) map[String(id)] = record;
      }
    }
    for (const child of node.children || []) walk(child);
  };
  walk(standings);
  return map;
}

export function teamScoreValue(row) {
  const score = row?.score;
  if (score == null || score === '') return '';
  return typeof score === 'object' ? String(score.displayValue ?? '') : String(score);
}

export function matchupSides(game) {
  const rows = game?.competitions?.[0]?.competitors || [];
  return {
    away: rows.find((row) => row.homeAway === 'away') || rows[0] || null,
    home: rows.find((row) => row.homeAway === 'home') || rows[1] || null,
  };
}

export function finalStatusText(status) {
  const detail = `${status?.type?.shortDetail || ''} ${status?.type?.detail || ''}`;
  const mark = detail.match(/Final\/([A-Za-z0-9]+)/i)?.[1]?.toUpperCase() || '';
  return mark ? `Final ${mark}` : 'Final';
}

export function liveStatusText(status, situation) {
  const clock = status?.type?.shortDetail || status?.type?.detail || 'Live';
  const down = Number(situation?.down);
  const downText = String(situation?.shortDownDistanceText || situation?.downDistanceText || '').trim();
  if (Number.isFinite(down) && down > 0 && downText) return `${clock} · ${downText}`;
  return clock;
}

function gameKey(sport, game) {
  return `${sport}-${game?.id || ''}`;
}

// Favorites added from search can be saved with an empty logo. The schedule
// payload for that team still carries the mark, so the upcoming row can use it.
export function teamForMark(team, games) {
  const saved = team || {};
  let fromGame = null;
  for (const game of games || []) {
    const rows = game?.competitions?.[0]?.competitors || [];
    const mine = rows.find((row) => String(row?.team?.id) === String(saved.id))?.team;
    if (mine) {
      fromGame = mine;
      break;
    }
  }
  if (!fromGame) return saved;
  const logos = saved.logos?.length ? saved.logos : (fromGame.logos || []);
  return {
    ...fromGame,
    ...saved,
    abbreviation: saved.abbreviation || fromGame.abbreviation || '',
    displayName: saved.displayName || fromGame.displayName || fromGame.name || '',
    shortDisplayName: saved.shortDisplayName || fromGame.shortDisplayName || '',
    color: saved.color || fromGame.color || '',
    alternateColor: saved.alternateColor || fromGame.alternateColor || '',
    logo: saved.logo || fromGame.logo || logos[0]?.href || '',
    logos,
  };
}

// entries are favorites order. A game two favorites share is one square.
// Any game on the selected day is a square, including one that has not started.
// Each favorite then gets its own row of the next games after that day.
export function buildHomeBoard(entries) {
  const scores = [];
  const upcoming = [];
  const seenScore = new Set();

  for (const entry of entries || []) {
    if (!entry || entry.loading) continue;
    const { sport, team, game, games } = entry;

    if (game?.id) {
      const key = gameKey(sport, game);
      if (!seenScore.has(key)) {
        seenScore.add(key);
        scores.push({ sport, game, favoriteId: team?.id });
      }
    }

    const list = (games || []).filter((item) => item?.id).slice(0, 5);
    if (list.length) upcoming.push({ sport, team, games: list });
  }

  return { scores, upcoming };
}

export function hideFlagKey(sport, teamId) {
  return `${sport}-${teamId}`;
}

// A hide flag only counts when that team is still a favorite and is left off
// the board. Flags for a removed team are not a hidden team.
export function omittedFavorites(teams, manuallyHidden, autoHidden) {
  return (teams || []).filter((entry) => {
    if (!entry?.team?.id || entry.sport === 'milb') return false;
    const manual = manuallyHidden?.[hideFlagKey(entry.sport, entry.team.id)] === true;
    const auto = autoHidden?.[`${entry.team.id}-${entry.sport}`] === true;
    return manual || auto;
  });
}

export function keptHideFlags(teams, manuallyHidden) {
  const current = new Set(
    (teams || [])
      .filter((entry) => entry?.team?.id && entry.sport !== 'milb')
      .map((entry) => hideFlagKey(entry.sport, entry.team.id)),
  );
  const next = {};
  for (const [key, value] of Object.entries(manuallyHidden || {})) {
    if (value === true && current.has(key)) next[key] = true;
  }
  return next;
}

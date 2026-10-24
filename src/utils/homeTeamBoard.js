// Home "My Teams" splits a favorites list into score tiles and an upcoming
// list. The full cards on the Scores page are a separate layout.

export function teamLabel(team) {
  return team?.shortDisplayName || team?.displayName || team?.name || team?.abbreviation || '';
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

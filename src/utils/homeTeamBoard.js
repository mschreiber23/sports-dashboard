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

function gameState(game) {
  return game?.competitions?.[0]?.status?.type?.state || '';
}

// entries are favorites order. A game two favorites share is one tile.
// Started and finished games are the score row. Anything still ahead is upcoming.
export function buildHomeBoard(entries) {
  const scores = [];
  const upcoming = [];
  const seenScore = new Set();
  const seenUpcoming = new Set();

  for (const entry of entries || []) {
    if (!entry || entry.loading) continue;
    const { sport, team, game, next } = entry;
    const state = gameState(game);

    if (game && (state === 'in' || state === 'post')) {
      const key = gameKey(sport, game);
      if (!seenScore.has(key)) {
        seenScore.add(key);
        scores.push({ sport, game, favoriteId: team?.id });
      }
    }

    const ahead = state === 'pre' ? game : (next || null);
    if (ahead?.id) {
      const key = gameKey(sport, ahead);
      if (!seenUpcoming.has(key)) {
        seenUpcoming.add(key);
        upcoming.push({ sport, game: ahead, favoriteId: team?.id });
      }
    }
  }

  return { scores, upcoming };
}

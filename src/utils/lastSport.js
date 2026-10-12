// The sport the user last had open. Leaders, scores, and the ticker share it.

const KEY = 'shribely_last_sport_v1';
const TICKER_KEY = 'ticker_last_sport_v1';
const SCORES_KEY = 'scores_last_sport_v1';
const KNOWN = new Set(['mlb', 'nba', 'nfl', 'nhl']);

function known(value) {
  const sport = String(value || '').toLowerCase();
  return KNOWN.has(sport) ? sport : null;
}

export function readLastSport() {
  try {
    return known(localStorage.getItem(KEY))
      || known(localStorage.getItem(TICKER_KEY))
      || known(localStorage.getItem(SCORES_KEY))
      || 'mlb';
  } catch {
    return 'mlb';
  }
}

export function rememberSport(sport) {
  const next = known(sport);
  if (!next) return;
  try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('shribely-sport', { detail: next }));
}

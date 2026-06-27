import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const ESPN_SEARCH = 'https://site.api.espn.com/apis/search/v2';
const VIEWED_KEY  = 'shribely_viewed_players';
const MAX_VIEWED  = 20;

// ESPN leagueSlug → our route sport key
const SLUG_TO_SPORT = {
  mlb: 'mlb', nba: 'nba', nfl: 'nfl', nhl: 'nhl',
  baseball: 'mlb', basketball: 'nba', football: 'nfl', hockey: 'nhl',
};
const SPORT_LABELS = { mlb: 'MLB', nba: 'NBA', nfl: 'NFL', nhl: 'NHL' };
const SPORT_COLORS = {
  mlb: '#e74c3c', nba: '#f39c12', nfl: '#27ae60', nhl: '#3498db',
};

// Extract ESPN athlete ID from uid string (e.g. "s:1~l:10~a:4918256")
function extractAthleteId(uid = '') {
  const m = uid.match(/a:(\d+)/);
  return m ? m[1] : null;
}

/* ── Local storage helpers ──────────────────────────────────────────── */
function loadViewed() {
  try { return JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]'); }
  catch { return []; }
}

export function recordPlayerView(player) {
  try {
    let arr = loadViewed();
    arr = arr.filter((p) => !(p.id === player.id && p.sport === player.sport));
    arr.unshift({ ...player, viewedAt: Date.now() });
    arr = arr.slice(0, MAX_VIEWED);
    localStorage.setItem(VIEWED_KEY, JSON.stringify(arr));
  } catch {}
}

/* ── Player result card ─────────────────────────────────────────────── */
/* ── Player result card ─────────────────────────────────────────────── */
function PlayerCard({ player, onClick }) {
  const sport = player.sport;
  const color = SPORT_COLORS[sport] || '#7c3aed';
  const label = SPORT_LABELS[sport] || sport?.toUpperCase();
  return (
    <button className="player-search-card" onClick={onClick}>
      <div className="player-search-avatar">
        {player.headshot ? (
          <img src={player.headshot} alt="" className="player-search-img"
            onError={(e) => { e.target.style.display = 'none'; }} />
        ) : (
          <div className="player-search-placeholder">{player.name?.[0] || '?'}</div>
        )}
      </div>
      <div className="player-search-info">
        <div className="player-search-name">{player.name}</div>
        <div className="player-search-meta">
          <span className="player-search-sport-badge" style={{ background: `${color}22`, color }}>{label}</span>
          {player.team && <span className="player-search-team">{player.team}</span>}
        </div>
      </div>
      <span className="player-search-arrow">›</span>
    </button>
  );
}

/* ── Recently viewed grid ────────────────────────────────────────────── */
function ViewedGrid({ players, onClear, onRemoveOne }) {
  const navigate = useNavigate();
  if (!players.length) return null;
  return (
    <div className="player-viewed-section">
      <div className="player-viewed-header">
        <span className="player-viewed-title">Recently Viewed</span>
        <button className="player-viewed-clear" onClick={onClear}>Clear All</button>
      </div>
      <div className="player-viewed-grid">
        {players.map((p) => {
          const color = SPORT_COLORS[p.sport] || '#7c3aed';
          const label = SPORT_LABELS[p.sport] || p.sport?.toUpperCase();
          const nameParts = (p.name || '').split(' ');
          const lastName  = nameParts.slice(-1)[0] || '';
          const firstName = nameParts.slice(0, -1).join(' ') || '';
          return (
            <div
              key={`${p.sport}-${p.id}`}
              className="player-viewed-card"
              onClick={() => navigate(`/player/${p.sport}/${p.id}`)}
              role="button"
            >
              <button
                className="player-viewed-remove-overlay"
                title="Remove"
                onClick={(e) => { e.stopPropagation(); onRemoveOne(p.id, p.sport); }}
              >✕</button>
              {/* Headshot */}
              <div className="player-viewed-photo-wrap">
                {p.headshot
                  ? <img src={p.headshot} alt="" className="player-viewed-photo" onError={(e) => { e.target.style.display='none'; }} />
                  : <div className="player-viewed-initials">{p.name?.[0] || '?'}</div>}
              </div>
              {/* Name + info */}
              <div className="player-viewed-info">
                <div className="player-viewed-first">{firstName}</div>
                <div className="player-viewed-last">{lastName}</div>
                <div className="player-viewed-sub">
                  {p.position && <span>{p.position}</span>}
                  {p.jersey   && <span>{p.jersey.startsWith('#') ? p.jersey : `#${p.jersey}`}</span>}
                </div>
                {p.team && <div className="player-viewed-team">{p.team}</div>}
                <span className="player-viewed-badge" style={{ background: `${color}22`, color }}>{label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────── */
export default function PlayersPage() {
  const navigate = useNavigate();
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [sportFilter, setSportFilter] = useState('all');
  const [viewed, setViewed]       = useState(loadViewed);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Auto-focus search on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounced ESPN search
  const doSearch = useCallback((q) => {
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    fetch(`${ESPN_SEARCH}?query=${encodeURIComponent(q)}&categories=athletes&limit=20`)
      .then((r) => r.json())
      .then((data) => {
        const playerResult = (data.results || []).find((r) => r.type === 'player');
        const contents = playerResult?.contents || [];
        const players = contents
          .map((p) => {
            const athleteId = extractAthleteId(p.uid);
            const slug = p.defaultLeagueSlug || p.sport || '';
            const sport = SLUG_TO_SPORT[slug.toLowerCase()];
            if (!athleteId || !sport) return null;
            return {
              id: athleteId,
              sport,
              name: p.displayName,
              team: p.subtitle,
              headshot: p.image?.default || null,
              position: null,
            };
          })
          .filter(Boolean);
        setResults(players);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  const handleQueryChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 350);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  const handlePlayerClick = (player) => {
    recordPlayerView(player);
    setViewed(loadViewed());
    navigate(`/player/${player.sport}/${player.id}`);
  };

  const handleClearViewed = () => {
    localStorage.removeItem(VIEWED_KEY);
    setViewed([]);
  };

  const handleRemoveOneViewed = (playerId, sport) => {
    try {
      let arr = loadViewed().filter((p) => !(p.id === playerId && p.sport === sport));
      localStorage.setItem(VIEWED_KEY, JSON.stringify(arr));
      setViewed(arr);
    } catch {}
  };

  const filteredResults = sportFilter === 'all'
    ? results
    : results.filter((r) => r.sport === sportFilter);

  const sports = ['mlb', 'nba', 'nfl', 'nhl'];
  const isSearching = query.trim().length > 0;

  return (
    <div className="players-page">
      {/* Header */}
      <div className="players-header">
        <div className="players-title">Player Search</div>
        <div className="players-subtitle">Search any MLB, NBA, NFL or NHL player</div>
      </div>

      {/* Search bar */}
      <div className="players-search-wrap">
        <div className="players-search-box">
          <span className="players-search-icon">🔍</span>
          <input
            ref={inputRef}
            className="players-search-input"
            placeholder="Search players…  e.g. James Wood, LeBron James, Patrick Mahomes"
            value={query}
            onChange={handleQueryChange}
          />
          {query && (
            <button className="players-search-clear" onClick={handleClear}>✕</button>
          )}
        </div>

        {/* Sport filter pills */}
        <div className="players-sport-filters">
          <button
            className={`players-filter-pill ${sportFilter === 'all' ? 'players-filter-active' : ''}`}
            onClick={() => setSportFilter('all')}
          >
            All Sports
          </button>
          {sports.map((s) => (
            <button
              key={s}
              className={`players-filter-pill ${sportFilter === s ? 'players-filter-active' : ''}`}
              style={sportFilter === s ? { background: `${SPORT_COLORS[s]}33`, borderColor: SPORT_COLORS[s], color: SPORT_COLORS[s] } : {}}
              onClick={() => setSportFilter(s)}
            >
              {SPORT_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Search results */}
      {isSearching && (
        <div className="players-results">
          {loading && (
            <div className="players-loading">
              <div className="auth-spinner" />
              <span>Searching…</span>
            </div>
          )}
          {!loading && filteredResults.length === 0 && (
            <div className="players-no-results">
              No players found for "{query}"
              {sportFilter !== 'all' && ` in ${SPORT_LABELS[sportFilter]}`}
            </div>
          )}
          {!loading && filteredResults.map((player) => (
            <PlayerCard
              key={`${player.sport}-${player.id}`}
              player={player}
              onClick={() => handlePlayerClick(player)}
            />
          ))}
        </div>
      )}

      {/* Recently viewed — show when not actively searching */}
      {!isSearching && (
        <ViewedGrid players={viewed} onClear={handleClearViewed} onRemoveOne={handleRemoveOneViewed} />
      )}

      {/* Empty state */}
      {!isSearching && viewed.length === 0 && (
        <div className="players-empty">
          <div className="players-empty-icon">🏆</div>
          <div className="players-empty-title">Search for any player</div>
          <div className="players-empty-sub">
            MLB · NBA · NFL · NHL — recently viewed players will appear here
          </div>
        </div>
      )}
    </div>
  );
}

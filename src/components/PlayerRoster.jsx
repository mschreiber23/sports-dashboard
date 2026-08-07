import { useState, useRef, useCallback, useEffect } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import PlayerCard from './PlayerCard';
import { SPORTS } from '../api/espn';

const ESPN_SEARCH = 'https://site.api.espn.com/apis/search/v2';

const SLUG_TO_SPORT = {
  mlb: 'mlb', nba: 'nba', nfl: 'nfl', nhl: 'nhl',
  baseball: 'mlb', basketball: 'nba', football: 'nfl', hockey: 'nhl',
};
const SPORT_COLORS = { mlb: '#e74c3c', nba: '#f39c12', nfl: '#27ae60', nhl: '#3498db' };

function extractAthleteId(uid = '') {
  const m = uid.match(/a:(\d+)/);
  return m ? m[1] : null;
}

export default function PlayerRoster({ editMode = false, setEditMode }) {
  const { favorites, addPlayer, removePlayer, reorderPlayer, togglePlayerVisibility } = useFavorites();

  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const inputRef    = useRef(null);
  const debounceRef = useRef(null);

  // Auto-focus search when picker opens
  useEffect(() => {
    if (showPicker) setTimeout(() => inputRef.current?.focus(), 80);
  }, [showPicker]);

  const doSearch = useCallback((q) => {
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    fetch(`${ESPN_SEARCH}?query=${encodeURIComponent(q)}&categories=athletes&limit=20`)
      .then((r) => r.json())
      .then((data) => {
        const playerResult = (data.results || []).find((r) => r.type === 'player');
        const contents = playerResult?.contents || [];
        const players = contents.map((p) => {
          const athleteId = extractAthleteId(p.uid);
          const slug  = p.defaultLeagueSlug || p.sport || '';
          const sport = SLUG_TO_SPORT[slug.toLowerCase()];
          if (!athleteId || !sport) return null;
          return {
            id:          athleteId,
            sport,
            displayName: p.displayName,
            teamName:    p.subtitle || '',
            headshot:    p.image?.default || null,
            _position:   '',
          };
        }).filter(Boolean);
        setResults(players);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  const handleQueryChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 300);
  };

  const close = () => {
    setShowPicker(false);
    setQuery('');
    setResults([]);
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">My Players</h2>
        <div className="header-actions">
          {editMode && (
            <button className="btn-primary" onClick={() => { showPicker ? close() : setShowPicker(true); }}>
              {showPicker ? '✕ Close' : '+ Add Player'}
            </button>
          )}
        </div>
      </div>

      {/* ── Search picker — above the player list ── */}
      {showPicker && (
        <div className="picker-panel">
          <div className="pr-search-wrap">
            <span className="pr-search-icon">🔍</span>
            <input
              ref={inputRef}
              className="pr-search-input"
              placeholder="Search any MLB, NBA, NFL or NHL player…"
              value={query}
              onChange={handleQueryChange}
            />
            {query && (
              <button className="pr-search-clear" onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}>✕</button>
            )}
          </div>

          {loading && <div className="loading-text">Searching…</div>}

          {!loading && query && results.length === 0 && (
            <div className="loading-text">No players found for "{query}"</div>
          )}

          {!loading && !query && (
            <div className="loading-text" style={{ color: 'var(--text2)', fontSize: 13 }}>
              Start typing to search across all four sports
            </div>
          )}

          {results.length > 0 && (
            <div className="picker-list">
              {results.map((p) => {
                const already = favorites.players.some((fp) => fp.id === p.id);
                const color   = SPORT_COLORS[p.sport] || '#0092ff';
                const label   = SPORTS[p.sport]?.label || p.sport?.toUpperCase();
                return (
                  <div key={`${p.sport}-${p.id}`} className="picker-item">
                    <div className="picker-player-info">
                      {p.headshot ? (
                        <img src={p.headshot} alt="" className="picker-avatar"
                          onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : (
                        <div className="picker-avatar-placeholder">{p.displayName?.[0]}</div>
                      )}
                      <div>
                        <div className="picker-name">{p.displayName}</div>
                        <div className="picker-pos" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ background: `${color}22`, color, padding: '1px 6px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{label}</span>
                          {p.teamName && <span>{p.teamName}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      className={already ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                      disabled={already}
                      onClick={() => { addPlayer(p); }}
                    >
                      {already ? 'Added' : 'Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Edit mode: player list ── */}
      {editMode && (
        <div className="edit-panel">
          <div className="edit-panel-label">Tap — to remove · use arrows to reorder</div>
          {favorites.players.map((player, idx) => (
            <div key={player.id} className={`edit-team-row ${player.hidden ? 'edit-row-hidden' : ''}`}>
              <button className="edit-remove-btn" onClick={() => removePlayer(player.id)} title="Remove">−</button>
              <div className="edit-team-info">
                {player.headshot && (
                  <img src={player.headshot} alt="" className="edit-team-logo"
                    style={{ borderRadius: '50%', opacity: player.hidden ? 0.4 : 1 }} />
                )}
                <div>
                  <div className="edit-team-name" style={{ opacity: player.hidden ? 0.5 : 1 }}>{player.displayName}</div>
                  <div className="edit-team-sport">
                    {player._position || (typeof player.position === 'string' ? player.position : player.position?.abbreviation) || ''}
                    {' · '}{SPORTS[player.sport]?.label}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <button
                  className={`edit-visibility-btn ${player.hidden ? 'edit-visibility-hidden' : 'edit-visibility-visible'}`}
                  onClick={() => togglePlayerVisibility(player.id)}
                  title={player.hidden ? 'Show on dashboard' : 'Hide from dashboard'}
                >
                  {player.hidden ? '👁‍🗨' : '👁'}
                </button>
                <div className="edit-reorder-btns">
                  <button className="edit-reorder-btn" onClick={() => reorderPlayer(idx, idx - 1)} disabled={idx === 0}>▲</button>
                  <button className="edit-reorder-btn" onClick={() => reorderPlayer(idx, idx + 1)} disabled={idx === favorites.players.length - 1}>▼</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {favorites.players.length === 0 && !showPicker && !editMode && (
        <div className="onboarding-prompt">
          <div className="onboarding-icon">⭐</div>
          <div className="onboarding-title">Add a favorite player</div>
          <div className="onboarding-sub">Track season stats and game logs for any player across all four major leagues.</div>
          <button className="btn-primary" onClick={() => { setEditMode?.(true); setShowPicker(true); }}>+ Add Your First Player</button>
        </div>
      )}

      {!editMode && (
        <div className="players-grid">
          {favorites.players.filter((p) => !p.hidden).map((player) => (
            <PlayerCard key={player.id} player={player} sport={player.sport} />
          ))}
        </div>
      )}
    </section>
  );
}

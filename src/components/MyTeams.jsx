import { useState, useEffect, useRef, useCallback } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import TeamRow from './TeamRow';
import { SPORTS } from '../api/espn';

const SLUG_TO_SPORT = { mlb:'mlb', nba:'nba', nfl:'nfl', nhl:'nhl', baseball:'mlb', basketball:'nba', football:'nfl', hockey:'nhl' };
const SPORT_COLORS  = { mlb:'#e74c3c', nba:'#f39c12', nfl:'#27ae60', nhl:'#3498db' };

function extractTeamId(uid = '') {
  const m = uid.match(/t:(\d+)/);
  return m ? m[1] : null;
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
function formatDisplay(date) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function MyTeams({ editMode = false, setEditMode }) {
  const { favorites, addTeam, removeTeam, reorderTeam } = useFavorites();
  const [showPicker, setShowPicker] = useState(false);

  // Date navigation
  const todayMidnight = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
  const [selectedDate, setSelectedDate] = useState(todayMidnight);
  const isToday = toDateStr(selectedDate) === toDateStr(todayMidnight());
  const dateStr = isToday ? null : toDateStr(selectedDate);

  const shiftDate = (days) => setSelectedDate((d) => {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    return next;
  });

  const [hiddenTeams, setHiddenTeams] = useState({});
  const [showHidden, setShowHidden] = useState(false);

  // Team search state
  const [teamQuery, setTeamQuery]         = useState('');
  const [teamResults, setTeamResults]     = useState([]);
  const [teamSearching, setTeamSearching] = useState(false);
  const debounceRef = useRef(null);
  const searchInputRef = useRef(null);

  const handleHiddenChange = useCallback((teamId, sport, isHidden) => {
    setHiddenTeams((prev) => ({ ...prev, [`${teamId}-${sport}`]: isHidden }));
  }, []);

  const hiddenCount = Object.values(hiddenTeams).filter(Boolean).length;

  // Auto-focus when picker opens
  useEffect(() => {
    if (showPicker) setTimeout(() => searchInputRef.current?.focus(), 80);
    else { setTeamQuery(''); setTeamResults([]); }
  }, [showPicker]);

  const doTeamSearch = useCallback((q) => {
    if (!q.trim()) { setTeamResults([]); setTeamSearching(false); return; }
    setTeamSearching(true);
    fetch(`https://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=15`)
      .then(r => r.json())
      .then(data => {
        const teamResult = (data.results || []).find(r => r.type === 'team');
        const items = (teamResult?.contents || []).map(t => {
          const id = extractTeamId(t.uid || '');
          const sport = SLUG_TO_SPORT[(t.defaultLeagueSlug || t.sport || '').toLowerCase()];
          if (!id || !sport) return null;
          return { id, sport, displayName: t.displayName };
        }).filter(Boolean);
        setTeamResults(items);
      })
      .catch(() => setTeamResults([]))
      .finally(() => setTeamSearching(false));
  }, []);

  const handleQueryChange = (e) => {
    const q = e.target.value;
    setTeamQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doTeamSearch(q), 300);
  };

  const handleAddTeam = async (t) => {
    const sport = t.sport;
    const { league } = SPORTS[sport] || {};
    if (!league) return;
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${t.id}`);
      const d = await r.json();
      const tm = d.team;
      addTeam(sport, {
        id: tm.id,
        displayName: tm.displayName,
        abbreviation: tm.abbreviation,
        color: tm.color,
        alternateColor: tm.alternateColor,
        logo: tm.logos?.[0]?.href || '',
      });
    } catch {
      addTeam(sport, { id: t.id, displayName: t.displayName, abbreviation: '', color: '', alternateColor: '', logo: '' });
    }
  };

  return (
    <section className="section">
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 className="section-title">My Teams</h2>
          {hiddenCount > 0 && (
            <button className="show-all-btn" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? 'Hide Inactive' : 'Show All'}
            </button>
          )}
          {/* Date nav — inline, compact */}
          {!editMode && !showPicker && (
            <div className="mt-date-inline">
              <button className="mt-date-btn" onClick={() => shiftDate(-1)}>‹</button>
              <label className="mt-date-display">
                {formatDisplay(selectedDate)}
                <input
                  type="date"
                  className="mt-date-input"
                  value={selectedDate.toISOString().slice(0, 10)}
                  onChange={(e) => setSelectedDate(new Date(e.target.value + 'T12:00:00'))}
                />
              </label>
              <button className="mt-date-btn" onClick={() => shiftDate(1)}>›</button>
              {!isToday && (
                <button className="mt-date-today" onClick={() => setSelectedDate(todayMidnight())}>
                  ↩
                </button>
              )}
            </div>
          )}
        </div>
        <div className="header-actions">
          {editMode ? (
            <>
              <button className="btn-primary" onClick={() => setShowPicker((v) => !v)}>
                {showPicker ? '✕ Close' : '+ Add Team'}
              </button>
              <button className="mt-customize-btn mt-customize-btn-done" onClick={() => { setEditMode?.(false); setShowPicker(false); }}>
                ✓ Done
              </button>
            </>
          ) : (
            <button className="mt-customize-btn" onClick={() => setEditMode?.(true)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Customize
            </button>
          )}
        </div>
      </div>

      {/* Edit mode panel */}
      {editMode && (
        <div className="edit-panel">
          <div className="edit-panel-label">Tap — to remove a team</div>
          {favorites.teams.map(({ sport, team }, idx) => (
            <div key={`${sport}-${team.id}`} className="edit-team-row">
              <button
                className="edit-remove-btn"
                onClick={() => removeTeam(team.id, sport)}
                title="Remove"
              >
                −
              </button>
              <div className="edit-team-info">
                {team.logo && <img src={team.logo} alt="" className="edit-team-logo" />}
                <div>
                  <div className="edit-team-name">{team.displayName}</div>
                  <div className="edit-team-sport">{SPORTS[sport]?.label}</div>
                </div>
              </div>
              <div className="edit-reorder-btns">
                <button
                  className="edit-reorder-btn"
                  onClick={() => reorderTeam(idx, idx - 1)}
                  disabled={idx === 0}
                  title="Move up"
                >▲</button>
                <button
                  className="edit-reorder-btn"
                  onClick={() => reorderTeam(idx, idx + 1)}
                  disabled={idx === favorites.teams.length - 1}
                  title="Move down"
                >▼</button>
              </div>
            </div>
          ))}
          {favorites.teams.length === 0 && (
            <div className="loading-text" style={{ padding: '12px 0' }}>No teams added yet.</div>
          )}
        </div>
      )}

      {/* Add team search — appears above the team list */}
      {showPicker && (
        <div className="pr-search-wrap" style={{ marginBottom: 8 }}>
          <input
            ref={searchInputRef}
            className="search-input"
            placeholder="Search any team across MLB, NBA, NFL, NHL…"
            value={teamQuery}
            onChange={handleQueryChange}
          />
          {teamSearching && <div className="loading-text" style={{ padding: '8px 0' }}>Searching…</div>}
          {teamResults.length > 0 && (
            <div className="picker-list">
              {teamResults.map((t) => {
                const already = favorites.teams.some(ft => ft.team.id === t.id && ft.sport === t.sport);
                const sportLabel = SPORTS[t.sport]?.label || t.sport.toUpperCase();
                const color = SPORT_COLORS[t.sport] || '#888';
                return (
                  <div key={`${t.sport}-${t.id}`} className="picker-item">
                    <div className="picker-player-info">
                      <div>
                        <div className="picker-name">{t.displayName}</div>
                        <span className="picker-sport-badge" style={{ background: color }}>{sportLabel}</span>
                      </div>
                    </div>
                    <button
                      className={already ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                      disabled={already}
                      onClick={() => handleAddTeam(t)}
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

      {/* Date navigation moved inline into section-header */}

      {favorites.teams.length === 0 && !showPicker && !editMode && (
        <div className="onboarding-prompt">
          <div className="onboarding-icon">🏆</div>
          <div className="onboarding-title">Add your favorite teams</div>
          <div className="onboarding-sub">Pick up to 4 teams across MLB, NBA, NFL, and NHL to follow their scores and standings.</div>
          <button className="btn-primary" onClick={() => setShowPicker(true)}>+ Add Your First Team</button>
        </div>
      )}

      {!editMode && (
        <>
          <div className="teams-grid">
            {favorites.teams.map(({ sport, team }) => {
              const isHidden = hiddenTeams[`${team.id}-${sport}`] === true;
              if (isHidden && !showHidden) return null;
              return (
                <TeamRow
                  key={`${sport}-${team.id}`}
                  sport={sport}
                  team={team}
                  dateStr={dateStr}
                  onHiddenChange={handleHiddenChange}
                />
              );
            })}
          </div>

        </>
      )}
    </section>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import TeamRow from './TeamRow';
import { searchTeams, SPORTS } from '../api/espn';

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
  const dateStr = isToday ? null : toDateStr(selectedDate); // null = use live scoreboard

  const shiftDate = (days) => setSelectedDate((d) => {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    return next;
  });
  const [pickerSport, setPickerSport] = useState('nba');
  const [query, setQuery] = useState('');
  const [allTeams, setAllTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [hiddenTeams, setHiddenTeams] = useState({});
  const [showHidden, setShowHidden] = useState(false);

  const handleHiddenChange = useCallback((teamId, sport, isHidden) => {
    setHiddenTeams((prev) => ({ ...prev, [`${teamId}-${sport}`]: isHidden }));
  }, []);

  const hiddenCount = Object.values(hiddenTeams).filter(Boolean).length;

  // Fetch all teams for the selected sport once — filter locally by query
  useEffect(() => {
    if (!showPicker) return;
    setLoadingTeams(true);
    setAllTeams([]);
    setQuery('');
    searchTeams(pickerSport, '')
      .then(setAllTeams)
      .catch(() => setAllTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [showPicker, pickerSport]);

  const teams = query
    ? allTeams.filter((t) => t.displayName.toLowerCase().includes(query.toLowerCase()))
    : allTeams;

  return (
    <section className="section">
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 className="section-title">My Teams</h2>
          {hiddenCount > 0 && (
            <button
              className="show-all-btn"
              onClick={() => setShowHidden((v) => !v)}
            >
              {showHidden ? 'Hide Inactive' : `Show All`}
            </button>
          )}
        </div>
        <div className="header-actions">
          {editMode && (
            <button className="btn-primary" onClick={() => { setShowPicker((v) => !v); }}>
              {showPicker ? 'Done' : '+ Add Team'}
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

      {/* Add team picker */}
      {showPicker && (
        <div className="picker-panel">
          <div className="sport-tabs-row">
            {Object.entries(SPORTS).map(([key, { label }]) => (
              <button
                key={key}
                className={`sport-tab ${pickerSport === key ? 'sport-tab-active' : ''}`}
                onClick={() => { setPickerSport(key); setQuery(''); }}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            className="search-input"
            placeholder={`Search ${SPORTS[pickerSport]?.label} teams…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginTop: 12 }}
          />
          {loadingTeams && <div className="loading-text">Loading…</div>}
          <div className="picker-list">
            {teams.map((team) => {
              const already = favorites.teams.some(
                (t) => t.team.id === team.id && t.sport === pickerSport
              );
              return (
                <div key={team.id} className="picker-item">
                  <div className="picker-player-info">
                    {team.logos?.[0]?.href && (
                      <img src={team.logos[0].href} alt={team.abbreviation} className="picker-avatar" />
                    )}
                    <div>
                      <div className="picker-name">{team.displayName}</div>
                      <div className="picker-pos">{SPORTS[pickerSport]?.label}</div>
                    </div>
                  </div>
                  <button
                    className={already ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                    disabled={already}
                    onClick={() => addTeam(pickerSport, {
                      id: team.id,
                      displayName: team.displayName,
                      abbreviation: team.abbreviation,
                      color: team.color,
                      alternateColor: team.alternateColor,
                      logo: team.logos?.[0]?.href || '',
                    })}
                  >
                    {already ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Date navigation */}
      {!editMode && !showPicker && (
        <div className="mt-date-nav">
          <button className="mt-date-btn" onClick={() => shiftDate(-1)}>←</button>
          <label className="mt-date-display">
            {formatDisplay(selectedDate)}
            <input
              type="date"
              className="mt-date-input"
              value={selectedDate.toISOString().slice(0, 10)}
              onChange={(e) => {
                const d = new Date(e.target.value + 'T12:00:00');
                setSelectedDate(d);
              }}
            />
          </label>
          <button
            className="mt-date-btn"
            onClick={() => shiftDate(1)}
          >→</button>
          {!isToday && (
            <button className="mt-date-today" onClick={() => setSelectedDate(todayMidnight())}>
              Today
            </button>
          )}
        </div>
      )}

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
          <div className="teams-list">
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

import { useState, useEffect, useCallback } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import TeamRow from './TeamRow';
import { searchTeams, SPORTS } from '../api/espn';

export default function MyTeams() {
  const { favorites, addTeam, removeTeam } = useFavorites();
  const [showPicker, setShowPicker] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pickerSport, setPickerSport] = useState('nba');
  const [query, setQuery] = useState('');
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [hiddenTeams, setHiddenTeams] = useState({});
  const [showHidden, setShowHidden] = useState(false);

  const handleHiddenChange = useCallback((teamId, sport, isHidden) => {
    setHiddenTeams((prev) => ({ ...prev, [`${teamId}-${sport}`]: isHidden }));
  }, []);

  const hiddenCount = Object.values(hiddenTeams).filter(Boolean).length;

  useEffect(() => {
    if (!showPicker) return;
    setLoadingTeams(true);
    searchTeams(pickerSport, query)
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [showPicker, pickerSport, query]);

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">My Teams</h2>
          <p className="section-sub">Today's games · updates every 30s</p>
        </div>
        <div className="header-actions">
          {favorites.teams.length > 0 && (
            <button
              className={editMode ? 'btn-primary' : 'btn-ghost'}
              onClick={() => { setEditMode((v) => !v); setShowPicker(false); }}
            >
              {editMode ? 'Done' : 'Edit'}
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => { setShowPicker((v) => !v); setEditMode(false); }}
          >
            {showPicker ? 'Done' : '+ Add Team'}
          </button>
        </div>
      </div>

      {/* Edit mode panel */}
      {editMode && (
        <div className="edit-panel">
          <div className="edit-panel-label">Tap — to remove a team</div>
          {favorites.teams.map(({ sport, team }) => (
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

      {favorites.teams.length === 0 && !showPicker && !editMode && (
        <div className="empty-state">
          <div className="empty-icon">🏆</div>
          <p>No teams added. Click "+ Add Team" to get started.</p>
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
                  onHiddenChange={handleHiddenChange}
                />
              );
            })}
          </div>

          {hiddenCount > 0 && (
            <button className="hidden-teams-toggle" onClick={() => setShowHidden((v) => !v)}>
              {showHidden
                ? `▲ Hide ${hiddenCount} team${hiddenCount > 1 ? 's' : ''} with no games this week`
                : `▼ Show ${hiddenCount} team${hiddenCount > 1 ? 's' : ''} with no games this week`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

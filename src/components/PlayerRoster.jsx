import { useState, useEffect } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import PlayerCard from './PlayerCard';
import { getTeamRoster, searchTeams, SPORTS } from '../api/espn';

export default function PlayerRoster({ editMode = false, setEditMode }) {
  const { favorites, addPlayer, removePlayer, reorderPlayer, togglePlayerVisibility } = useFavorites();

  const [showPicker, setShowPicker]   = useState(false);
  const [pickerSport, setPickerSport] = useState('mlb');
  const [teamQuery, setTeamQuery]     = useState('');
  const [allTeams, setAllTeams]       = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null); // { sport, id, displayName }
  const [roster, setRoster]           = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [playerSearch, setPlayerSearch]   = useState('');

  // Load teams when sport tab changes
  useEffect(() => {
    if (!showPicker) return;
    setLoadingTeams(true);
    setAllTeams([]);
    setSelectedTeam(null);
    setRoster([]);
    setTeamQuery('');
    setPlayerSearch('');
    searchTeams(pickerSport, '')
      .then(setAllTeams)
      .catch(() => setAllTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [pickerSport, showPicker]);

  // Load roster when a team is selected
  useEffect(() => {
    if (!selectedTeam) return;
    setRosterLoading(true);
    setRoster([]);
    setPlayerSearch('');
    getTeamRoster(selectedTeam.sport, selectedTeam.id)
      .then(setRoster)
      .catch(() => setRoster([]))
      .finally(() => setRosterLoading(false));
  }, [selectedTeam]);

  const filteredTeams = teamQuery
    ? allTeams.filter((t) => t.displayName.toLowerCase().includes(teamQuery.toLowerCase()))
    : allTeams;

  // Roster can be flat array of players (NBA/NHL) or grouped with items (MLB/NFL)
  const flattenRoster = (roster) => {
    if (!roster.length) return [];
    const first = roster[0];
    if (first.items) {
      // Grouped format (MLB)
      return roster.flatMap((group) => group.items || []);
    }
    if (first.id) {
      // Flat format (NBA, NHL)
      return roster;
    }
    return [];
  };

  const allPlayers = flattenRoster(roster).map((p) => ({
    id: String(p.id),
    displayName: p.fullName || p.displayName,
    position: p.position?.abbreviation || p.position?.name || '',
    headshot: p.headshot?.href || '',
    sport: selectedTeam?.sport,
    teamId: selectedTeam?.id,
    teamName: selectedTeam?.displayName,
  }));

  const filteredPlayers = allPlayers
    .filter((p) => p.displayName.toLowerCase().includes(playerSearch.toLowerCase()))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const close = () => {
    setShowPicker(false);
    setSelectedTeam(null);
    setRoster([]);
    setTeamQuery('');
    setPlayerSearch('');
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">My Players</h2>
        <div className="header-actions">
          {editMode && (
            <button className="btn-primary" onClick={() => { showPicker ? close() : setShowPicker(true); }}>
              {showPicker ? 'Done' : '+ Add Player'}
            </button>
          )}
        </div>
      </div>

      {/* Edit mode */}
      {editMode && (
        <div className="edit-panel">
          <div className="edit-panel-label">Tap — to remove · use arrows to reorder</div>
          {favorites.players.map((player, idx) => (
            <div key={player.id} className={`edit-team-row ${player.hidden ? 'edit-row-hidden' : ''}`}>
              <button className="edit-remove-btn" onClick={() => removePlayer(player.id)} title="Remove">−</button>
              <div className="edit-team-info">
                {player.headshot && <img src={player.headshot} alt="" className="edit-team-logo" style={{ borderRadius: '50%', opacity: player.hidden ? 0.4 : 1 }} />}
                <div>
                  <div className="edit-team-name" style={{ opacity: player.hidden ? 0.5 : 1 }}>{player.displayName}</div>
                  <div className="edit-team-sport">{player._position || (typeof player.position === 'string' ? player.position : player.position?.abbreviation) || ''} · {SPORTS[player.sport]?.label}</div>
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

      {showPicker && (
        <div className="picker-panel">
          {/* Sport tabs */}
          <div className="sport-tabs-row">
            {Object.entries(SPORTS).map(([key, { label }]) => (
              <button
                key={key}
                className={`sport-tab ${pickerSport === key ? 'sport-tab-active' : ''}`}
                onClick={() => setPickerSport(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Team search */}
          {!selectedTeam && (
            <>
              <input
                className="search-input"
                placeholder={`Search ${SPORTS[pickerSport]?.label} teams…`}
                value={teamQuery}
                onChange={(e) => setTeamQuery(e.target.value)}
                style={{ marginTop: 12 }}
              />
              {loadingTeams && <div className="loading-text">Loading teams…</div>}
              <div className="picker-list">
                {filteredTeams.map((team) => (
                  <div
                    key={team.id}
                    className="picker-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedTeam({ sport: pickerSport, id: team.id, displayName: team.displayName, logo: team.logos?.[0]?.href })}
                  >
                    <div className="picker-player-info">
                      {team.logos?.[0]?.href && (
                        <img src={team.logos[0].href} alt="" className="picker-avatar" />
                      )}
                      <div>
                        <div className="picker-name">{team.displayName}</div>
                        <div className="picker-pos">{SPORTS[pickerSport]?.label}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 16, color: 'var(--text2)' }}>›</span>
                  </div>
                ))}
                {!loadingTeams && filteredTeams.length === 0 && (
                  <div className="loading-text">No teams found.</div>
                )}
              </div>
            </>
          )}

          {/* Roster */}
          {selectedTeam && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => { setSelectedTeam(null); setRoster([]); }}
                >
                  ← Teams
                </button>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{selectedTeam.displayName}</span>
              </div>
              <input
                className="search-input"
                placeholder="Search players…"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                style={{ marginTop: 10 }}
              />
              {rosterLoading && <div className="loading-text">Loading roster…</div>}
              <div className="picker-list">
                {filteredPlayers.map((p) => {
                  const already = favorites.players.some((fp) => fp.id === p.id);
                  return (
                    <div key={p.id} className="picker-item">
                      <div className="picker-player-info">
                        {p.headshot ? (
                          <img src={p.headshot} alt={p.displayName} className="picker-avatar" />
                        ) : (
                          <div className="picker-avatar-placeholder">{p.displayName?.[0]}</div>
                        )}
                        <div>
                          <div className="picker-name">{p.displayName}</div>
                          <div className="picker-pos">{typeof p.position === 'string' ? p.position : p.position?.abbreviation || ''}</div>
                        </div>
                      </div>
                      <button
                        className={already ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                        disabled={already}
                        onClick={() => addPlayer(p)}
                      >
                        {already ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })}
                {!rosterLoading && filteredPlayers.length === 0 && selectedTeam && (
                  <div className="loading-text">No players found.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {favorites.players.length === 0 && !showPicker && !editMode && (
        <div className="onboarding-prompt">
          <div className="onboarding-icon">⭐</div>
          <div className="onboarding-title">Add a favorite player</div>
          <div className="onboarding-sub">Track season stats and game logs for any player across all four major leagues.</div>
          <button className="btn-primary" onClick={() => setShowPicker(true)}>+ Add Your First Player</button>
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

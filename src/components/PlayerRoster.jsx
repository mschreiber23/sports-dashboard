import { useState, useEffect } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import PlayerCard from './PlayerCard';
import { getTeamRoster, SPORTS } from '../api/espn';

export default function PlayerRoster() {
  const { favorites, addPlayer } = useFavorites();

  const [showPicker, setShowPicker] = useState(false);
  const [pickerTeamKey, setPickerTeamKey] = useState(null);
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [search, setSearch] = useState('');

  const selectedEntry = pickerTeamKey
    ? favorites.teams.find((t) => `${t.sport}-${t.team.id}` === pickerTeamKey)
    : null;

  useEffect(() => {
    if (!selectedEntry) return;
    setRosterLoading(true);
    getTeamRoster(selectedEntry.sport, selectedEntry.team.id)
      .then(setRoster)
      .catch(() => setRoster([]))
      .finally(() => setRosterLoading(false));
  }, [pickerTeamKey]);

  const allPlayers = roster.flatMap((group) =>
    (group.items || []).map((p) => ({
      id: String(p.id),
      displayName: p.fullName || p.displayName,
      position: p.position?.abbreviation || p.position?.name || '',
      headshot: p.headshot?.href || '',
      sport: selectedEntry?.sport,
      teamId: selectedEntry?.team.id,
      teamName: selectedEntry?.team.displayName,
    }))
  );

  const filtered = allPlayers.filter((p) =>
    p.displayName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">My Players</h2>
          <p className="section-sub">Season stats</p>
        </div>
        {favorites.teams.length > 0 && (
          <button className="btn-primary" onClick={() => setShowPicker((v) => !v)}>
            {showPicker ? 'Done' : '+ Add Player'}
          </button>
        )}
      </div>

      {showPicker && (
        <div className="picker-panel">
          <div className="sport-tabs-row">
            {favorites.teams.map(({ sport, team }) => (
              <button
                key={`${sport}-${team.id}`}
                className={`sport-tab ${pickerTeamKey === `${sport}-${team.id}` ? 'sport-tab-active' : ''}`}
                onClick={() => {
                  setPickerTeamKey(`${sport}-${team.id}`);
                  setSearch('');
                  setRoster([]);
                }}
              >
                {team.abbreviation} <span style={{ opacity: 0.6, fontSize: 11 }}>{SPORTS[sport]?.label}</span>
              </button>
            ))}
          </div>

          {pickerTeamKey && (
            <>
              <input
                className="search-input"
                placeholder={`Search ${selectedEntry?.team.displayName} roster…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ marginTop: 12 }}
              />
              {rosterLoading && <div className="loading-text">Loading roster…</div>}
              <div className="picker-list">
                {filtered.map((p) => {
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
                          <div className="picker-pos">{p.position}</div>
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
                {!rosterLoading && filtered.length === 0 && pickerTeamKey && (
                  <div className="loading-text">No players found.</div>
                )}
              </div>
            </>
          )}

          {!pickerTeamKey && (
            <p className="loading-text" style={{ marginTop: 12 }}>Select a team above to browse their roster.</p>
          )}
        </div>
      )}

      {favorites.players.length === 0 && !showPicker && (
        <div className="empty-state">
          <div className="empty-icon">⭐</div>
          <p>No players added yet. Click "+ Add Player" to get started.</p>
        </div>
      )}

      <div className="players-grid">
        {favorites.players.map((player) => (
          <PlayerCard key={player.id} player={player} sport={player.sport} />
        ))}
      </div>
    </section>
  );
}

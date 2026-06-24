import usePlayerStats from '../hooks/usePlayerStats';
import { useFavorites } from '../context/FavoritesContext';

function StatPill({ label, value }) {
  return (
    <div className="stat-pill">
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function extractSeasonStats(statsData, sport) {
  if (!statsData) return [];

  // ESPN stats API returns categories with stats arrays
  const categories = statsData.splits?.categories || [];

  if (sport === 'nba') {
    const general = categories.find((c) => c.name === 'general' || c.displayName?.toLowerCase().includes('general'));
    const stats = general?.stats || categories[0]?.stats || [];
    const get = (name) => stats.find((s) => s.name === name || s.abbreviation === name)?.displayValue;
    return [
      { label: 'PPG', value: get('avgPoints') || get('PTS') },
      { label: 'RPG', value: get('avgRebounds') || get('REB') },
      { label: 'APG', value: get('avgAssists') || get('AST') },
      { label: 'SPG', value: get('avgSteals') || get('STL') },
      { label: 'BPG', value: get('avgBlocks') || get('BLK') },
      { label: 'FG%', value: get('shootingPct') || get('FG%') },
    ];
  }

  if (sport === 'nfl') {
    const passing = categories.find((c) => c.name === 'passing');
    const rushing = categories.find((c) => c.name === 'rushing');
    const receiving = categories.find((c) => c.name === 'receiving');
    const src = passing || rushing || receiving || categories[0];
    const stats = src?.stats || [];
    const get = (name) => stats.find((s) => s.name === name || s.abbreviation === name)?.displayValue;
    if (passing) return [
      { label: 'YDS', value: get('passingYards') || get('YDS') },
      { label: 'TD', value: get('passingTouchdowns') || get('TD') },
      { label: 'INT', value: get('interceptions') || get('INT') },
      { label: 'RTG', value: get('QBRating') || get('RTG') },
    ];
    if (rushing) return [
      { label: 'YDS', value: get('rushingYards') || get('YDS') },
      { label: 'TD', value: get('rushingTouchdowns') || get('TD') },
      { label: 'ATT', value: get('rushingAttempts') || get('ATT') },
      { label: 'AVG', value: get('avgRushingYards') || get('AVG') },
    ];
    return [
      { label: 'REC', value: get('receptions') || get('REC') },
      { label: 'YDS', value: get('receivingYards') || get('YDS') },
      { label: 'TD', value: get('receivingTouchdowns') || get('TD') },
    ];
  }

  if (sport === 'mlb') {
    const hitting = categories.find((c) => c.name === 'hitting');
    const pitching = categories.find((c) => c.name === 'pitching');
    const src = hitting || pitching || categories[0];
    const stats = src?.stats || [];
    const get = (name) => stats.find((s) => s.name === name || s.abbreviation === name)?.displayValue;
    if (pitching) return [
      { label: 'ERA', value: get('ERA') },
      { label: 'W', value: get('wins') || get('W') },
      { label: 'L', value: get('losses') || get('L') },
      { label: 'SO', value: get('strikeouts') || get('SO') },
    ];
    return [
      { label: 'AVG', value: get('avg') || get('AVG') },
      { label: 'HR', value: get('homeRuns') || get('HR') },
      { label: 'RBI', value: get('RBI') },
      { label: 'OPS', value: get('OPS') },
    ];
  }

  // Generic fallback: show first 6 stats
  const stats = categories[0]?.stats || [];
  return stats.slice(0, 6).map((s) => ({ label: s.abbreviation || s.name, value: s.displayValue }));
}

export default function PlayerCard({ player, sport }) {
  const { removePlayer } = useFavorites();
  const { stats, loading, error } = usePlayerStats(sport, player.id);

  const seasonStats = extractSeasonStats(stats, sport);

  return (
    <div className="player-card">
      <div className="player-card-header">
        <div className="player-avatar-wrap">
          {player.headshot ? (
            <img src={player.headshot} alt={player.displayName} className="player-avatar" />
          ) : (
            <div className="player-avatar-placeholder">{player.displayName?.[0]}</div>
          )}
        </div>
        <div className="player-meta">
          <div className="player-name">{player.displayName}</div>
          <div className="player-pos">{player.position}</div>
        </div>
        <button
          className="remove-btn"
          onClick={() => removePlayer(player.id)}
          title="Remove player"
        >
          ×
        </button>
      </div>

      <div className="player-stats-section">
        <div className="stats-label">Season Stats</div>
        {loading && <div className="stats-loading">Loading stats…</div>}
        {error && <div className="stats-error">{error}</div>}
        {!loading && !error && seasonStats.length === 0 && (
          <div className="stats-error">No stats available.</div>
        )}
        {!loading && !error && seasonStats.length > 0 && (
          <div className="stat-pills">
            {seasonStats.map((s) => (
              <StatPill key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import useLiveScores from '../hooks/useLiveScores';
import { useFavorites } from '../context/FavoritesContext';
import ScoreCard from './ScoreCard';

export default function ScoreBoard() {
  const { favorites } = useFavorites();
  const { games, myTeamGames, loading, error, lastUpdated, refresh } =
    useLiveScores(favorites.sport, favorites.team?.id);
  const [showAll, setShowAll] = useState(false);

  const displayed = showAll ? games : myTeamGames.length > 0 ? myTeamGames : games;

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">
            {showAll ? 'All Games' : favorites.team ? `${favorites.team.displayName} Games` : 'Today\'s Games'}
          </h2>
          {lastUpdated && (
            <p className="section-sub">
              Updated {lastUpdated.toLocaleTimeString()} · refreshes every 30s
            </p>
          )}
        </div>
        <div className="header-actions">
          {myTeamGames.length > 0 && (
            <button className="btn-ghost" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'My Team Only' : 'All Games'}
            </button>
          )}
          <button className="btn-ghost" onClick={refresh}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-grid">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton-card" />)}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && displayed.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🏀</div>
          <p>No games scheduled today.</p>
        </div>
      )}

      {!loading && !error && (
        <div className="scores-grid">
          {displayed.map((game) => (
            <ScoreCard
              key={game.id}
              game={game}
              highlight={myTeamGames.some((g) => g.id === game.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

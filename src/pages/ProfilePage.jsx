import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { adaptColorForDarkBg } from '../utils/colorUtils';

function darkUrl(url) {
  if (!url) return url;
  return url.replace(/(\/i\/teamlogos\/[^/]+\/)(\d+)(\/)/, '$1$2-dark$3');
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { favorites } = useFavorites();
  const navigate = useNavigate();

  const teams   = favorites.teams   || [];
  const players = favorites.players || [];

  return (
    <div className="page-content">
      {/* Header */}
      <div className="me-header">
        <div className="me-avatar">{user?.email?.[0]?.toUpperCase() || '?'}</div>
        <div className="me-user-info">
          {user?.email && <div className="me-email">{user.email}</div>}
          <button className="btn-ghost btn-sm" onClick={signOut}>Sign Out</button>
        </div>
      </div>

      {/* Favorite Teams */}
      <section className="me-section">
        <div className="me-section-title">Favorite Teams</div>
        {teams.length === 0 ? (
          <div className="me-empty">No favorite teams yet. <Link to="/" className="me-link">Add from dashboard →</Link></div>
        ) : (
          <div className="me-teams-grid">
            {teams.map(({ sport, team }) => {
              const logo = team.logos?.[0]?.href || team.logo;
              const darkLogo = darkUrl(logo);
              const accentColor = adaptColorForDarkBg(
                team.color ? `#${team.color}` : null,
                team.alternateColor ? `#${team.alternateColor}` : null
              );
              return (
                <Link
                  key={`${sport}-${team.id}`}
                  to={`/team/${sport}/${team.id}`}
                  className="me-team-card"
                  style={{ '--team-accent': accentColor }}
                >
                  {darkLogo && (
                    <img
                      src={darkLogo}
                      alt={team.displayName}
                      className="me-team-logo"
                      onError={(e) => { if (logo && e.target.src !== logo) { e.target.onerror = null; e.target.src = logo; } }}
                    />
                  )}
                  <div className="me-team-name">{team.displayName}</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Favorite Players */}
      <section className="me-section">
        <div className="me-section-title">Favorite Players</div>
        {players.length === 0 ? (
          <div className="me-empty">No favorite players yet. <Link to="/" className="me-link">Add from dashboard →</Link></div>
        ) : (
          <div className="me-players-grid">
            {players.filter((p) => !p.hidden).map((player) => {
              const headshot = typeof player.headshot === 'string'
                ? player.headshot
                : player.headshot?.href;
              return (
                <Link
                  key={player.id}
                  to={`/player/${player.sport}/${player.id}`}
                  className="me-player-card"
                >
                  <div className="me-player-photo">
                    {headshot ? (
                      <img src={headshot} alt={player.displayName} className="me-player-img"
                        onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                      <div className="me-player-placeholder">{player.displayName?.[0]}</div>
                    )}
                  </div>
                  <div className="me-player-name">{player.displayName}</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

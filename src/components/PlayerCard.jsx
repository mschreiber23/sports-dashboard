import { Link } from 'react-router-dom';
import usePlayerStats from '../hooks/usePlayerStats';
import usePlayerBio from '../hooks/usePlayerBio';
import { useFavorites } from '../context/FavoritesContext';
import { adaptColorForDarkBg } from '../utils/colorUtils';
import { extractSeasonStats, gamesPlayedLine, gamesPlayedValue } from '../utils/playerCardStats';

/* ── Trading Card Component ─────────────────────────── */
export default function PlayerCard({ player, sport }) {
  const { } = useFavorites(); // remove button moved to edit mode
  const { stats, loading, error } = usePlayerStats(sport, player.id);
  const liveBio = usePlayerBio(sport, player.id);

  // Use live position from bio (most accurate), fall back to stored.
  // player.position may be a full ESPN position object {id,name,abbreviation,...} — extract the string safely.
  const rawStoredPos = player.position;
  const storedPos = typeof rawStoredPos === 'string' ? rawStoredPos : rawStoredPos?.abbreviation || player._position || '';
  const position = liveBio.position || storedPos;
  if (stats) stats._position = position;
  const seasonStats = extractSeasonStats(stats, sport);
  const gamesPlayed = gamesPlayedLine(seasonStats, gamesPlayedValue(stats, sport));

  // Team color: live from bio > stored top-level > stored team object > accent
  const rawColor    = liveBio.teamColor    || player.teamColor    || player.team?.color;
  const rawAltColor = liveBio.teamAltColor || player.teamAltColor || player.team?.alternateColor;
  const primaryHex  = rawColor    ? `#${rawColor}`    : null;
  const altHex      = rawAltColor ? `#${rawAltColor}` : null;
  // Info strip accent: adapted so dark primaries are visible as a solid bg color
  const teamColor = adaptColorForDarkBg(primaryHex, altHex);
  // Photo gradient: use the secondary/alternate color directly — dark saturated colors
  // look great as a subtle gradient tint without needing the lightness boost
  const cardColor = altHex || primaryHex || '#0092ff';
  const teamShort = liveBio.teamName || player.teamName?.split(' ').pop() || '';

  return (
    <div className="sports-card">
      {/* Shine overlay */}
      <div className="sports-card-shine" />


      {/* Photo area */}
      <Link to={`/player/${sport}/${player.id}`} className="sports-card-photo-link">
        <div className="sports-card-photo-wrap" style={{ '--card-color': cardColor }}>
          {player.headshot ? (
            <img src={typeof player.headshot === 'object' ? player.headshot?.href : player.headshot} alt={player.displayName} className="sports-card-photo" />
          ) : (
            <div className="sports-card-photo-placeholder">{player.displayName?.[0]}</div>
          )}
          {gamesPlayed != null && (
            <div className="sports-card-gp" aria-label={`${gamesPlayed} games played`}>
              <span className="sports-card-gp-value">{gamesPlayed}</span>
              <span className="sports-card-gp-label">GP</span>
            </div>
          )}
          {/* Gradient fade at bottom of photo — uses secondary color for natural team feel */}
          <div className="sports-card-fade" style={{ background: `linear-gradient(to bottom, transparent 0%, ${cardColor}cc 100%)` }} />
        </div>

        {/* Player info strip */}
          <div className="sports-card-info" style={{ background: teamColor }}>
            <div className="sports-card-name">{player.displayName}</div>
            <div className="sports-card-meta">{position} · {teamShort}</div>
          </div>
      </Link>

      {/* Stats section */}
      <div className="sports-card-stats">
        {loading && <div className="sports-card-loading">Loading…</div>}
        {!loading && !error && seasonStats.length > 0 && (
          <div className="sports-card-stat-grid">
            {seasonStats.map((s) => (
              <div key={s.label} className="sports-card-stat">
                <div className="sports-card-stat-value">{s.value ?? '—'}</div>
                <div className="sports-card-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        )}
        {!loading && (error || seasonStats.length === 0) && (
          <div className="sports-card-loading">No stats available</div>
        )}
      </div>
    </div>
  );
}

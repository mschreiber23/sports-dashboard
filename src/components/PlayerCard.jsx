import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import usePlayerStats from '../hooks/usePlayerStats';
import usePlayerBio from '../hooks/usePlayerBio';
import { useFavorites } from '../context/FavoritesContext';
import { teamMarkUrls } from '../api/espn';
import { adaptColorForDarkBg } from '../utils/colorUtils';
import { extractSeasonStats, gamesPlayedLine, gamesPlayedValue } from '../utils/playerCardStats';
import { applyFinishedGames } from '../utils/freshPlayerGames';

function CardLogo({ team, sport }) {
  const urls = teamMarkUrls(team, sport);
  const key = urls.join('|');
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [key]);
  const src = urls[index];
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className="sports-card-logo"
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

/* ── Trading Card Component ─────────────────────────── */
export default function PlayerCard({ player, sport }) {
  const { } = useFavorites(); // remove button moved to edit mode
  const { stats, log, loading, error } = usePlayerStats(sport, player.id);
  const liveBio = usePlayerBio(sport, player.id);

  // Use live position from bio (most accurate), fall back to stored.
  // player.position may be a full ESPN position object {id,name,abbreviation,...} — extract the string safely.
  const rawStoredPos = player.position;
  const storedPos = typeof rawStoredPos === 'string' ? rawStoredPos : rawStoredPos?.abbreviation || player._position || '';
  const position = liveBio.position || storedPos;
  const liveStats = applyFinishedGames(stats, log, sport, position);
  if (liveStats) liveStats._position = position;
  const seasonStats = extractSeasonStats(liveStats, sport);
  const gamesPlayed = gamesPlayedLine(seasonStats, gamesPlayedValue(liveStats, sport));

  // Team color: live from bio > stored top-level > stored team object > accent
  const rawColor    = liveBio.teamColor    || player.teamColor    || player.team?.color;
  const primaryHex  = rawColor    ? `#${rawColor}`    : null;
  const altHex      = (liveBio.teamAltColor || player.teamAltColor || player.team?.alternateColor)
    ? `#${liveBio.teamAltColor || player.teamAltColor || player.team?.alternateColor}`
    : null;
  const teamColor = adaptColorForDarkBg(primaryHex, altHex);
  const teamShort = liveBio.teamName || player.teamName?.split(' ').pop() || '';
  const logoTeam = liveBio.team || player.team || null;

  return (
    <div className="sports-card">
      {/* Shine overlay */}
      <div className="sports-card-shine" />


      {/* Photo area */}
      <Link to={`/player/${sport}/${player.id}`} className="sports-card-photo-link">
        <div className="sports-card-photo-wrap">
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
          <CardLogo team={logoTeam} sport={sport} />
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

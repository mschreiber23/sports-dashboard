import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import usePlayerStats from '../hooks/usePlayerStats';
import usePlayerBio from '../hooks/usePlayerBio';
import { useFavorites } from '../context/FavoritesContext';
import { teamMarkUrls } from '../api/espn';
import { extractSeasonStats, gamesPlayedLine, gamesPlayedValue } from '../utils/playerCardStats';
import { applyFinishedGames } from '../utils/freshPlayerGames';

const NAME_SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);

function shortCardName(displayName) {
  const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  let last = parts[parts.length - 1];
  if (parts.length > 2 && NAME_SUFFIXES.has(last.toLowerCase())) {
    last = `${parts[parts.length - 2]} ${last}`;
  }
  const initial = parts[0].replace(/\./g, '').charAt(0).toUpperCase();
  return initial ? `${initial}. ${last}` : last;
}

function teamHex(raw) {
  if (!raw) return null;
  const clean = String(raw).replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(clean) ? `#${clean}` : null;
}

function barInk(hex) {
  const clean = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#fff';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? '#1a1a1a' : '#fff';
}

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

  const primaryHex = teamHex(liveBio.teamColor || player.teamColor || player.team?.color) || '#1e1e26';
  const secondaryHex = teamHex(liveBio.teamAltColor || player.teamAltColor || player.team?.alternateColor) || '#2a2a34';
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

        <div className="sports-card-namebar" style={{ background: primaryHex, color: barInk(primaryHex) }}>
          <div className="sports-card-name">{shortCardName(player.displayName)}</div>
        </div>
        <div className="sports-card-metabar" style={{ background: secondaryHex, color: barInk(secondaryHex) }}>
          <div className="sports-card-meta">{[position, teamShort].filter(Boolean).join(' · ')}</div>
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

import { Link } from 'react-router-dom';
import usePlayerStats from '../hooks/usePlayerStats';
import usePlayerBio from '../hooks/usePlayerBio';
import { useFavorites } from '../context/FavoritesContext';
import { extractSeasonStats, gamesPlayedLine, gamesPlayedValue } from '../utils/playerCardStats';
import { applyFinishedGames } from '../utils/freshPlayerGames';

function hexHsl(hex) {
  const clean = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  if (max === min) return [0, 0, light];
  const d = max - min;
  const sat = light > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue;
  switch (max) {
    case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
    case g: hue = (b - r) / d + 2; break;
    default: hue = (r - g) / d + 4; break;
  }
  return [hue / 6, sat, light];
}

/* A light chrome edge and a darker left rail, both from the team color. */
function chromeTones(hex) {
  const hsl = hexHsl(hex);
  if (!hsl) {
    return { frame: '#7fd7ea', rail: '#0d4e9c', stripe: '#3d8fe0' };
  }
  const hue = Math.round(hsl[0] * 360);
  const sat = Math.round(Math.max(hsl[1], 0.42) * 100);
  return {
    frame: `hsl(${hue} ${Math.min(sat, 72)}% 64%)`,
    rail: `hsl(${hue} ${Math.min(sat, 78)}% 22%)`,
    stripe: `hsl(${hue} ${Math.min(sat, 84)}% 46%)`,
  };
}

function splitName(displayName) {
  const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: '', last: (parts[0] || '').toUpperCase() };
  return {
    first: parts.slice(0, -1).join(' ').toUpperCase(),
    last: parts[parts.length - 1].toUpperCase(),
  };
}

/* ── Trading Card Component ─────────────────────────── */
export default function PlayerCard({ player, sport }) {
  const { } = useFavorites(); // remove button moved to edit mode
  const { stats, log, loading, error } = usePlayerStats(sport, player.id);
  const liveBio = usePlayerBio(sport, player.id);

  const rawStoredPos = player.position;
  const storedPos = typeof rawStoredPos === 'string' ? rawStoredPos : rawStoredPos?.abbreviation || player._position || '';
  const position = liveBio.position || storedPos;
  const liveStats = applyFinishedGames(stats, log, sport, position);
  if (liveStats) liveStats._position = position;
  const seasonStats = extractSeasonStats(liveStats, sport);
  const gamesPlayed = gamesPlayedLine(seasonStats, gamesPlayedValue(liveStats, sport));

  const rawColor = liveBio.teamColor || player.teamColor || player.team?.color;
  const primaryHex = rawColor ? `#${String(rawColor).replace('#', '')}` : null;
  const tones = chromeTones(primaryHex);
  const storedTeam = String(player.teamName || '').split('·')[0].trim();
  const teamName = (liveBio.teamName || (storedTeam.split(/\s+/).length === 1 ? storedTeam : '')).toUpperCase();
  const teamLogo = liveBio.teamLogo || null;
  const headshot = typeof player.headshot === 'object' ? player.headshot?.href : player.headshot;
  const { first, last } = splitName(player.displayName);

  return (
    <div
      className="sports-card"
      style={{ '--chrome-frame': tones.frame, '--chrome-rail': tones.rail, '--chrome-stripe': tones.stripe }}
    >
      <div className="sports-card-shine" />
      <Link to={`/player/${sport}/${player.id}`} className="chrome-face">
        <div className="chrome-rail">
          {teamName && (
            <div className="chrome-team" aria-hidden="true">
              {[...teamName].map((letter, index) => (
                <span key={`${letter}-${index}`}>{letter === ' ' ? '\u00a0' : letter}</span>
              ))}
            </div>
          )}
        </div>
        <div className="chrome-window">
          {headshot ? (
            <img src={headshot} alt={player.displayName} className="chrome-headshot" />
          ) : (
            <div className="chrome-headshot chrome-headshot-fallback" aria-hidden="true">{player.displayName?.[0]}</div>
          )}
          {gamesPlayed != null && (
            <div className="sports-card-gp" aria-label={`${gamesPlayed} games played`}>
              <span className="sports-card-gp-value">{gamesPlayed}</span>
              <span className="sports-card-gp-label">GP</span>
            </div>
          )}
          <div className="chrome-nameplate">
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
              <div className="sports-card-loading">No stats</div>
            )}
            {first && <div className="chrome-first">{first}</div>}
            <div className="chrome-last">{last}</div>
          </div>
        </div>
        {teamLogo ? (
          <img src={teamLogo} alt="" className="chrome-logo" />
        ) : (
          <span className="chrome-logo chrome-logo-fallback" />
        )}
      </Link>
    </div>
  );
}

import { Link } from 'react-router-dom';
import usePlayerStats from '../hooks/usePlayerStats';
import usePlayerBio from '../hooks/usePlayerBio';
import { useFavorites } from '../context/FavoritesContext';
import { adaptColorForDarkBg } from '../utils/colorUtils';

/* ── Stat extraction — exactly 4 stats per position ─── */
function extractSeasonStats(statsData, sport) {
  if (!statsData) return [];
  const categories = statsData.splits?.categories || [];
  const position = (statsData._position || '').toUpperCase();

  const getCatStats = (cat) => {
    if (!cat) return {};
    const result = {};
    (cat.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
    return result;
  };

  const mergeAll = () => {
    const s = {};
    categories.forEach((cat) => Object.assign(s, getCatStats(cat)));
    return s;
  };

  if (sport === 'mlb') {
    const pitching = categories.find((c) => c.name === 'pitching');
    const batting  = categories.find((c) => c.name === 'batting');
    if (pitching) {
      const s = getCatStats(pitching);
      const g = getCatStats(categories.find((c) => c.name === 'general'));
      const w = g['WINS'] || s['W'] || '—';
      const l = s['L'] || '—';
      return [
        { label: 'W-L',  value: w && l && w !== '—' ? `${w}-${l}` : '—' },
        { label: 'ERA',  value: s['ERA'] },
        { label: 'WHIP', value: s['WHIP'] },
        { label: 'K',    value: s['K'] || s['SO'] },
      ];
    }
    const s = getCatStats(batting || categories[0]);
    return [
      { label: 'AVG', value: s['AVG'] },
      { label: 'OBP', value: s['OBP'] },
      { label: 'HR',  value: s['HR'] },
      { label: 'RBI', value: s['RBI'] },
    ];
  }

  if (sport === 'nba') {
    const merged = statsData._merged;
    const s = merged || mergeAll();
    const stl = parseFloat(s['STL'] || 0);
    const blk = parseFloat(s['BLK'] || 0);
    const stocks = (stl + blk).toFixed(1);
    return [
      { label: 'PTS',    value: s['PTS'] },
      { label: 'REB',    value: s['REB'] },
      { label: 'AST',    value: s['AST'] },
      { label: 'STOCKS', value: stocks === '0.0' ? '—' : stocks },
    ];
  }

  if (sport === 'nfl') {
    const passing   = categories.find((c) => c.name?.includes('pass'));
    const rushing   = categories.find((c) => c.name?.includes('rush'));
    const receiving = categories.find((c) => c.name?.includes('receiv'));
    const general   = categories.find((c) => c.name === 'general');
    const gp = getCatStats(general)['GP'] || '—';

    if (['QB'].includes(position) || (!position && passing)) {
      const s = getCatStats(passing);
      return [
        { label: 'GP',  value: gp },
        { label: 'YDS', value: s['YDS'] },
        { label: 'TD',  value: s['TD'] },
        { label: 'INT', value: s['INT'] },
      ];
    }
    if (['RB','HB','FB'].includes(position) || (!position && rushing && !passing)) {
      const s = getCatStats(rushing);
      return [
        { label: 'GP',  value: gp },
        { label: 'CAR', value: s['CAR'] },
        { label: 'YDS', value: s['YDS'] },
        { label: 'TD',  value: s['TD'] },
      ];
    }
    // WR / TE
    const s = getCatStats(receiving);
    return [
      { label: 'GP',  value: gp },
      { label: 'REC', value: s['REC'] },
      { label: 'YDS', value: s['YDS'] },
      { label: 'TD',  value: s['TD'] },
    ];
  }

  if (sport === 'nhl') {
    const NHL_GOALIE = ['G', 'GK'];
    const s = mergeAll();
    const off = getCatStats(categories.find((c) => c.name === 'offensive'));
    Object.assign(s, off);

    if (NHL_GOALIE.includes(position)) {
      const def = getCatStats(categories.find((c) => c.name === 'defensive'));
      const gen = getCatStats(categories.find((c) => c.name === 'general'));
      return [
        { label: 'W',   value: gen['WINS'] || s['W'] },
        { label: 'GAA', value: def['GAA'] || s['GAA'] },
        { label: 'SV%', value: def['SV%'] || s['SV%'] },
        { label: 'SO',  value: def['SO'] || s['SO'] },
      ];
    }
    // Skaters
    return [
      { label: 'G',   value: s['G'] },
      { label: 'A',   value: s['A'] },
      { label: 'PTS', value: s['PTS'] },
      { label: '+/-', value: s['+/-'] },
    ];
  }

  const s = getCatStats(categories[0]);
  return Object.entries(s).slice(0, 4).map(([label, value]) => ({ label, value }));
}

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

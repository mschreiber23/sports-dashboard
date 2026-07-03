import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchMiLBPlayerBio, fetchMiLBGameLog, fetchMiLBSeasonStats,
  milbHeadshotUrl, milbTeamLogoUrl, levelShort, MILB_LEVELS,
} from '../api/milb';

const STORAGE_KEY = 'playerCards_v1';
const isPitcher = (pos) => /^(SP|RP|P|CP|CL|MR|SU)$/i.test(pos || '');

function addToCards(player) {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    if (existing.some(c => c.id === player.id && c.sport === 'milb')) return false;
    const updated = [player, ...existing.filter(c => !(c.id === player.id))];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch { return false; }
}

function StatRow({ label, value }) {
  if (value == null || value === '' || value === '---' || value === '-.--') return null;
  return (
    <div className="mpp-stat-row">
      <span className="mpp-stat-lbl">{label}</span>
      <span className="mpp-stat-val">{value}</span>
    </div>
  );
}

export default function MiLBPlayerPage() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const [bio, setBio] = useState(null);
  const [seasonStats, setSeasonStats] = useState(null);
  const [gamelog, setGamelog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(false);

  const posAbb = bio?.primaryPosition?.abbreviation || '';
  const isPitch = isPitcher(posAbb);
  const team = bio?.currentTeam || {};
  const sportId = team.sport?.id;
  const level = levelShort(sportId);
  const headshot = milbHeadshotUrl(playerId);
  const teamLogo = milbTeamLogoUrl(team.id);

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    setBio(null); setSeasonStats(null); setGamelog([]);

    fetchMiLBPlayerBio(playerId).then(b => {
      setBio(b);
      const pos = b?.primaryPosition?.abbreviation || '';
      const group = isPitcher(pos) ? 'pitching' : 'hitting';
      return Promise.all([
        fetchMiLBSeasonStats(playerId, pos),
        fetchMiLBGameLog(playerId, group),
      ]);
    }).then(([ss, gl]) => {
      setSeasonStats(ss);
      setGamelog(gl.slice(0, 20));
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [playerId]);

  const handleAddToCards = () => {
    if (!bio) return;
    const player = {
      id: String(playerId),
      sport: 'milb',
      displayName: bio.fullName || '',
      headshot: headshot,
      jersey: bio.primaryNumber || '',
      team: {
        id: String(team.id || ''),
        abbreviation: team.abbreviation || '',
        displayName: team.name || '',
        logo: milbTeamLogoUrl(team.id),
        color: null, alternateColor: null,
      },
      position: posAbb,
      _position: posAbb,
    };
    const ok = addToCards(player);
    setAdded(ok || true);
  };

  if (loading) return <div className="page-content"><div className="tp-loading">Loading…</div></div>;
  if (!bio) return <div className="page-content"><div className="error-banner">Player not found.</div></div>;

  const glCols = isPitch
    ? ['date', 'opp', 'IP', 'H', 'R', 'ER', 'BB', 'K', 'ERA']
    : ['date', 'opp', 'AB', 'H', 'HR', 'RBI', 'BB', 'K', 'AVG'];

  const getGlVal = (split, col) => {
    const s = split.stat || {};
    const opp = split.opponent?.abbreviation || split.team?.abbreviation || '';
    const date = split.date ? split.date.slice(5) : ''; // MM-DD
    switch (col) {
      case 'date': return date;
      case 'opp':  return opp;
      case 'AB':   return s.atBats ?? '—';
      case 'H':    return s.hits ?? '—';
      case 'HR':   return s.homeRuns ?? '—';
      case 'RBI':  return s.rbi ?? '—';
      case 'BB':   return s.baseOnBalls ?? '—';
      case 'K':    return s.strikeOuts ?? '—';
      case 'AVG':  return s.avg ?? '—';
      case 'IP':   return s.inningsPitched ?? '—';
      case 'R':    return s.runs ?? '—';
      case 'ER':   return s.earnedRuns ?? '—';
      case 'ERA':  return s.era ?? '—';
      default:     return '—';
    }
  };

  return (
    <div className="page-content">
      {/* Back button */}
      <button className="tp-back" onClick={() => navigate(-1)}>
        ‹ Back
      </button>

      {/* Player header */}
      <div className="mpp-header">
        <div className="mpp-headshot-wrap">
          {headshot && (
            <img src={headshot} alt="" className="mpp-headshot"
              onError={e => { e.target.style.display = 'none'; }} />
          )}
        </div>
        <div className="mpp-info">
          <div className="mpp-name">{bio.fullName}</div>
          <div className="mpp-meta">
            {posAbb && <span className="mpp-pos">{posAbb}</span>}
            {bio.primaryNumber && <span className="mpp-jersey">#{bio.primaryNumber}</span>}
            {level && <span className="milb-level-badge">{level}</span>}
          </div>
          {team.name && (
            <div className="mpp-team">
              {teamLogo && (
                <img src={teamLogo} alt="" className="mpp-team-logo"
                  onError={e => { e.target.style.display = 'none'; }} />
              )}
              <span>{team.name}</span>
            </div>
          )}
          {bio.birthDate && (
            <div className="mpp-bio-line">
              Born {bio.birthDate}
              {bio.birthCity ? `, ${bio.birthCity}` : ''}
              {bio.birthStateProvince ? `, ${bio.birthStateProvince}` : ''}
            </div>
          )}
          {bio.height && bio.weight && (
            <div className="mpp-bio-line">{bio.height} · {bio.weight} lbs</div>
          )}
        </div>
      </div>

      {/* Add to Cards button */}
      <div style={{ padding: '8px 16px' }}>
        <button
          className={added ? 'btn-ghost' : 'btn-primary'}
          style={{ width: '100%' }}
          onClick={handleAddToCards}
          disabled={added}>
          {added ? '✓ Added to Player Cards' : '+ Add to Player Cards'}
        </button>
      </div>

      {/* Season stats */}
      {seasonStats && Object.keys(seasonStats).length > 0 && (
        <div className="mpp-section">
          <div className="mpp-section-title">{new Date().getFullYear()} Season Stats</div>
          <div className="mpp-stats-grid">
            {isPitch ? (
              <>
                <StatRow label="ERA"  value={seasonStats.ERA} />
                <StatRow label="W-L"  value={seasonStats['W-L']} />
                <StatRow label="IP"   value={seasonStats.IP} />
                <StatRow label="K"    value={seasonStats.K} />
                <StatRow label="BB"   value={seasonStats.BB} />
                <StatRow label="H"    value={seasonStats.H} />
                <StatRow label="ER"   value={seasonStats.ER} />
              </>
            ) : (
              <>
                <StatRow label="AVG"  value={seasonStats.AVG} />
                <StatRow label="OBP"  value={seasonStats.OBP} />
                <StatRow label="SLG"  value={seasonStats.SLG} />
                <StatRow label="AB"   value={seasonStats.AB} />
                <StatRow label="H"    value={seasonStats.H} />
                <StatRow label="HR"   value={seasonStats.HR} />
                <StatRow label="RBI"  value={seasonStats.RBI} />
                <StatRow label="R"    value={seasonStats.R} />
                <StatRow label="BB"   value={seasonStats.BB} />
                <StatRow label="K"    value={seasonStats.K} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Recent game log */}
      {gamelog.length > 0 && (
        <div className="mpp-section">
          <div className="mpp-section-title">Recent Games</div>
          <div className="mpp-gamelog-wrap">
            <table className="mpp-gamelog">
              <thead>
                <tr>
                  {glCols.map(c => <th key={c} className="mpp-gl-th">{c === 'date' ? 'Date' : c === 'opp' ? 'Opp' : c}</th>)}
                </tr>
              </thead>
              <tbody>
                {gamelog.map((split, i) => (
                  <tr key={i} className="mpp-gl-row">
                    {glCols.map(c => (
                      <td key={c} className="mpp-gl-td">{getGlVal(split, c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchMiLBPlayerBio, fetchMiLBAllStats, fetchMiLBGameLog,
  milbHeadshotUrl, milbTeamLogoUrl, levelShort,
} from '../api/milb';

const STORAGE_KEY = 'playerCards_v1';
const isPitcher = (pos) => /^(SP|RP|P|CP|CL|MR|SU)$/i.test(pos || '');

function writeToCards(player) {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    if (existing.some(c => c.id === player.id && c.sport === 'milb')) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify([player, ...existing]));
    return true;
  } catch { return false; }
}

const BAT_COLS  = ['G','AB','R','H','2B','3B','HR','RBI','BB','K','SB','AVG','OBP','SLG','OPS'];
const PITCH_COLS = ['G','GS','W','L','ERA','IP','H','R','ER','BB','K','WHIP'];

function getStatVal(stat, col) {
  if (!stat) return '—';
  switch (col) {
    case 'G':    return stat.gamesPlayed ?? '—';
    case 'GS':   return stat.gamesStarted ?? '—';
    case 'AB':   return stat.atBats ?? '—';
    case 'R':    return stat.runs ?? '—';
    case 'H':    return stat.hits ?? '—';
    case '2B':   return stat.doubles ?? '—';
    case '3B':   return stat.triples ?? '—';
    case 'HR':   return stat.homeRuns ?? '—';
    case 'RBI':  return stat.rbi ?? '—';
    case 'BB':   return stat.baseOnBalls ?? '—';
    case 'K':    return stat.strikeOuts ?? '—';
    case 'SB':   return stat.stolenBases ?? '—';
    case 'AVG':  return stat.avg ?? '—';
    case 'OBP':  return stat.obp ?? '—';
    case 'SLG':  return stat.slg ?? '—';
    case 'OPS':  return stat.ops ?? '—';
    case 'W':    return stat.wins ?? '—';
    case 'L':    return stat.losses ?? '—';
    case 'ERA':  return stat.era ?? '—';
    case 'IP':   return stat.inningsPitched ?? '—';
    case 'ER':   return stat.earnedRuns ?? '—';
    case 'WHIP': return stat.whip ?? '—';
    default:     return '—';
  }
}

const GL_BAT_COLS  = ['Date','Opp','AB','H','HR','RBI','BB','K','AVG'];
const GL_PIT_COLS  = ['Date','Opp','IP','H','R','ER','BB','K','ERA'];

function getGlVal(split, col) {
  const s = split.stat || {};
  switch (col) {
    case 'Date': return split.date ? split.date.slice(5) : '—';
    case 'Opp':  return split.opponent?.abbreviation || split.team?.abbreviation || '—';
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
}

export default function MiLBPlayerPage() {
  const { playerId } = useParams();
  const navigate = useNavigate();

  const [bio, setBio]               = useState(null);
  const [allStats, setAllStats]     = useState([]);
  const [gamelog, setGamelog]       = useState([]);
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [added, setAdded]       = useState(false);
  const [activeTab, setActiveTab] = useState('stats');

  const posAbb   = bio?.primaryPosition?.abbreviation || '';
  const isPitch  = isPitcher(posAbb);
  const group    = isPitch ? 'pitching' : 'hitting';
  const cols     = isPitch ? PITCH_COLS : BAT_COLS;
  const glCols   = isPitch ? GL_PIT_COLS : GL_BAT_COLS;

  const team     = bio?.currentTeam || {};
  const headshot = milbHeadshotUrl(playerId);
  const teamLogo = milbTeamLogoUrl(team.id);

  // Derive current level from the most recent stats split matching current team
  const currentSplit = allStats.find(s => s.team?.id === team.id);
  const level = currentSplit?.sport?.abbreviation || levelShort(currentSplit?.sport?.id) || '';

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    setBio(null); setAllStats([]); setGamelog([]);

    fetchMiLBPlayerBio(playerId)
      .then(b => {
        if (!b) return;
        setBio(b);
        const pos = b.primaryPosition?.abbreviation || '';
        const grp = isPitcher(pos) ? 'pitching' : 'hitting';

        return fetchMiLBAllStats(playerId, grp)
          .then(splits => {
            setAllStats(splits);
            // Determine current sport level from splits matching current team
            const curSplit = splits.find(s => s.team?.id === b.currentTeam?.id);
            const curSportId = curSplit?.sport?.id || 11;
            return fetchMiLBGameLog(playerId, grp, curSportId);
          })
          .then(gl => setGamelog(gl.slice(0, 25)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [playerId]);

  // Group stats: current season at top, then by year+level
  const currentYear = String(new Date().getFullYear());
  const currentSeasonSplits = allStats.filter(s => s.season === currentYear);
  const priorSplits         = allStats.filter(s => s.season !== currentYear);

  if (loading) {
    return (
      <div className="page-content">
        <button className="tp-back" onClick={() => navigate(-1)}>‹ Back</button>
        <div className="tp-loading" style={{marginTop:32}}>Loading…</div>
      </div>
    );
  }

  if (!bio) {
    return (
      <div className="page-content">
        <button className="tp-back" onClick={() => navigate(-1)}>‹ Back</button>
        <div className="error-banner" style={{marginTop:16}}>Player not found.</div>
      </div>
    );
  }

  const handleAddToCards = () => {
    const player = {
      id: String(playerId),
      sport: 'milb',
      displayName: bio.fullName || '',
      headshot,
      jersey: bio.primaryNumber || '',
      team: {
        id: String(team.id || ''),
        abbreviation: team.abbreviation || team.teamCode?.toUpperCase() || '',
        displayName: team.name || '',
        logo: milbTeamLogoUrl(team.id),
        color: null, alternateColor: null,
      },
      position: posAbb,
      _position: posAbb,
    };
    writeToCards(player);
    setAdded(true);
  };

  const HL_COLS = isPitch
    ? new Set(['ERA','K','WHIP'])
    : new Set(['AVG','OBP','SLG','OPS','HR','RBI']);

  const StatsTable = ({ splits, title }) => {
    if (!splits.length) return null;
    return (
      <div className="mpp-section">
        {title && <div className="mpp-section-title">{title}</div>}
        <div className="mpp-gamelog-wrap">
          <table className="mpp-gamelog">
            <thead>
              <tr>
                <th className="mpp-gl-th" style={{textAlign:'left'}}>Year</th>
                <th className="mpp-gl-th" style={{textAlign:'left'}}>Lvl</th>
                <th className="mpp-gl-th" style={{textAlign:'left'}}>Team</th>
                {cols.map(c => <th key={c} className="mpp-gl-th">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {splits.map((split, i) => {
                const levelBadge = split.sport?.abbreviation || levelShort(split.sport?.id);
                const tAbbr = split.team?.name?.split(' ').pop() || '';
                return (
                  <tr key={i} className="mpp-gl-row">
                    <td className="mpp-gl-td" style={{textAlign:'left', color:'var(--text2)'}}>{split.season}</td>
                    <td className="mpp-gl-td" style={{textAlign:'left'}}>
                      {levelBadge && <span className="milb-level-badge" style={{fontSize:8,padding:'1px 4px'}}>{levelBadge}</span>}
                    </td>
                    <td className="mpp-gl-td" style={{textAlign:'left', color:'var(--text2)', maxWidth:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{tAbbr}</td>
                    {cols.map(c => (
                      <td key={c} className={`mpp-gl-td${HL_COLS.has(c) ? ' mpp-gl-td-hl' : ''}`}>
                        {getStatVal(split.stat, c)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="page-content">
      <button className="tp-back" onClick={() => navigate(-1)}>‹ Back</button>

      {/* Player header */}
      <div className="mpp-header">
        <div className="mpp-headshot-wrap">
          {(headshot && !headshotFailed)
            ? <img src={headshot} alt="" className="mpp-headshot"
                onError={() => setHeadshotFailed(true)} />
            : <div style={{fontSize:28,fontWeight:800,color:'var(--text2)'}}>
                {(bio?.fullName || '?')[0]}
              </div>
          }
        </div>
        <div className="mpp-info">
          <div className="mpp-name">{bio.fullName}</div>
          <div className="mpp-meta">
            {posAbb && <span className="mpp-pos">{posAbb}</span>}
            {bio.primaryNumber && <span className="mpp-jersey">#{bio.primaryNumber}</span>}
            {level && <span className="milb-level-badge">{level}</span>}
            {bio.batSide?.code && !isPitch && (
              <span className="mpp-pos">{bio.batSide.code === 'S' ? 'S' : bio.batSide.code} · {bio.pitchHand?.code}HP</span>
            )}
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
          <div style={{display:'flex', gap:8, marginTop:4, flexWrap:'wrap'}}>
            {bio.birthDate && <span className="mpp-bio-line">Born {bio.birthDate}</span>}
            {bio.height && bio.weight && <span className="mpp-bio-line">{bio.height} · {bio.weight} lbs</span>}
            {bio.birthCity && <span className="mpp-bio-line">{bio.birthCity}{bio.birthStateProvince ? `, ${bio.birthStateProvince}` : ''}</span>}
            {bio.draftYear && <span className="mpp-bio-line">Draft {bio.draftYear}</span>}
          </div>
        </div>
      </div>

      {/* Add to Cards */}
      <div style={{ padding: '8px 16px' }}>
        <button
          className={added ? 'btn-ghost' : 'btn-primary'}
          style={{ width: '100%' }}
          onClick={handleAddToCards}
          disabled={added}>
          {added ? '✓ Added to Player Cards' : '+ Add to Player Cards'}
        </button>
      </div>

      {/* Tabs */}
      <div className="bsp-tabs-row">
        {['stats', 'gamelog'].map(t => (
          <button key={t}
            className={`bsp-tab-btn ${activeTab === t ? 'bsp-tab-btn-active' : ''}`}
            onClick={() => setActiveTab(t)}>
            {t === 'stats' ? 'Stats' : 'Game Log'}
          </button>
        ))}
      </div>

      {/* Stats tab */}
      {activeTab === 'stats' && (
        <>
          {currentSeasonSplits.length > 0 && (
            <StatsTable splits={currentSeasonSplits} title={`${currentYear} Season`} />
          )}
          {priorSplits.length > 0 && (
            <StatsTable splits={priorSplits} title="Career by Year & Level" />
          )}
          {allStats.length === 0 && (
            <div className="tp-loading" style={{padding:24}}>No stats available.</div>
          )}
        </>
      )}

      {/* Game Log tab */}
      {activeTab === 'gamelog' && (
        <div className="mpp-section">
          {gamelog.length === 0 ? (
            <div className="tp-loading" style={{padding:24}}>No games logged yet.</div>
          ) : (
            <div className="mpp-gamelog-wrap">
              <table className="mpp-gamelog">
                <thead>
                  <tr>
                    {glCols.map(c => (
                      <th key={c} className="mpp-gl-th"
                        style={c === 'Date' || c === 'Opp' ? {textAlign:'left'} : {}}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gamelog.map((split, i) => (
                    <tr key={i} className="mpp-gl-row">
                      {glCols.map(c => (
                        <td key={c} className="mpp-gl-td"
                          style={c === 'Date' || c === 'Opp' ? {textAlign:'left', color:'var(--text2)'} : {}}>
                          {getGlVal(split, c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

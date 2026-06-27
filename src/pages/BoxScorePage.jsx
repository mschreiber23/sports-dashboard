import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import useBoxScore from '../hooks/useBoxScore';
import { getTeamLogo, getTeamLogoFallback } from '../api/espn';
import useMlbLiveFeed, { mlbHeadshot } from '../hooks/useMlbLiveFeed';

/* ─── Pitch metadata ─────────────────────────────────── */
const PITCH_NAMES = {
  FF:'Four-Seam', FA:'Fastball', FT:'Two-Seam', SI:'Sinker',
  FC:'Cutter', CH:'Changeup', CU:'Curveball', KC:'Knuckle Curve',
  SL:'Slider', SV:'Slurve', FS:'Splitter', FO:'Forkball',
  KN:'Knuckleball', EP:'Eephus', ST:'Sweeper', SV:'Slurve',
};
function pitchLabel(code, desc) { return PITCH_NAMES[code] || desc || code || '?'; }

// Color by RESULT (matches MLB.com Gameday)
function resultColor(details) {
  if (!details) return '#6b7280';
  const d = details.description?.toLowerCase() || '';
  if (details.isInPlay)                        return '#9333ea'; // purple
  if (d.includes('foul'))                      return '#f59e0b'; // amber
  if (d.includes('hit by'))                    return '#f97316'; // orange
  if (details.isStrike)                        return '#ef4444'; // red
  if (details.isBall)                          return '#22c55e'; // green
  return '#6b7280';
}

/* ─── At-Bat Pitch Log ───────────────────────────────────
   Shows pitch-by-pitch log for recent at-bats, like MLB.com
──────────────────────────────────────────────────────── */
function AtBatEntry({ atBat, isCurrent }) {
  const pitches = (atBat.playEvents || []).filter((e) => e.type === 'pitch');
  if (!pitches.length) return null;

  const result = atBat.result || {};
  const batter = atBat.matchup?.batter || {};
  const batterId = batter.id;
  const headshot = mlbHeadshot(batterId);

  return (
    <div className="ab-entry">
      {/* At-bat result header */}
      {result.description && (
        <div className="ab-result-header">
          {headshot && (
            <img src={headshot} alt="" className="ab-headshot"
              onError={(e) => { e.target.style.display = 'none'; }} />
          )}
          <div className="ab-result-body">
            <span className={`ab-event-badge ab-event-${(result.event||'').toLowerCase().replace(/\s+/g,'')}`}>
              {result.event}
            </span>
            <span className="ab-result-desc">
              {result.description}
              {atBat.count?.outs != null && <strong> {atBat.count.outs} out{atBat.count.outs!==1?'s':''}.</strong>}
            </span>
          </div>
        </div>
      )}

      {/* Pitch list — newest first */}
      <div className="ab-pitches">
        {[...pitches].reverse().map((p, i) => {
          const det  = p.details || {};
          const pd   = p.pitchData || {};
          const cnt  = p.count || {};
          const col  = resultColor(det);
          const num  = pitches.length - i;
          const desc = det.description || '';
          const type = det.type?.description || '';
          const spd  = pd.startSpeed;
          return (
            <div key={i} className="ab-pitch-row">
              <div className="ab-pitch-dot" style={{ background: col }}>{num}</div>
              <div className="ab-pitch-info">
                <span className="ab-pitch-result">{desc}</span>
                <span className="ab-pitch-detail">
                  {spd && <span className="ab-pitch-speed">{spd.toFixed(1)} mph</span>}
                  {type && <span className="ab-pitch-type">{type}</span>}
                </span>
              </div>
              <div className="ab-pitch-count">{cnt.balls ?? 0} - {cnt.strikes ?? 0}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Full-width immersive pitch view ────────────────────
   Coordinate system (matches MLB API):
     pX=0 = plate center, pX positive = catcher's right
     pZ=0 = ground, pZ positive = higher

   SVG viewBox "0 0 360 440":
     Displayed pX: -3 to +3 ft    (60 px/ft, center=180)
     Displayed pZ:  0 to  7.3 ft  (60 px/ft, 0 = y 440)

   svgX(pX) = 180 + pX * 60
   svgY(pZ) = 440 - pZ * 60
──────────────────────────────────────────────────────── */
const SX = 60;  // px per foot
const CX = 180; // SVG x at pX=0
const BY = 440; // SVG y at pZ=0

function svgX(pX) { return CX + pX * SX; }
function svgY(pZ) { return BY - pZ * SX; }

// Home plate pentagon (centre at svgY(0.18))
const platePts = (() => {
  const cy = svgY(0.18), hw = 0.7083 * SX;
  return [[CX-hw,cy-10],[CX+hw,cy-10],[CX+hw,cy+2],[CX,cy+12],[CX-hw,cy+2]]
    .map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
})();

// Parse a hex team color and return a safe CSS color string for SVG use
function teamGlowColor(hex, opacity) {
  if (!hex) return `rgba(26,74,34,${opacity})`; // fallback green
  const c = hex.startsWith('#') ? hex : `#${hex}`;
  // Use adaptColorForDarkBg to ensure the color is visible
  const [r, g, b] = c.slice(1).match(/.{2}/g).map((h) => parseInt(h, 16));
  // Boost towards a readable brightness for glow effect
  const maxC = Math.max(r, g, b);
  const scale = maxC < 60 ? 2.5 : maxC < 120 ? 1.6 : 1;
  const rr = Math.min(255, Math.round(r * scale));
  const gg = Math.min(255, Math.round(g * scale));
  const bb = Math.min(255, Math.round(b * scale));
  return `rgba(${rr},${gg},${bb},${opacity})`;
}

function MlbPitchView({ pitches, lastPitch, szTop, szBot, matchup, count, situation, venueId, teamColor, teamAltColor }) {

  // Zone bounds in SVG coords
  const zL = svgX(-0.83), zR = svgX(0.83);
  const zT = svgY(szTop),  zB = svgY(szBot);
  const zW = zR - zL, zH = zB - zT;

  // 3x3 grid dividers
  const c1 = zL + zW/3, c2 = zL + zW*2/3;
  const r1 = zT + zH/3, r2 = zT + zH*2/3;

  const lastCoords = lastPitch?.pitchData?.coordinates;
  const lastColor  = resultColor(lastPitch?.details);

  return (
    <div className="mlb-pitch-view">

      <div className="mlb-pv-batter">
          <svg viewBox="0 120 360 310" className="mlb-pv-svg" preserveAspectRatio="xMidYMid meet">
            <defs>
              {/* Field background gradient */}
              <linearGradient id="pvBg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="#050c0a"/>
                <stop offset="30%" stopColor="#071610"/>
                <stop offset="65%" stopColor="#0a1f0e"/>
                <stop offset="85%" stopColor="#12220a"/>
                <stop offset="100%" stopColor="#1c1506"/>
              </linearGradient>
              {/* Field glow — tinted with home team's primary color */}
              <radialGradient id="pvGrass" cx="50%" cy="35%" r="55%">
                <stop offset="0%"   stopColor={teamGlowColor(teamColor, 0.55)}/>
                <stop offset="60%"  stopColor={teamGlowColor(teamColor, 0.2)}/>
                <stop offset="100%" stopColor="#050c0a" stopOpacity="0"/>
              </radialGradient>
              {/* Secondary color accent near plate (alt color or slightly different tint) */}
              <radialGradient id="pvDirt" cx="50%" cy="100%" r="60%">
                <stop offset="0%"   stopColor={teamGlowColor(teamAltColor || teamColor, 0.35)}/>
                <stop offset="100%" stopColor="#1c1506" stopOpacity="0"/>
              </radialGradient>
              {/* Pitch tunnel glow */}
              <linearGradient id="pvTunnel" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#2563eb" stopOpacity="0"/>
                <stop offset="60%"  stopColor="#3b82f6" stopOpacity="0.18"/>
                <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.06"/>
              </linearGradient>
              {/* Last-pitch trail */}
              <linearGradient id="trailGrad" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
                <stop offset="0%"  stopColor={lastColor} stopOpacity="0"/>
                <stop offset="70%" stopColor={lastColor} stopOpacity="0.55"/>
                <stop offset="100%" stopColor={lastColor} stopOpacity="0.2"/>
              </linearGradient>
              {/* Dot glow filter */}
              <filter id="pvGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            {/* ── Backgrounds ── */}
            {/* Dark base */}
            <rect x="0" y="0" width="360" height="440" fill="url(#pvBg)"/>

            {/* Venue photo — ESPN CDN, stadium day image */}
            {venueId && (
              <image
                href={`https://a.espncdn.com/i/venues/mlb/day/${venueId}.jpg`}
                x="0" y="0" width="360" height="440"
                preserveAspectRatio="xMidYMid slice"
                opacity="0.22"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}

            {/* Atmospheric overlays on top of venue photo */}
            <ellipse cx="180" cy="170" rx="220" ry="140" fill="url(#pvGrass)"/>
            <ellipse cx="180" cy="440" rx="210" ry="90"  fill="url(#pvDirt)"/>
            {/* Dark vignette edges so venue photo blends */}
            <defs>
              <radialGradient id="pvVignette" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="transparent"/>
                <stop offset="100%" stopColor="rgba(4,9,12,0.7)"/>
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="360" height="440" fill="url(#pvVignette)"/>

            {/* Faint infield arc lines for depth cue */}
            {[55, 90, 130].map((r, i) => (
              <ellipse key={i} cx="180" cy="500" rx={r} ry={r * 0.28}
                fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="0.8"/>
            ))}

            {/* Pitch tunnel cone */}
            <path d={`M${svgX(-0.3)},0 L${svgX(0.3)},0 L${svgX(1.6)},440 L${svgX(-1.6)},440 Z`}
              fill="url(#pvTunnel)"/>

            {/* ── Last pitch trail ── */}
            {lastCoords?.pX != null && (
              <line
                x1={svgX(lastCoords.pX * 0.25)} y1="0"
                x2={svgX(lastCoords.pX)}         y2={svgY(lastCoords.pZ)}
                stroke="url(#trailGrad)" strokeWidth="14" strokeLinecap="round"/>
            )}

            {/* ── Strike zone (accurate 17in wide) ── */}
            {/* Zone fill */}
            <rect x={zL} y={zT} width={zW} height={zH}
              fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8"/>
            {/* 3×3 grid */}
            {[c1,c2].map((x,i)=>(
              <line key={`c${i}`} x1={x} y1={zT} x2={x} y2={zB}
                stroke="rgba(255,255,255,0.35)" strokeWidth="0.9"/>
            ))}
            {[r1,r2].map((y,i)=>(
              <line key={`r${i}`} x1={zL} y1={y} x2={zR} y2={y}
                stroke="rgba(255,255,255,0.35)" strokeWidth="0.9"/>
            ))}

            {/* Zone label */}
            <text x={zL - 4} y={zT - 5} fontSize="9" fill="rgba(255,255,255,0.4)"
              textAnchor="end" fontFamily="monospace">SZ</text>

            {/* ── Home plate ── */}
            <polygon points={platePts} fill="rgba(255,255,255,0.88)"/>

            {/* ── Pitches (oldest first → newest on top) ── */}
            {pitches.map((p, i) => {
              const c = p.pitchData?.coordinates;
              if (c?.pX == null || c?.pZ == null) return null;
              const cx = svgX(c.pX), cy = svgY(c.pZ);
              const col = resultColor(p.details);
              const isLast = i === pitches.length - 1;
              const r = isLast ? 14 : 13;
              return (
                <g key={i} filter={isLast ? 'url(#pvGlow)' : undefined}>
                  {isLast && (
                    <circle cx={cx} cy={cy} r={r+5}
                      fill="none" stroke={col} strokeWidth="1.5" opacity="0.35"/>
                  )}
                  <circle cx={cx} cy={cy} r={r} fill={col}
                    stroke="rgba(0,0,0,0.55)" strokeWidth="1.5"/>
                  <text x={cx} y={cy+5} textAnchor="middle"
                    fontSize="11" fontWeight="900" fill="#fff"
                    style={{fontFamily:'system-ui,sans-serif'}}>
                    {i + 1}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* ── Last pitch info bar ── */}
          {lastPitch && (() => {
            const code  = lastPitch.details?.type?.code || '';
            const desc  = lastPitch.details?.type?.description || '';
            const speed = lastPitch.pitchData?.startSpeed;
            const result = lastPitch.details?.description || '';
            const col   = resultColor(lastPitch.details);
            return (
              <div className="mlb-pv-infobar">
                <div className="mlb-pv-dot-num" style={{background:col}}>
                  {pitches.length}
                </div>
                <div className="mlb-pv-infobar-text">
                  <div className="mlb-pv-result">{result}</div>
                  <div className="mlb-pv-pitch-line">
                    {speed && <span className="mlb-pv-speed">{speed.toFixed(1)} mph</span>}
                    <span className="mlb-pv-type">{pitchLabel(code, desc)}</span>
                  </div>
                </div>
                <div className="mlb-pv-count">
                  <span style={{color:'#4ade80'}}>{count.balls??0}</span>
                  <span className="mlb-pv-count-sep">-</span>
                  <span style={{color:'#f87171'}}>{count.strikes??0}</span>
                  <span className="mlb-pv-count-sep"> · </span>
                  <span style={{color:'#fb923c'}}>{count.outs??0}</span>
                  <span className="mlb-pv-count-label"> out{(count.outs??0)!==1?'s':''}</span>
                </div>
              </div>
            );
          })()}

          {/* Pitch result legend */}
          <div className="mlb-pv-legend">
            {[['#22c55e','Ball'],['#ef4444','Strike'],['#9333ea','In Play'],['#f59e0b','Foul']].map(([c,l])=>(
              <div key={l} className="mlb-pv-legend-item">
                <span className="mlb-pv-legend-dot" style={{background:c}}/>
                <span>{l}</span>
              </div>
            ))}
          </div>
        </div>

    </div>
  );
}

/* ─── MLB Stats API helpers (lineups) ───────────────────────────── */
const STATSAPI = 'https://statsapi.mlb.com/api/v1';

async function mlbFetch(url, signal) {
  const res = await fetch(url, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getMlbGameForDate(dateStr, awayName, homeName) {
  const data = await mlbFetch(
    `${STATSAPI}/schedule?sportId=1&date=${dateStr}&hydrate=lineups,teams`
  );
  const games = data.dates?.[0]?.games || [];
  // Match by team display names (exact match first, then partial)
  const norm = (s) => (s || '').toLowerCase();
  const match = games.find((g) => {
    const a = norm(g.teams?.away?.team?.name);
    const h = norm(g.teams?.home?.team?.name);
    return a === norm(awayName) && h === norm(homeName);
  }) || games.find((g) => {
    const a = norm(g.teams?.away?.team?.name);
    const h = norm(g.teams?.home?.team?.name);
    return norm(awayName).includes(a.split(' ').pop()) && norm(homeName).includes(h.split(' ').pop());
  });
  return match || null;
}

async function getProjectedLineup(teamId, signal) {
  const teamNum = Number(teamId);
  const end   = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(); start.setDate(start.getDate() - 21);
  const fmt   = (d) => d.toISOString().slice(0, 10);

  const schedule = await mlbFetch(
    `${STATSAPI}/schedule?sportId=1&teamId=${teamId}&startDate=${fmt(start)}&endDate=${fmt(end)}&gameType=R`,
    signal
  );

  for (const dateObj of [...(schedule.dates || [])].reverse()) {
    for (const game of [...(dateObj.games || [])].reverse()) {
      if (game.status?.abstractGameState !== 'Final') continue;
      const homeId = Number(game.teams?.home?.team?.id);
      const awayId = Number(game.teams?.away?.team?.id);
      if (homeId !== teamNum && awayId !== teamNum) continue;
      try {
        const bs = await mlbFetch(`${STATSAPI}/game/${game.gamePk}/boxscore`, signal);
        const homeTeam = bs.teams?.home;
        const awayTeam = bs.teams?.away;
        const teamBs   = Number(homeTeam?.team?.id) === teamNum ? homeTeam : awayTeam;
        if (!teamBs || Number(teamBs.team?.id) !== teamNum) continue;
        const battingOrder = teamBs.battingOrder || [];
        const playerMap    = teamBs.players || {};
        if (battingOrder.length === 0) continue;
        const players = battingOrder.map((id) => {
          const entry = playerMap[`ID${id}`];
          return entry ? {
            id:              entry.person?.id,
            fullName:        entry.person?.fullName || '',
            useName:         entry.person?.useName  || '',
            primaryPosition: entry.position || {},
            batSide:         entry.person?.batSide  || {},
          } : null;
        }).filter(Boolean);
        if (players.length > 0) return { players, confirmed: false, fromDate: dateObj.date };
      } catch (e) {
        if (e.name === 'AbortError') throw e;
      }
    }
  }
  return { players: [], confirmed: false, fromDate: null };
}

/* ─── helpers ──────────────────────────────────────── */
function teamLogo(team) { return team?.logo || team?.logos?.[0]?.href || null; }

function darkUrl(url) {
  if (!url) return url;
  return url.replace(/(\/i\/teamlogos\/[^/]+\/)(\d+)(\/)/, '$1$2-dark$3');
}
function LogoImg({ team, url, className, style }) {
  const dark = team ? getTeamLogo(team) : darkUrl(url);
  const orig = team ? getTeamLogoFallback(team) : url;
  if (!dark && !orig) return null;
  return (
    <img src={dark || orig} onError={(e) => { if (orig && e.target.src !== orig) { e.target.onerror = null; e.target.src = orig; } }}
      alt="" className={className} style={style} />
  );
}
function getScore(c) {
  const s = c?.score;
  if (s == null) return null;
  return typeof s === 'object' ? s.displayValue : String(s);
}
function buildRosterMap(rosters = []) {
  const map = {};
  rosters.forEach((r) => (r.roster || []).forEach((e) => { const a = e.athlete||{}; if (a.id) map[String(a.id)] = {...a,jersey:e.jersey}; }));
  return map;
}

/* ─── Base Diamond ──────────────────────────────────── */
function BaseDiamond({ onFirst, onSecond, onThird, size = 44 }) {
  return (
    <svg viewBox="0 0 44 44" style={{ width: size, height: size, flexShrink: 0 }}>
      <rect x="16" y="2"  width="12" height="12" rx="1.5" className={`tr-base ${onSecond ? 'tr-base-on' : ''}`} transform="rotate(45 22 8)" />
      <rect x="2"  y="16" width="12" height="12" rx="1.5" className={`tr-base ${onThird  ? 'tr-base-on' : ''}`} transform="rotate(45 8 22)" />
      <rect x="30" y="16" width="12" height="12" rx="1.5" className={`tr-base ${onFirst  ? 'tr-base-on' : ''}`} transform="rotate(45 36 22)" />
      <rect x="16" y="30" width="12" height="12" rx="1.5" className="tr-base" transform="rotate(45 22 36)" />
    </svg>
  );
}

/* ─── GAME LEADERS ─────────────────────────────────── */
const BATTING_CATS  = ['Batting Average', 'Home Runs', 'Runs Batted In'];
const PITCHING_CATS = ['Earned Run Average', 'Wins', 'Strikeouts'];

// Additional stats to show per leader category
const LEADER_EXTRA = {
  'Batting Average':   ['OBP', 'SLG'],
  'Home Runs':         ['AVG', 'RBI'],
  'Runs Batted In':    ['HR', 'AVG'],
  'Earned Run Average':['WHIP'],
  'Wins':              ['ERA'],
  'Strikeouts':        ['ERA'],
};
const CAT_LABEL = {
  'Batting Average': 'AVG', 'Home Runs': 'HR', 'Runs Batted In': 'RBI',
  'Earned Run Average': 'ERA', 'Wins': 'W', 'Strikeouts': 'K',
};

function GameLeaders({ leaders, away, home }) {
  const [tab, setTab] = useState('batting');
  if (!leaders?.length) return null;

  // Build map: teamId → categories
  const byTeam = {};
  leaders.forEach((tl) => { byTeam[tl.team?.id] = tl.leaders || []; });

  const awayLeaders = byTeam[away?.team?.id] || [];
  const homeLeaders = byTeam[home?.team?.id] || [];

  const cats = tab === 'batting' ? BATTING_CATS : PITCHING_CATS;

  const getLeader = (teamLeaders, catName) => {
    const cat = teamLeaders.find((c) => c.displayName === catName);
    return cat?.leaders?.[0] || null;
  };

  const navigate = useNavigate();

  return (
    <div className="preview-card">
      <div className="preview-leaders-tabs">
        <button
          className={`preview-leaders-tab ${tab === 'batting' ? 'preview-leaders-tab-active' : ''}`}
          onClick={() => setTab('batting')}
        >
          Batting Leaders
        </button>
        <button
          className={`preview-leaders-tab ${tab === 'pitching' ? 'preview-leaders-tab-active' : ''}`}
          onClick={() => setTab('pitching')}
        >
          Pitching Leaders
        </button>
      </div>

      {/* Team logo header */}
      <div className="preview-leaders-team-header">
        <div className="preview-leaders-th-side">
          <LogoImg team={away?.team} className="preview-team-logo" />
          <span className="preview-leaders-th-abbr">{away?.team?.abbreviation}</span>
        </div>
        <div className="preview-leaders-th-side preview-leaders-th-right">
          <span className="preview-leaders-th-abbr">{home?.team?.abbreviation}</span>
          <LogoImg team={home?.team} className="preview-team-logo" />
        </div>
      </div>

      {cats.map((catName) => {
        const awayL = getLeader(awayLeaders, catName);
        const homeL = getLeader(homeLeaders, catName);
        const extras = LEADER_EXTRA[catName] || [];
        const catLabel = CAT_LABEL[catName] || catName;

        const getStats = (leader) => {
          if (!leader) return {};
          const map = {};
          (leader.statistics || []).forEach((s) => { map[s.abbreviation] = s.displayValue; });
          return map;
        };

        return (
          <div key={catName} className="preview-leaders-cat">
            <div className="preview-leaders-cat-label">{catName}</div>
            <div className="preview-leaders-matchup">
              {/* Away leader — left side: text right-aligned, avatar on right (center) */}
              <div
                className={`preview-leaders-player${awayL?.athlete?.id ? ' preview-leaders-player-link' : ''}`}
                onClick={() => awayL?.athlete?.id && navigate(`/player/mlb/${awayL.athlete.id}`)}
              >
                <div className="preview-leaders-stat-col preview-leaders-stat-col-left">
                  <span className="preview-leaders-name">{awayL?.athlete?.shortName || awayL?.athlete?.displayName || '—'}</span>
                  <div className="preview-leaders-stats">
                    <span className="preview-leaders-val">{awayL?.displayValue ?? '—'}</span>
                    <span className="preview-leaders-val-label">{catLabel}</span>
                    {extras.map((k) => {
                      const v = getStats(awayL)[k];
                      return v ? <span key={k} className="preview-leaders-extra">{v} {k}</span> : null;
                    })}
                  </div>
                </div>
                {awayL?.athlete?.headshot?.href
                  ? <img src={awayL.athlete.headshot.href} alt="" className="preview-leaders-avatar" />
                  : <div className="preview-leaders-avatar preview-leaders-avatar-empty" />
                }
              </div>

              {/* Home leader — right side */}
              <div
                className={`preview-leaders-player preview-leaders-player-right${homeL?.athlete?.id ? ' preview-leaders-player-link' : ''}`}
                onClick={() => homeL?.athlete?.id && navigate(`/player/mlb/${homeL.athlete.id}`)}
              >
                {homeL?.athlete?.headshot?.href
                  ? <img src={homeL.athlete.headshot.href} alt="" className="preview-leaders-avatar" />
                  : <div className="preview-leaders-avatar preview-leaders-avatar-empty" />
                }
                <div className="preview-leaders-stat-col preview-leaders-stat-col-right">
                  <span className="preview-leaders-name">{homeL?.athlete?.shortName || homeL?.athlete?.displayName || '—'}</span>
                  <div className="preview-leaders-stats preview-leaders-stats-right">
                    <span className="preview-leaders-val">{homeL?.displayValue ?? '—'}</span>
                    <span className="preview-leaders-val-label">{catLabel}</span>
                    {extras.map((k) => {
                      const v = getStats(homeL)[k];
                      return v ? <span key={k} className="preview-leaders-extra">{v} {k}</span> : null;
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── BATTING LINEUPS ────────────────────────────────── */
function BattingLineups({ lineups, lineupLoading, away, home }) {
  const navigate = useNavigate();

  const renderSide = (side) => {
    const isHome = side === 'home';
    const team = isHome ? home : away;
    const lu = isHome ? lineups.home : lineups.away;
    const loading = isHome ? lineupLoading.home : lineupLoading.away;

    return (
      <div className="preview-lineup-side">
        <div className="preview-lineup-side-header">
          <LogoImg team={team?.team} className="preview-team-logo" />
          <div className="preview-lineup-side-info">
            <span className="preview-lineup-team-abbr">{team?.team?.abbreviation}</span>
            {(loading || lu === null)
              ? <span className="preview-lineup-badge preview-lineup-badge-loading">Loading…</span>
              : lu.confirmed
                ? <span className="preview-lineup-badge preview-lineup-badge-confirmed">✓ Confirmed</span>
                : lu.fromDate
                  ? <span className="preview-lineup-badge preview-lineup-badge-projected">⟳ Projected</span>
                  : null
            }
          </div>
        </div>

        {/* null = not yet fetched, treat same as loading */}
        {(loading || lu === null)
          ? null
          : (!lu.players?.length)
            ? <div className="preview-lineup-empty">Lineup not available</div>
            : lu.players.map((p, i) => {
            const pos = p.primaryPosition?.abbreviation || p.primaryPosition?.name?.charAt(0) || '';
            const name = p.useName && p.lastName
              ? `${p.useName} ${p.lastName}`
              : p.fullName || '';
            return (
              <div
                key={p.id || i}
                className={`preview-lineup-row${p.id ? ' preview-lineup-row-link' : ''}`}
                onClick={() => p.id && navigate(`/player/mlb/${p.id}`)}
              >
                <span className="preview-lineup-num">{i + 1}</span>
                <span className="preview-lineup-name">{name}</span>
                <span className="preview-lineup-pos">{pos}</span>
              </div>
            );
          })
        }
      </div>
    );
  };

  return (
    <div className="preview-card">
      <div className="preview-card-title">Batting Lineups</div>
      <div className="preview-lineups-grid">
        {renderSide('away')}
        {renderSide('home')}
      </div>
    </div>
  );
}

/* ─── PREVIEW TAB ──────────────────────────────────── */
const WEATHER_ICONS = { '1':'☀️','2':'⛅','3':'🌥','4':'☁️','5':'🌧','6':'🌦','7':'🌩','8':'❄️','11':'🌫','12':'🌧','13':'🌨','14':'⛈','15':'⛈','16':'❄️','17':'⛈','18':'🌧','19':'🌨','20':'🌨','21':'🌨','22':'❄️','23':'🌬','25':'🌧','26':'🌧','29':'🌧','30':'🌡️','31':'🧊','32':'☀️','33':'🌙','34':'⛅','35':'⛅','36':'🌥','37':'🌧','38':'⛈','39':'🌧','40':'🌧','41':'❄️','42':'❄️','43':'❄️','44':'⛅' };

function PreviewTab({ data, competitors, status, sport, lineups, lineupLoading }) {
  const gameInfo = data?.gameInfo || {};
  const venue = gameInfo.venue?.fullName;
  const wx = gameInfo.weather;
  const predictor = data?.predictor;
  const lastFiveGames = data?.lastFiveGames || [];
  const leaders = data?.leaders || [];

  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];

  return (
    <div className="preview-wrap">
      {/* Game info */}
      {(venue || wx) && (
        <div className="preview-card">
          {venue && <div className="preview-info-row"><span className="preview-label">🏟 Venue</span><span>{venue}</span></div>}
          {wx?.temperature && (
            <div className="preview-info-row">
              <span className="preview-label">{WEATHER_ICONS[wx.conditionId] || '🌤'} Weather</span>
              <span>{wx.temperature}°F{wx.gust ? `, ${wx.gust}mph wind` : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Win probability */}
      {predictor?.homeTeam && (
        <div className="preview-card">
          <div className="preview-card-title">Win Probability</div>
          <div className="preview-prob-row">
            <div className="preview-prob-team">
              <LogoImg team={away?.team} className="preview-team-logo" />
              <span>{away?.team?.abbreviation}</span>
              <span className="preview-prob-pct">{predictor.awayTeam?.gameProjection}%</span>
            </div>
            <div className="preview-prob-bar">
              <div className="preview-prob-fill-away" style={{ width: `${predictor.awayTeam?.gameProjection}%` }} />
              <div className="preview-prob-fill-home" style={{ width: `${predictor.homeTeam?.gameProjection}%` }} />
            </div>
            <div className="preview-prob-team preview-prob-team-right">
              <span className="preview-prob-pct">{predictor.homeTeam?.gameProjection}%</span>
              <span>{home?.team?.abbreviation}</span>
              <LogoImg team={home?.team} className="preview-team-logo" />
            </div>
          </div>
        </div>
      )}

      {/* MLB: Starting pitchers */}
      {sport === 'mlb' && (
        <div className="preview-card">
          <div className="preview-card-title">Starting Pitchers</div>
          <div className="preview-pitchers">
            {[away, home].filter(Boolean).map((c) => {
              const probable = c.probables?.[0];
              if (!probable) return null;
              const ath = probable.athlete;
              const stats = probable.statistics?.splits?.categories || [];
              const statMap = {};
              stats.forEach((s) => { statMap[s.abbreviation] = s.displayValue; });
              return (
                <div key={c.team?.id} className="preview-pitcher">
                  <div className="preview-pitcher-header">
                    <LogoImg team={c.team} className="preview-pitcher-team" />
                    <span className="preview-pitcher-team-abbr">{c.team?.abbreviation}</span>
                    <span className="preview-pitcher-ha">{c.homeAway === 'home' ? 'Home' : 'Away'}</span>
                  </div>
                  <div className="preview-pitcher-row">
                    {ath?.headshot?.href && <img src={ath.headshot.href} alt="" className="preview-pitcher-avatar" />}
                    <div className="preview-pitcher-info">
                      <div className="preview-pitcher-name">{ath?.fullName}</div>
                      <div className="preview-pitcher-sub">#{ath?.jersey} · {ath?.throws?.displayValue}-HP</div>
                      <div className="preview-pitcher-stats">
                        {statMap['W'] && statMap['L'] && <span className="preview-stat-pill">{statMap['W']}-{statMap['L']}</span>}
                        {(statMap['FI'] || statMap['PI']) && <span className="preview-stat-pill">{statMap['FI'] || 0}.{statMap['PI'] || 0} IP</span>}
                        {statMap['ERA'] && <span className="preview-stat-pill">{statMap['ERA']} ERA</span>}
                        {statMap['WHIP'] && <span className="preview-stat-pill">{statMap['WHIP']} WHIP</span>}
                        {statMap['K'] && <span className="preview-stat-pill">{statMap['K']} K</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MLB: Season leaders */}
      {sport === 'mlb' && leaders.length > 0 && (
        <GameLeaders leaders={leaders} away={away} home={home} />
      )}

      {/* MLB: Batting lineups */}
      {sport === 'mlb' && (
        <BattingLineups lineups={lineups} lineupLoading={lineupLoading} away={away} home={home} />
      )}

      {/* Last 5 games */}
      {lastFiveGames.length > 0 && (
        <div className="preview-card">
          <div className="preview-card-title">Recent Form</div>
          <div className="preview-last5">
            {lastFiveGames.map((teamData) => {
              const teamInfo = teamData.team;
              const events = (teamData.events || []).slice(-5);
              return (
                <div key={teamInfo?.id} className="preview-last5-team">
                  <div className="preview-last5-header">
                    {teamInfo?.id === away?.team?.id
                      ? <LogoImg team={away?.team} className="preview-team-logo" />
                      : <LogoImg team={home?.team} className="preview-team-logo" />}
                    <span className="preview-last5-abbr">{teamInfo?.abbreviation}</span>
                  </div>
                  <div className="preview-last5-games">
                    {events.map((e, i) => {
                      const won = e.gameResult === 'W';
                      return (
                        <div key={i} className={`preview-last5-dot ${won ? 'preview-dot-w' : 'preview-dot-l'}`} title={`${e.atVs} ${e.opponent?.abbreviation}: ${e.score}`}>
                          {won ? 'W' : 'L'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── GAMECAST TAB ──────────────────────────────────── */
function CountDots({ filled, total, color }) {
  return (
    <div className="bs-count-dots">
      {Array.from({length:total}).map((_,i) => (
        <span key={i} className={`bs-count-dot ${i < filled ? `bs-dot-${color}` : ''}`} />
      ))}
    </div>
  );
}

function MlbGamecast({ data, rosters, situation, competitors, status, mlbGamePk }) {
  const isLive = status?.type?.state === 'in';
  const feed = useMlbLiveFeed(mlbGamePk, isLive);
  const {
    pitches, lastPitch, szTop, szBot,
    matchup: mlbMatchup, count: mlbCount,
    onFirst, onSecond, onThird, outs,
    recentAtBats, currentResult, currentAbout,
    shortDetail: mlbShortDetail, inningDisplay,
    pitcherGameStats, batterGameStats, batterPosition,
    onDeck, inHole,
  } = feed;

  const balls   = mlbCount.balls   ?? situation?.balls   ?? 0;
  const strikes = mlbCount.strikes ?? situation?.strikes ?? 0;
  const outsVal = outs              ?? situation?.outs    ?? 0;
  const base1   = feed.raw ? onFirst  : !!situation?.onFirst;
  const base2   = feed.raw ? onSecond : !!situation?.onSecond;
  const base3   = feed.raw ? onThird  : !!situation?.onThird;

  const batterId  = mlbMatchup?.batter?.id;
  const pitcherId = mlbMatchup?.pitcher?.id;
  const batterPhoto  = mlbHeadshot(batterId);
  const pitcherPhoto = mlbHeadshot(pitcherId);
  // Last name only for compact display
  const lastName = (full) => full?.split(' ').slice(-1)[0] || full || '';
  const batterLastName  = lastName(mlbMatchup?.batter?.fullName);
  const pitcherLastName = lastName(mlbMatchup?.pitcher?.fullName);

  const inningStr = inningDisplay || mlbShortDetail || status?.type?.shortDetail || '';

  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];

  // Build the at-bat log: current at-bat (if has pitches) + recent completed
  const currentAtBatForLog = (pitches.length > 0) ? {
    result: currentResult,
    matchup: mlbMatchup,
    playEvents: pitches.map((p) => ({ ...p, type: 'pitch' })),
    count: mlbCount,
    about: currentAbout,
  } : null;

  const scoringPlays = (data?.plays || []).filter((p) => p.scoringPlay).slice(-5).reverse();

  return (
    <div className="gamecast-wrap">
      {isLive && (
        <>
          {/* Inning bar */}
          <div className="gc-inning-bar">
            <span className={`gc-half ${inningStr.startsWith('▼') ? 'gc-bot' : 'gc-top'}`}>{inningStr}</span>
          </div>

          {/* Pitch view */}
          <MlbPitchView
            pitches={pitches}
            lastPitch={lastPitch}
            szTop={szTop}
            szBot={szBot}
            matchup={mlbMatchup}
            count={mlbCount}
            situation={{ onFirst: base1, onSecond: base2, onThird: base3, balls, strikes, outs: outsVal }}
            venueId={home?.team?.id}
            teamColor={home?.team?.color}
            teamAltColor={home?.team?.alternateColor}
          />

          {/* MLB-style pitcher | diamond+count | batter row — vertical stacking */}
          <div className="gc-matchup-row">
            {/* Pitcher — stacked: photo → name/hand → stats */}
            <div className="gc-matchup-player">
              {pitcherPhoto && (
                <img src={pitcherPhoto} alt="" className="gc-matchup-photo"
                  onError={(e) => { e.target.style.display='none'; }} />
              )}
              <div className="gc-matchup-name">
                {pitcherLastName}
                {feed.raw?.liveData?.linescore?.defense?.pitcher?.pitchHand?.code &&
                  <span className="gc-matchup-hand"> {feed.raw.liveData.linescore.defense.pitcher.pitchHand.code}HP</span>}
              </div>
              {(pitcherGameStats.numberOfPitches != null) && (
                <div className="gc-matchup-stats">
                  {pitcherGameStats.numberOfPitches}P
                  {pitcherGameStats.inningsPitched && ` · ${pitcherGameStats.inningsPitched} IP`}
                  {pitcherGameStats.strikeOuts != null && `, ${pitcherGameStats.strikeOuts}K`}
                  {pitcherGameStats.earnedRuns != null && `, ${pitcherGameStats.earnedRuns}ER`}
                </div>
              )}
            </div>

            {/* Diamond + B/S/O */}
            <div className="gc-matchup-center">
              <BaseDiamond onFirst={base1} onSecond={base2} onThird={base3} size={44} />
              <div className="gc-count-col gc-count-col-sm">
                <div className="gc-count-row"><CountDots filled={balls}   total={4} color="green" /></div>
                <div className="gc-count-row"><CountDots filled={strikes} total={3} color="yellow" /></div>
                <div className="gc-count-row"><CountDots filled={outsVal} total={3} color="red" /></div>
              </div>
            </div>

            {/* Batter — stacked: photo → name/pos → stats */}
            <div className="gc-matchup-player gc-matchup-player-right">
              {batterPhoto && (
                <img src={batterPhoto} alt="" className="gc-matchup-photo"
                  onError={(e) => { e.target.style.display='none'; }} />
              )}
              <div className="gc-matchup-name">
                {batterLastName}
                {batterPosition && <span className="gc-matchup-pos"> {batterPosition}</span>}
              </div>
              {(batterGameStats.atBats != null) && (
                <div className="gc-matchup-stats">
                  {batterGameStats.hits ?? 0}-{batterGameStats.atBats}
                  {batterGameStats.strikeOuts != null && ` · ${batterGameStats.strikeOuts}K`}
                </div>
              )}
            </div>
          </div>

          {/* On deck / In the hole */}
          {(onDeck || inHole) && (
            <div className="gc-on-deck">
              {onDeck && <span>On deck: {lastName(onDeck.fullName)}</span>}
              {onDeck && inHole && <span className="gc-on-deck-sep"> · </span>}
              {inHole && <span>In the hole: {lastName(inHole.fullName)}</span>}
            </div>
          )}

          {/* At-Bat Pitch Log (MLB) */}
          {(currentAtBatForLog || recentAtBats.length > 0) && (
            <div className="ab-log-section">
              <div className="ab-log-label">RECENT PLAYS</div>
              {currentAtBatForLog && <AtBatEntry atBat={currentAtBatForLog} isCurrent />}
              {recentAtBats.map((ab, i) => (
                <AtBatEntry key={i} atBat={ab} />
              ))}
            </div>
          )}
        </>
      )}

      {!isLive && scoringPlays.length > 0 && (
        <div className="gc-plays-section">
          <div className="gc-section-label">Scoring Summary</div>
          {scoringPlays.map((p) => (
            <div key={p.id} className="gc-play-row gc-play-scoring">
              <div className="gc-play-period">{p.period?.displayValue}</div>
              <div className="gc-play-text">{p.text}</div>
              <div className="gc-play-score">{p.awayScore}-{p.homeScore}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GenericGamecast({ data, situation, competitors, status, sport }) {
  const plays = data?.plays || [];
  const recentPlays = plays.slice(-8).reverse();
  const scoringPlays = plays.filter((p) => p.scoringPlay).slice(-8).reverse();
  const isLive = status?.type?.state === 'in';
  const shortDetail = status?.type?.shortDetail || '';

  return (
    <div className="gamecast-wrap">
      {isLive && (
        <div className="gc-inning-bar">
          <span className="gc-half">{shortDetail}</span>
          {situation?.balls !== undefined && (
            <span className="gc-count-text">
              {situation.balls}-{situation.strikes} · {situation.outs} out{situation.outs !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {recentPlays.length > 0 && (
        <div className="gc-plays-section">
          <div className="gc-section-label">{isLive ? 'Recent Plays' : 'Scoring Summary'}</div>
          {(isLive ? recentPlays : scoringPlays).slice(0, 8).map((p) => (
            <div key={p.id} className={`gc-play-row ${p.scoringPlay ? 'gc-play-scoring' : ''}`}>
              <div className="gc-play-period">{p.period?.displayValue}</div>
              <div className="gc-play-text">{p.text}</div>
              {p.scoringPlay && <div className="gc-play-score">{p.awayScore}-{p.homeScore}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── PLAY BY PLAY TAB ──────────────────────────────── */
function PlayByPlay({ data, competitors, sport }) {
  const [showScoring, setShowScoring] = useState(false);
  const plays = data?.plays || [];

  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];

  // Group plays by period/half-inning
  const groups = [];
  let current = null;
  const filtered = showScoring ? plays.filter((p) => p.scoringPlay) : plays;

  for (const p of filtered) {
    const t = p.type?.type || '';
    const key = p.period?.displayValue || '';

    // Start new group on new inning/period
    if (t === 'start-inning' || t === 'start-period' || !current || current.key !== key) {
      if (current) groups.push(current);
      const teamId = p.team?.id;
      const teamData = competitors?.find((c) => c.team?.id === teamId);
      current = {
        key,
        label: p.text || key,
        teamLogo: teamLogo(teamData?.team),
        teamName: teamData?.team?.shortDisplayName || teamData?.team?.abbreviation,
        plays: [],
        awayScore: p.awayScore,
        homeScore: p.homeScore,
      };
    } else if (t !== 'start-inning' && t !== 'start-period') {
      current.plays.push(p);
      current.awayScore = p.awayScore;
      current.homeScore = p.homeScore;
    }
  }
  if (current) groups.push(current);

  return (
    <div className="pbp-wrap">
      {/* Toggle */}
      <div className="pbp-toggle">
        <button className={`pbp-tog-btn ${!showScoring ? 'pbp-tog-active' : ''}`} onClick={() => setShowScoring(false)}>All Plays</button>
        <button className={`pbp-tog-btn ${showScoring ? 'pbp-tog-active' : ''}`} onClick={() => setShowScoring(true)}>Scoring Plays</button>
      </div>

      {plays.length === 0 && <div className="tp-loading">Play-by-play not available.</div>}

      {groups.slice().reverse().map((g, gi) => (
        <div key={gi} className="pbp-group">
          <div className="pbp-group-header">
            <LogoImg url={g.teamLogo} className="pbp-team-logo" />
            <span className="pbp-group-label">{g.label}</span>
            <span className="pbp-score">{away?.team?.abbreviation} {g.awayScore} · {home?.team?.abbreviation} {g.homeScore}</span>
          </div>
          {g.plays.filter((p) => p.text && p.type?.type !== 'end-inning').map((p) => (
            <div key={p.id} className={`pbp-play ${p.scoringPlay ? 'pbp-play-scoring' : ''}`}>
              <div className="pbp-play-icon">
                {p.scoringPlay ? '🔴' : p.type?.type?.includes('pitch') ? '⚾' : '·'}
              </div>
              <div className="pbp-play-text">{p.text}</div>
            </div>
          ))}
          {g.plays.length === 0 && <div className="pbp-play-text" style={{padding:'8px 12px',color:'var(--text2)'}}>No plays yet.</div>}
        </div>
      ))}
    </div>
  );
}

/* ─── BOX SCORE TAB (unchanged) ─────────────────────── */
const COLS = {
  mlb_batting:  ['AB','R','H','RBI','HR','BB','K','AVG','OBP','SLG'],
  mlb_pitching: ['IP','H','R','ER','BB','K','HR','ERA'],
  nba:          ['MIN','PTS','REB','AST','STL','BLK','FG','3PT','+/-'],
  nfl_passing:  ['C/ATT','YDS','TD','INT','RTG'],
  nfl_rushing:  ['CAR','YDS','AVG','TD'],
  nfl_receiving:['REC','YDS','AVG','TD'],
  nhl:          ['G','A','PTS','+/-','SOG','TOI'],
};
const HL = { mlb: ['H','HR','RBI','ERA'], nba: ['PTS','REB','AST'], nfl: ['YDS','TD'], nhl: ['G','A','PTS'] };

function getColKey(sport, type) {
  if (sport === 'mlb') return type === 'pitching' ? 'mlb_pitching' : 'mlb_batting';
  if (sport === 'nba') return 'nba';
  if (sport === 'nhl') return 'nhl';
  if (sport === 'nfl') {
    if (type?.includes('pass')) return 'nfl_passing';
    if (type?.includes('rush')) return 'nfl_rushing';
    return 'nfl_receiving';
  }
  return null;
}

function StatsTable({ statGroup, sport }) {
  const navigate = useNavigate();
  const labels   = statGroup.labels || [];
  const athletes = statGroup.athletes || [];
  const totals   = statGroup.totals || [];
  const type     = (statGroup.type || statGroup.name || '').toLowerCase();
  const isMlbBat = sport === 'mlb' && type !== 'pitching';
  const key  = getColKey(sport, type);
  const want = key ? COLS[key] : [];
  const cols = want.length
    ? want.map((w) => ({ label: w, index: labels.indexOf(w) })).filter((c) => c.index !== -1)
    : labels.map((l, i) => ({ label: l, index: i })).slice(0, 8);
  const hl = HL[sport] || [];
  if (!athletes.length) return null;

  return (
    <div className="bsp-table-wrap">
      <table className="bsp-table">
        <thead>
          <tr>
            <th className="bsp-th bsp-th-player">{type === 'pitching' ? 'PITCHERS' : 'HITTERS'}</th>
            {cols.map((c) => <th key={c.label} className="bsp-th">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {athletes.map((a, i) => {
            const player = a.athlete || {};
            const stats  = a.stats || [];
            const dnp    = a.didNotPlay || !stats.length;
            // MLB: indent substitute players (starter===false)
            const isSub  = isMlbBat && a.starter === false;
            return (
              <tr key={i} className={`bsp-tr ${dnp ? 'bsp-dnp' : ''} ${player.id ? 'bsp-tr-clickable' : ''} ${isSub ? 'bsp-tr-sub' : ''}`}
                onClick={() => player.id && navigate(`/player/${sport}/${player.id}`)}>
                <td className="bsp-td bsp-td-player">
                  <div className={`bsp-player-cell ${isSub ? 'bsp-player-sub' : ''}`}>
                    <div>
                      <span className="bsp-player-name">{player.shortName || player.displayName}</span>
                      <span className="bsp-player-pos"> {a.position?.abbreviation || ''}</span>
                    </div>
                  </div>
                </td>
                {dnp
                  ? <td className="bsp-td" colSpan={cols.length} style={{color:'var(--text2)',fontStyle:'italic'}}>DNP</td>
                  : cols.map((c) => (
                    <td key={c.label} className={`bsp-td ${hl.includes(c.label) ? 'bsp-hl' : ''}`}>
                      {stats[c.index] ?? '—'}
                    </td>
                  ))}
              </tr>
            );
          })}
          {totals.length > 0 && (
            <tr className="bsp-totals">
              <td className="bsp-td bsp-td-player bsp-totals-label">TEAM</td>
              {cols.map((c) => <td key={c.label} className="bsp-td">{totals[c.index] ?? ''}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ── MLB batting/fielding notes (2B, HR, RBI, DP, etc.) ──────────── */
function MLBGameNotes({ details }) {
  if (!details?.length) return null;
  const batting  = details.find((d) => d.name === 'battingDetails');
  const fielding = details.find((d) => d.name === 'fieldingDetails');
  const sections = [batting, fielding].filter(Boolean);
  if (!sections.length) return null;
  return (
    <div className="bsp-mlb-notes">
      {sections.map((section) => (
        <div key={section.name} className="bsp-notes-section">
          <div className="bsp-notes-heading">{section.displayName?.toUpperCase()}</div>
          {(section.stats || []).map((stat) => (
            <div key={stat.abbreviation} className="bsp-notes-row">
              <span className="bsp-notes-label">{stat.shortDisplayName || stat.abbreviation}:</span>
              <span className="bsp-notes-value">{stat.displayValue}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TeamStats({ group, sport, teamDetails }) {
  const team    = group?.team || {};
  const stats   = group?.statistics || [];
  const batting  = stats.find((s) => (s.type||s.name) === 'batting')  || stats[0];
  const pitching = stats.find((s) => (s.type||s.name) === 'pitching') || stats[1];
  return (
    <div className="bsp-team-stats">
      {batting && (<>
        <div className="bsp-stats-heading">
          <LogoImg team={team} style={{width:20,height:20,objectFit:'contain'}} />
          <span>{team.displayName} Hitting</span>
        </div>
        <StatsTable statGroup={batting} sport={sport} />
        {sport === 'mlb' && <MLBGameNotes details={teamDetails} />}
      </>)}
      {pitching && (<>
        <div className="bsp-stats-heading" style={{marginTop:16}}>
          <LogoImg team={team} style={{width:20,height:20,objectFit:'contain'}} />
          <span>{team.displayName} Pitching</span>
        </div>
        <StatsTable statGroup={pitching} sport={sport} />
      </>)}
    </div>
  );
}

/* ─── Line Score ─────────────────────────────────────── */
/* mlbInnings: [{num,away:{runs,hits,errors},home:{...}}]
   mlbTotals:  {away:{runs,hits,errors}, home:{...}} */
function LineScore({ competitors, sport, mlbInnings, mlbTotals }) {
  if (!['mlb','nhl'].includes(sport)) return null;

  const sorted = [...competitors].sort((a,b) => a.homeAway==='away' ? -1 : b.homeAway==='away' ? 1 : 0);

  // Prefer MLB innings data for MLB games
  const useMLB = sport === 'mlb' && mlbInnings?.length > 0;

  const maxPeriods = useMLB
    ? Math.max(mlbInnings.length, 9)
    : Math.max(...sorted.map((c) => (c.linescores||[]).length), sport === 'mlb' ? 9 : 3);
  const cols = Array.from({length: maxPeriods}, (_,i) => i+1);

  return (
    <div className="bsp-linescore-wrap">
      <table className="bsp-linescore">
        <thead>
          <tr>
            <th className="bsp-ls-th bsp-ls-team-col" />
            {cols.map((n) => <th key={n} className="bsp-ls-th">{n}</th>)}
            <th className="bsp-ls-th bsp-ls-rhe">R</th>
            <th className="bsp-ls-th bsp-ls-rhe">H</th>
            <th className="bsp-ls-th bsp-ls-rhe">E</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const side = c.homeAway; // 'away' or 'home'
            const tot  = mlbTotals?.[side];
            return (
              <tr key={c.team?.id}>
                <td className="bsp-ls-td bsp-ls-team-col">
                  <LogoImg team={c.team} className="bsp-ls-logo" />
                  <span className="bsp-ls-abbr">{c.team?.abbreviation}</span>
                </td>
                {cols.map((_,i) => {
                  const inning = useMLB ? mlbInnings[i] : null;
                  const val = useMLB
                    ? (inning ? (inning[side]?.runs ?? '—') : '—')
                    : (c.linescores?.[i]?.displayValue ?? '—');
                  return <td key={i} className="bsp-ls-td">{val}</td>;
                })}
                <td className="bsp-ls-td bsp-ls-rhe bsp-ls-bold">{(useMLB ? tot?.runs : null) ?? c.score ?? '0'}</td>
                <td className="bsp-ls-td bsp-ls-rhe">{(useMLB ? tot?.hits : null) ?? c.hits ?? '0'}</td>
                <td className="bsp-ls-td bsp-ls-rhe">{(useMLB ? tot?.errors : null) ?? c.errors ?? '0'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Game Header ────────────────────────────────────── */
/* Compact MLB.com-style game header */
function GameHeader({ competitors, status, sport, mlbTotals, mlbInningDisplay }) {
  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];
  const isLive  = status?.type?.state === 'in';
  const isFinal = status?.type?.state === 'post';
  const isPre   = status?.type?.state === 'pre';
  const shortDetail = status?.type?.shortDetail || '';

  const awayScore = mlbTotals?.away?.runs ?? getScore(away) ?? '—';
  const homeScore = mlbTotals?.home?.runs ?? getScore(home) ?? '—';
  const centerLabel = mlbInningDisplay || (isFinal ? 'Final' : isPre ? shortDetail : shortDetail);

  return (
    <div className="bsp-compact-header">
      {/* Away side */}
      <Link to={`/team/${sport}/${away?.team?.id}`} className="bsp-compact-side bsp-compact-away tr-team-link">
        <LogoImg team={away?.team} className="bsp-compact-logo" />
        <div className="bsp-compact-info">
          <span className="bsp-compact-abbr">{away?.team?.abbreviation}</span>
          <span className="bsp-compact-rec">{away?.record?.[0]?.displayValue}</span>
        </div>
        <span className="bsp-compact-score">{awayScore}</span>
      </Link>

      {/* Center */}
      <div className="bsp-compact-center">
        {isLive && <span className="live-dot bsp-compact-live-dot" />}
        <span className="bsp-compact-inning">{centerLabel}</span>
      </div>

      {/* Home side */}
      <Link to={`/team/${sport}/${home?.team?.id}`} className="bsp-compact-side bsp-compact-home tr-team-link">
        <span className="bsp-compact-score">{homeScore}</span>
        <div className="bsp-compact-info bsp-compact-info-right">
          <span className="bsp-compact-abbr">{home?.team?.abbreviation}</span>
          <span className="bsp-compact-rec">{home?.record?.[0]?.displayValue}</span>
        </div>
        <LogoImg team={home?.team} className="bsp-compact-logo" />
      </Link>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */
export default function BoxScorePage() {
  const { sport, gameId } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useBoxScore(sport, gameId);
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => location.state?.tab || 'Gamecast');
  const [bsTeam, setBsTeam] = useState(0);

  // Lineup state (MLB pre-game only)
  const [lineups, setLineups] = useState({ away: null, home: null });
  const [lineupLoading, setLineupLoading] = useState({ away: false, home: false });

  // MLB live game PK (for pitch tracker + live scoring)
  const [mlbGamePk, setMlbGamePk] = useState(null);

  // Pull live innings + score from MLB feed for MLB games
  const mlbFeed = useMlbLiveFeed(mlbGamePk, sport === 'mlb');
  const mlbInnings       = mlbFeed.innings           || [];
  const mlbTotals        = mlbFeed.linescoreTotals   || {};
  const mlbInningDisplay = mlbFeed.inningDisplay     || '';

  const comp   = data?.header?.competitions?.[0];
  const comps  = comp?.competitors || [];
  const status = comp?.status;
  const isLive = status?.type?.state === 'in';
  const isFinal = status?.type?.state === 'post';
  const players      = data?.boxscore?.players || [];
  const bsTeams      = data?.boxscore?.teams   || [];  // contains .details with batting/fielding notes
  const situation    = data?.situation;
  const rosters      = data?.rosters || [];

  const away = comps.find((c) => c.homeAway === 'away') || comps[0];
  const home = comps.find((c) => c.homeAway === 'home') || comps[1];
  const awayGroup   = players.find((p) => p.team?.id === away?.team?.id) || players[0];
  const homeGroup   = players.find((p) => p.team?.id === home?.team?.id) || players[1];
  const groups      = [awayGroup, homeGroup].filter(Boolean);
  // Team details (batting/fielding notes) keyed by team id
  const awayDetails = bsTeams.find((t) => t.team?.id === away?.team?.id)?.details || [];
  const homeDetails = bsTeams.find((t) => t.team?.id === home?.team?.id)?.details || [];
  const groupDetails = [awayDetails, homeDetails];

  const isPre = status?.type?.state === 'pre';

  // Fetch MLB batting lineups for pre-game pages
  useEffect(() => {
    if (!isPre || sport !== 'mlb' || !data) return;

    const awayTeam = away?.team;
    const homeTeam = home?.team;
    if (!awayTeam || !homeTeam) return;

    const gameDate = comp?.date?.slice(0, 10); // "YYYY-MM-DD"
    if (!gameDate) return;

    const ctrl = new AbortController();
    let cancelled = false;

    setLineups({ away: null, home: null });
    setLineupLoading({ away: true, home: true });

    getMlbGameForDate(gameDate, awayTeam.displayName, homeTeam.displayName).then(async (mlbGame) => {
      if (cancelled || !mlbGame) {
        setLineupLoading({ away: false, home: false });
        return;
      }

      const awayId = mlbGame.teams?.away?.team?.id;
      const homeId = mlbGame.teams?.home?.team?.id;

      const confirmedAway = mlbGame.lineups?.awayPlayers;
      const confirmedHome = mlbGame.lineups?.homePlayers;

      // Fetch both sides in parallel (confirmed if available, else projected)
      const [awayResult, homeResult] = await Promise.allSettled([
        confirmedAway?.length > 0
          ? Promise.resolve({ players: confirmedAway, confirmed: true, fromDate: null })
          : awayId ? getProjectedLineup(awayId, ctrl.signal) : Promise.resolve({ players: [], confirmed: false, fromDate: null }),
        confirmedHome?.length > 0
          ? Promise.resolve({ players: confirmedHome, confirmed: true, fromDate: null })
          : homeId ? getProjectedLineup(homeId, ctrl.signal) : Promise.resolve({ players: [], confirmed: false, fromDate: null }),
      ]);

      if (cancelled) return;
      setLineups({
        away: awayResult.status === 'fulfilled' ? awayResult.value : { players: [], confirmed: false, fromDate: null },
        home: homeResult.status === 'fulfilled' ? homeResult.value : { players: [], confirmed: false, fromDate: null },
      });
      setLineupLoading({ away: false, home: false });
    }).catch(() => {
      if (!cancelled) setLineupLoading({ away: false, home: false });
    });

    return () => { cancelled = true; ctrl.abort(); };
  }, [isPre, sport, data, gameId]);

  // Resolve MLB gamePk for live pitch tracker
  useEffect(() => {
    if (sport !== 'mlb' || !data) return;
    const awayTeam = away?.team;
    const homeTeam = home?.team;
    const gameDate = comp?.date?.slice(0, 10);
    if (!awayTeam || !homeTeam || !gameDate) return;
    getMlbGameForDate(gameDate, awayTeam.displayName, homeTeam.displayName)
      .then((game) => { if (game?.gamePk) setMlbGamePk(game.gamePk); })
      .catch(() => {});
  }, [sport, data, gameId]);

  // Auto-select best tab only if no tab was passed via navigation state
  useEffect(() => {
    if (!loading && !location.state?.tab) {
      if (isPre) setActiveTab('Preview');
      else if (!isLive) setActiveTab('Box Score');
      else setActiveTab('Gamecast');
    }
  }, [loading, isLive, isPre]);

  const tabs = isPre
    ? ['Preview']
    : isLive
    ? ['Gamecast', 'Box Score', 'Play-by-Play']
    : ['Box Score', 'Play-by-Play', 'Gamecast'];

  return (
    <div className="bsp-page">
      <button className="tp-back" onClick={() => navigate(-1)}>← Back</button>

      {loading && <div className="tp-loading">Loading…</div>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && data && (
        <>
          <GameHeader competitors={comps} status={status} sport={sport}
            mlbTotals={mlbInnings.length > 0 ? mlbTotals : null}
            mlbInningDisplay={mlbInningDisplay} />

          {/* Tabs */}
          <div className="bsp-tabs-row">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`bsp-tab-btn ${activeTab === tab ? 'bsp-tab-btn-active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="bsp-tab-content">
            {activeTab === 'Preview' && (
              <PreviewTab data={data} competitors={comps} status={status} sport={sport}
                lineups={lineups} lineupLoading={lineupLoading} />
            )}

            {activeTab === 'Gamecast' && (
              sport === 'mlb'
                ? <MlbGamecast data={data} rosters={rosters} situation={situation} competitors={comps} status={status} mlbGamePk={mlbGamePk} />
                : <GenericGamecast data={data} situation={situation} competitors={comps} status={status} sport={sport} />
            )}

            {activeTab === 'Box Score' && (
              <div>
                <LineScore competitors={comps} sport={sport}
                  mlbInnings={mlbInnings} mlbTotals={mlbTotals} />
                {groups.length > 1 && (
                  <div className="bsp-team-toggle">
                    <button className={`bsp-tab ${bsTeam === 0 ? 'bsp-tab-active' : ''}`} onClick={() => setBsTeam(0)}>
                      {away?.team?.abbreviation || 'Away'}
                    </button>
                    <button className={`bsp-tab ${bsTeam === 1 ? 'bsp-tab-active' : ''}`} onClick={() => setBsTeam(1)}>
                      {home?.team?.abbreviation || 'Home'}
                    </button>
                  </div>
                )}
                {groups[bsTeam] && <TeamStats group={groups[bsTeam]} sport={sport} teamDetails={groupDetails[bsTeam]} />}
                {!groups.length && <div className="empty-state"><div className="empty-icon">📋</div><p>Box score not available yet.</p></div>}
              </div>
            )}

            {activeTab === 'Play-by-Play' && (
              <PlayByPlay data={data} competitors={comps} sport={sport} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

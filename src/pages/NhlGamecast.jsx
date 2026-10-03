/**
 * NhlGamecast — uses ESPN boxscore data passed from BoxScorePage.
 * BoxScorePage polls the ESPN summary every 15 s when live, so both
 * the Gamecast tab and PBP tab update automatically without any
 * additional fetching here.
 */
import { useNavigate } from 'react-router-dom';
import { getTeamLogo } from '../api/espn';
import { NhlScoringSummary, nhlScoringFromSummary } from '../components/TeamRow';

/* ─── Badge config (keyed by ESPN play type text) ──── */
const BADGES = {
  'Shot':          { label: 'SHOT ON GOAL',  bg: '#14532d', color: '#4ade80' },
  'Blocked':       { label: 'SHOT BLOCKED',  bg: '#7c2d12', color: '#fb923c' },
  'Missed':        { label: 'MISSED SHOT',   bg: '#1f2937', color: '#9ca3af' },
  'Goal':          { label: 'GOAL',          bg: '#7f1d1d', color: '#f87171' },
  'Hit':           { label: 'HIT',           bg: '#3b0764', color: '#c4b5fd' },
  'Giveaway':      { label: 'GIVEAWAY',      bg: '#78350f', color: '#fbbf24' },
  'Takeaway':      { label: 'TAKEAWAY',      bg: '#134e4a', color: '#2dd4bf' },
  'Face Off':      { label: 'FACE-OFF',      bg: '#1e3a5f', color: '#60a5fa' },
};
const PENALTY_BADGE = { label: 'PENALTY', bg: '#7f1d1d', color: '#fbbf24' };

/** Resolve a badge for any ESPN play (handles named penalty types too) */
function getBadge(play) {
  const t = play.type?.text || '';
  if (BADGES[t]) return BADGES[t];
  // ESPN uses the penalty name as type text (Tripping, Hooking, Fighting, etc.)
  if (play.type?.penaltyType || play.type?.penaltyMinutes ||
      play.participants?.some(p => p.penaltyCodes?.length)) return PENALTY_BADGE;
  // Fall back: if play has participants and a non-noise type, show penalty badge
  // (catches Tripping/Hooking/etc. where penaltyType field may be missing)
  if (play.participants?.length && !HIDE_TYPES.has(t) && t !== 'Stoppage' && t !== '') {
    return PENALTY_BADGE;
  }
  return null;
}

/* ─── Bold participant names in play text ────────────── */
function boldNames(text, participants) {
  if (!text || !participants?.length) return text;
  const names = participants
    .map(p => p.athlete?.displayName)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // longest first avoids partial matches
  let parts = [text];
  for (const name of names) {
    const next = [];
    for (const part of parts) {
      if (typeof part !== 'string') { next.push(part); continue; }
      const idx = part.indexOf(name);
      if (idx === -1) { next.push(part); continue; }
      if (idx > 0) next.push(part.slice(0, idx));
      next.push(<strong key={name + idx}>{name}</strong>);
      const after = part.slice(idx + name.length);
      if (after) next.push(after);
    }
    parts = next;
  }
  return parts;
}

/* Plays to hide from feed (noise) */
const HIDE_TYPES = new Set(['Period Start', 'Period End', 'Game Start', 'Game End']);

/* ─── Ice rink SVG ───────────────────────────────────── */
function IceRink({ homeLogo, awayLogo }) {
  const W = 500, H = 210, rx = 54;
  const goalLineX = [48, W - 48];
  const blueX = [148, W - 148];
  return (
    <div className="nhl-rink-outer">
      <div className="nhl-rink-perspective">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg">
          {/* Ice */}
          <rect x={1} y={1} width={W-2} height={H-2} rx={rx} ry={rx} fill="#e8f4fb" stroke="#b0cde0" strokeWidth={2}/>
          {/* Blue lines */}
          {blueX.map(x=><line key={x} x1={x} y1={rx*0.5} x2={x} y2={H-rx*0.5} stroke="#0038a8" strokeWidth={4}/>)}
          {/* Red center line */}
          <line x1={W/2} y1={rx*0.5} x2={W/2} y2={H-rx*0.5} stroke="#c8102e" strokeWidth={3}/>
          {/* Goal lines */}
          {goalLineX.map(x=><line key={x} x1={x} y1={H*0.28} x2={x} y2={H*0.72} stroke="#c8102e" strokeWidth={2}/>)}
          {/* Center circle */}
          <circle cx={W/2} cy={H/2} r={38} fill="none" stroke="#c8102e" strokeWidth={2}/>
          <circle cx={W/2} cy={H/2} r={3} fill="#c8102e"/>
          {/* Zone faceoff circles */}
          {[[108,H*0.3],[108,H*0.7],[W-108,H*0.3],[W-108,H*0.7]].map(([cx,cy],i)=>(
            <circle key={i} cx={cx} cy={cy} r={26} fill="none" stroke="#c8102e" strokeWidth={1.5}/>
          ))}
          {/* Goal creases */}
          <path d={`M${goalLineX[0]},${H*0.38} A20,20 0 0,0 ${goalLineX[0]},${H*0.62} L${goalLineX[0]-22},${H*0.62} L${goalLineX[0]-22},${H*0.38} Z`}
            fill="rgba(0,56,168,0.18)" stroke="#0038a8" strokeWidth={1.5}/>
          <path d={`M${goalLineX[1]},${H*0.38} A20,20 0 0,1 ${goalLineX[1]},${H*0.62} L${goalLineX[1]+22},${H*0.62} L${goalLineX[1]+22},${H*0.38} Z`}
            fill="rgba(0,56,168,0.18)" stroke="#0038a8" strokeWidth={1.5}/>
          {/* Logos */}
          {awayLogo && <image href={awayLogo} x={10} y={H/2-28} width={56} height={56} opacity={0.92}/>}
          {homeLogo && <image href={homeLogo} x={W-66} y={H/2-28} width={56} height={56} opacity={0.92}/>}
        </svg>
      </div>
    </div>
  );
}

/* ─── Team logo helper ───────────────────────────────── */
function teamLogo(team) {
  return getTeamLogo(team) || team?.logo || team?.logos?.[0]?.href || null;
}
function teamById(competitors, id) {
  if (!id) return null;
  return competitors?.find(c => String(c.team?.id) === String(id)) || null;
}
function isEmptyNet(play) {
  const strength = (play?.strength?.abbreviation || play?.strength?.text || '').toLowerCase();
  return strength.startsWith('empty');
}

/* ─── Recent play row (Gamecast) ─────────────────────── */
function RecentRow({ play, away, home, competitors }) {
  const typeText  = play.type?.text || '';
  const isGoal    = typeText === 'Goal';
  const isSpecial = HIDE_TYPES.has(typeText) || typeText === 'Stoppage';
  const teamComp  = teamById(competitors, play.team?.id);
  const logo      = teamLogo(teamComp?.team);

  return (
    <div className={`nhl-recent-row${isGoal?' nhl-recent-row-goal':''}${isSpecial?' nhl-recent-row-special':''}`}>
      <span className="nhl-recent-time">{play.clock?.displayValue}</span>
      {logo
        ? <img src={logo} alt="" className="nhl-recent-logo" onError={e=>e.target.style.display='none'}/>
        : <span className="nhl-recent-logo-placeholder">🏒</span>}
      <span className="nhl-recent-desc">{boldNames(play.text, play.participants)}</span>
      {isGoal && isEmptyNet(play) && <span className="nhl-card-goal-en">EN</span>}
      {isGoal && <span className="nhl-recent-score">{play.awayScore}–{play.homeScore}</span>}
    </div>
  );
}

/* ─── PBP row ────────────────────────────────────────── */
function PbpRow({ play, away, home, competitors }) {
  const typeText = play.type?.text || '';
  const badge    = getBadge(play);
  const teamComp = teamById(competitors, play.team?.id);
  const logo     = teamLogo(teamComp?.team);
  const isGoal   = typeText === 'Goal';
  const periodStr = (play.period?.displayValue || '').toUpperCase();

  if (!badge) {
    // Stoppages, period markers, etc.
    if (!play.text) return null;
    return (
      <div className="nhl-pbp-special">
        <span className="nhl-pbp-special-text">{play.text}</span>
      </div>
    );
  }

  return (
    <div className="nhl-pbp-row">
      {logo
        ? <img src={logo} alt="" className="nhl-pbp-logo" onError={e=>e.target.style.display='none'}/>
        : <div className="nhl-pbp-logo-placeholder"/>}
      <div className="nhl-pbp-body">
        <div className="nhl-pbp-meta-row">
          <span className="nhl-pbp-badge" style={{background:badge.bg, color:badge.color}}>{badge.label}</span>
          {isGoal && isEmptyNet(play) && <span className="nhl-card-goal-en">EN</span>}
          {periodStr && <span className="nhl-pbp-period">{periodStr}</span>}
          <span className="nhl-pbp-time">{play.clock?.displayValue}</span>
          {isGoal && <span className="nhl-pbp-score">{play.awayScore}–{play.homeScore}</span>}
        </div>
        <div className="nhl-pbp-desc">{boldNames(play.text, play.participants)}</div>
      </div>
    </div>
  );
}

/* ─── Exported PBP tab (used by BoxScorePage) ────────── */
export function NhlPbpTab({ data, competitors, status }) {
  const plays   = [...(data?.plays || [])].reverse().filter(p => !HIDE_TYPES.has(p.type?.text));
  const away    = competitors?.find(c=>c.homeAway==='away') || competitors?.[0];
  const home    = competitors?.find(c=>c.homeAway==='home') || competitors?.[1];

  if (!plays.length) return (
    <div className="tp-loading">
      {status?.type?.state === 'pre' ? 'Game has not started yet.' : 'Play-by-play not available yet.'}
    </div>
  );

  return (
    <div className="nhl-pbp-wrap">
      {plays.map((p,i) => <PbpRow key={p.id||i} play={p} away={away} home={home} competitors={competitors}/>)}
    </div>
  );
}

/* ─── Main Gamecast export ───────────────────────────── */
export default function NhlGamecast({ data, comp, competitors, status }) {
  const navigate = useNavigate();
  const plays = data?.plays || [];
  const { goalies, goals } = nhlScoringFromSummary(data, competitors);
  const away  = competitors?.find(c=>c.homeAway==='away') || competitors?.[0];
  const home  = competitors?.find(c=>c.homeAway==='home') || competitors?.[1];

  const isLive  = status?.type?.state === 'in';
  const isFinal = status?.type?.state === 'post';
  const shortDetail = status?.type?.shortDetail || '';

  const awayScore = away?.score ?? 0;
  const homeScore = home?.score ?? 0;

  // Boxscore stats
  const bsTeams   = data?.boxscore?.teams || [];
  const awayStats = bsTeams.find(t=>t.homeAway==='away')?.statistics || [];
  const homeStats = bsTeams.find(t=>t.homeAway==='home')?.statistics || [];
  const getStat   = (stats, name) => stats.find(s=>s.name===name)?.displayValue || '0';
  const awaySOG   = getStat(awayStats,'shotsTotal');
  const homeSOG   = getStat(homeStats,'shotsTotal');

  // Situation (power play etc.)
  const sit = data?.situation || comp?.situation || {};
  const ppText = sit.powerPlayText || '';

  // Recent plays (most recent first, hide noise)
  const recent = [...plays].reverse().filter(p => !HIDE_TYPES.has(p.type?.text)).slice(0, 10);
  const lastPlay = recent[0];

  const homeLogo = teamLogo(home?.team);
  const awayLogo = teamLogo(away?.team);

  if (!data && !comp) return <div className="tp-loading">Loading game data…</div>;

  return (
    <div className="nhl-gc">
      {/* Score Header */}
      <div className="nhl-gc-header">
        <div className="nhl-gc-scoreline">
          <div className="nhl-gc-team">
            {awayLogo && <img src={awayLogo} alt="" className="nhl-gc-logo" onError={e=>e.target.style.display='none'}/>}
            <div className="nhl-gc-team-name">{away?.team?.abbreviation}</div>
          </div>
          <div className="nhl-gc-center">
            <div className="nhl-gc-scores">
              <span className={`nhl-gc-score${isFinal&&awayScore>homeScore?' nhl-gc-score-win':''}`}>{awayScore}</span>
              <span className="nhl-gc-score-sep">–</span>
              <span className={`nhl-gc-score${isFinal&&homeScore>awayScore?' nhl-gc-score-win':''}`}>{homeScore}</span>
            </div>
            <div className={`nhl-gc-status${isLive?' nhl-gc-live':''}`}>
              {isLive && <span className="live-dot" style={{marginRight:4}}/>}
              {shortDetail || (isFinal ? 'Final' : 'Upcoming')}
            </div>
          </div>
          <div className="nhl-gc-team">
            {homeLogo && <img src={homeLogo} alt="" className="nhl-gc-logo" onError={e=>e.target.style.display='none'}/>}
            <div className="nhl-gc-team-name">{home?.team?.abbreviation}</div>
          </div>
        </div>
        {(awaySOG !== '0' || homeSOG !== '0') && (
          <div className="nhl-gc-sog-bar">
            <span className="nhl-gc-sog-val">{awaySOG}</span>
            <span className="nhl-gc-sog-lbl">Shots</span>
            <span className="nhl-gc-sog-val">{homeSOG}</span>
          </div>
        )}
      </div>

      <div className="nhl-gc-body">
        <NhlScoringSummary
          goalies={goalies}
          goals={goals}
          onPlayer={(id) => navigate(`/player/nhl/${id}`)}
        />

        {/* Live situation */}
        {isLive && (
          <div className="nhl-sit-bar">
            <span className="nhl-sit-period">{shortDetail}</span>
            {ppText && <span className="nhl-sit-pp">⚡ {ppText}</span>}
            {lastPlay && <span style={{color:'var(--text2)',fontSize:11,marginLeft:'auto'}}>{lastPlay.text?.slice(0, 60)}{(lastPlay.text?.length||0)>60?'…':''}</span>}
          </div>
        )}

        {/* Ice rink */}
        <IceRink homeLogo={homeLogo} awayLogo={awayLogo}/>


        {/* Recent plays */}
        {recent.length > 0 && (
          <div className="nhl-recent-plays">
            {recent.map((p,i) => <RecentRow key={p.id||i} play={p} away={away} home={home} competitors={competitors}/>)}
          </div>
        )}

        {/* No plays yet */}
        {recent.length === 0 && (
          <div className="nhl-gc-empty">
            {status?.type?.state === 'pre' ? 'Game has not started yet.' : 'No plays yet.'}
          </div>
        )}

        {/* Team stats */}
        {(parseInt(awaySOG)||parseInt(homeSOG)) > 0 && (
          <div className="nhl-gc-stat-rows" style={{padding:'10px 16px', borderTop:'1px solid var(--border)'}}>
            {[
              {label:'Shots',       a:awaySOG,                       h:homeSOG},
              {label:'Hits',        a:getStat(awayStats,'hits'),      h:getStat(homeStats,'hits')},
              {label:'Blocked',     a:getStat(awayStats,'blockedShots'),h:getStat(homeStats,'blockedShots')},
              {label:'Faceoffs',    a:getStat(awayStats,'faceoffsWon'),h:getStat(homeStats,'faceoffsWon')},
              {label:'Takeaways',   a:getStat(awayStats,'takeaways'), h:getStat(homeStats,'takeaways')},
              {label:'PIM',         a:getStat(awayStats,'penaltyMinutes'),h:getStat(homeStats,'penaltyMinutes')},
            ].map(r=>{
              const a=parseFloat(r.a)||0, h=parseFloat(r.h)||0, tot=a+h;
              if(!tot) return null;
              return (
                <div key={r.label} className="nhl-gc-stat-row">
                  <span className="nhl-gc-stat-val nhl-gc-stat-away">{r.a}</span>
                  <div className="nhl-gc-stat-bar-wrap">
                    <div className="nhl-gc-stat-bar" style={{width:`${tot>0?a/tot*100:50}%`,background:'#60a5fa'}}/>
                    <span className="nhl-gc-stat-label">{r.label}</span>
                    <div className="nhl-gc-stat-bar" style={{width:`${tot>0?h/tot*100:50}%`,background:'#f87171'}}/>
                  </div>
                  <span className="nhl-gc-stat-val nhl-gc-stat-home">{r.h}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

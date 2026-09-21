import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/* ─── ESPN NHL summary fetcher (CORS-safe) ───────────── */
async function fetchNhlSummary(espnGameId) {
  const r = await fetch(
    `https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl/summary?event=${espnGameId}`
  );
  return r.json();
}

/* ─── Period label ───────────────────────────────────── */
function pLabel(num, extra = '') {
  const base = num === 1 ? '1st' : num === 2 ? '2nd' : num === 3 ? '3rd' : num > 3 ? 'OT' : `P${num}`;
  return extra || base;
}

/* ─── Team color palette ─────────────────────────────── */
const TEAM_COLORS = {
  BOS:'#FFB81C', TOR:'#003E7E', MTL:'#AF1E2D', OTT:'#C52032', BUF:'#003087',
  DET:'#CE1126', FLA:'#041E42', TBL:'#002868', CBJ:'#002654', CAR:'#CC0000',
  WSH:'#CF0A2C', PIT:'#FCB514', PHI:'#F74902', NYR:'#0038A8', NYI:'#003087',
  NJD:'#CE1126', CHI:'#CF0A2C', STL:'#002F87', NSH:'#FFB81C', MIN:'#154734',
  WPG:'#004C97', COL:'#6F263D', DAL:'#006847', ARI:'#8C2633', VGK:'#B4975A',
  SEA:'#99D9D9', VAN:'#00843D', CGY:'#C8102E', EDM:'#FF4C00', SJS:'#006D75',
  ANA:'#F47A38', LAK:'#A2AAAD',
};
const tc = (abb) => TEAM_COLORS[abb] || '#0092ff';

/* ─── Main component ─────────────────────────────────── */
export default function NhlGamecast({ espnGame, sport, directNhlGameId }) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('gamecast');
  const [eventFilter, setEventFilter] = useState('all');

  // Resolve ESPN game ID
  const espnGameId = espnGame?.id
    || espnGame?.competitions?.[0]?.id
    || directNhlGameId;

  useEffect(() => {
    if (!espnGameId || espnGameId === 2025030416) {
      // Demo mode: use bundled NHL API static JSON
      if (espnGameId === 2025030416 || directNhlGameId === 2025030416) {
        fetch(`${import.meta.env.BASE_URL}demo/nhl-demo-game.json`)
          .then(r => r.json())
          .then(d => { setSummary({ _nhlDemoData: d }); setLoading(false); })
          .catch(() => setLoading(false));
      } else {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    fetchNhlSummary(espnGameId)
      .then(d => { setSummary(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [espnGameId]);

  if (loading) return <div className="nhl-gc-loading"><div className="loading-text">Loading…</div></div>;
  if (!summary) return <div className="nhl-gc-loading"><div className="loading-text">Game data unavailable.</div></div>;

  /* ── Demo mode: parse NHL API static JSON ── */
  if (summary._nhlDemoData) {
    return <NhlDemoGamecast data={summary._nhlDemoData} navigate={navigate} />;
  }

  /* ── Normal mode: parse ESPN summary ── */
  const comp = summary.header?.competitions?.[0] || {};
  const competitors = comp.competitors || [];
  const away = competitors.find(c => c.homeAway === 'away') || competitors[0] || {};
  const home = competitors.find(c => c.homeAway === 'home') || competitors[1] || {};
  const awayAbb = away.team?.abbreviation || '';
  const homeAbb = home.team?.abbreviation || '';
  const awayScore = away.score ?? 0;
  const homeScore = home.score ?? 0;
  const status = comp.status || {};
  const isLive = status.type?.state === 'in';
  const isFinal = status.type?.state === 'post';
  const statusStr = isFinal
    ? `FINAL${status.type?.shortDetail?.includes('/OT') ? ' (OT)' : ''}`
    : isLive ? status.type?.shortDetail || 'LIVE'
    : status.type?.shortDetail || 'UPCOMING';

  const plays = summary.plays || [];

  // Goals
  const goals = plays.filter(p => p.type?.text === 'Goal');
  const goalsByPeriod = {};
  for (const g of goals) {
    const p = g.period?.number || 1;
    if (!goalsByPeriod[p]) goalsByPeriod[p] = [];
    goalsByPeriod[p].push(g);
  }

  // Penalties
  const penalties = plays.filter(p => p.type?.penaltyMinutes || p.type?.penaltyType);

  // Team stats from boxscore
  const bsTeams = summary.boxscore?.teams || [];
  const awayStats = bsTeams.find(t => t.homeAway === 'away')?.statistics || [];
  const homeStats = bsTeams.find(t => t.homeAway === 'home')?.statistics || [];
  const getStat = (stats, name) => stats.find(s => s.name === name)?.displayValue || '0';

  const statRows = [
    { label: 'Shots', away: getStat(awayStats,'shotsTotal'), home: getStat(homeStats,'shotsTotal') },
    { label: 'Hits', away: getStat(awayStats,'hits'), home: getStat(homeStats,'hits') },
    { label: 'Blocked Shots', away: getStat(awayStats,'blockedShots'), home: getStat(homeStats,'blockedShots') },
    { label: 'PIM', away: getStat(awayStats,'penaltyMinutes'), home: getStat(homeStats,'penaltyMinutes') },
    { label: 'PP Goals', away: getStat(awayStats,'powerPlayGoals'), home: getStat(homeStats,'powerPlayGoals') },
    { label: 'Faceoffs Won', away: getStat(awayStats,'faceoffsWon'), home: getStat(homeStats,'faceoffsWon') },
    { label: 'Takeaways', away: getStat(awayStats,'takeaways'), home: getStat(homeStats,'takeaways') },
  ];

  // Event feed (most recent first), filtered
  const allEvents = [...plays].reverse();
  const filterMap = {
    all: null,
    goals: ['Goal'],
    penalties: null, // use penalty check
    shots: ['Shot','Blocked','Missed'],
    hits: ['Hit'],
  };
  const filteredEvents = eventFilter === 'penalties'
    ? [...penalties].reverse()
    : filterMap[eventFilter]
    ? allEvents.filter(e => filterMap[eventFilter].includes(e.type?.text))
    : allEvents.filter(e => !['Period Start','Period End','Face Off','Stoppage'].includes(e.type?.text));

  const tabs = [
    { id: 'gamecast', label: 'Gamecast' },
    { id: 'goals', label: `Goals (${goals.length})` },
    { id: 'plays', label: 'Play-by-Play' },
    { id: 'penalties', label: `Penalties (${penalties.length})` },
    { id: 'stats', label: 'Stats' },
  ];

  const awayColor = tc(awayAbb);
  const homeColor = tc(homeAbb);
  const broadcast = (summary.broadcasts || []).map(b => b.names?.join('/')).filter(Boolean).join(', ');

  return (
    <div className="nhl-gc">
      {/* Score Header */}
      <div className="nhl-gc-header" style={{
        background: `linear-gradient(135deg,color-mix(in srgb,${awayColor} 20%,var(--bg2)) 0%,var(--bg2) 50%,color-mix(in srgb,${homeColor} 20%,var(--bg2)) 100%)`
      }}>
        <div className="nhl-gc-scoreline">
          <div className="nhl-gc-team">
            {away.team?.logo && <img src={away.team.logo} alt={awayAbb} className="nhl-gc-logo" onError={e=>e.target.style.display='none'}/>}
            <div className="nhl-gc-team-name">{awayAbb}</div>
          </div>
          <div className="nhl-gc-center">
            <div className="nhl-gc-scores">
              <span className={`nhl-gc-score${isFinal && awayScore > homeScore ? ' nhl-gc-score-win':''}`}>{awayScore}</span>
              <span className="nhl-gc-score-sep">–</span>
              <span className={`nhl-gc-score${isFinal && homeScore > awayScore ? ' nhl-gc-score-win':''}`}>{homeScore}</span>
            </div>
            <div className={`nhl-gc-status${isLive?' nhl-gc-live':''}`}>
              {isLive && <span className="live-dot" style={{marginRight:4}}/>}
              {statusStr}
            </div>
            {broadcast && <div className="nhl-gc-broadcast">{broadcast}</div>}
          </div>
          <div className="nhl-gc-team">
            {home.team?.logo && <img src={home.team.logo} alt={homeAbb} className="nhl-gc-logo" onError={e=>e.target.style.display='none'}/>}
            <div className="nhl-gc-team-name">{homeAbb}</div>
          </div>
        </div>
        <div className="nhl-gc-sog-bar">
          <span className="nhl-gc-sog-val">{getStat(awayStats,'shotsTotal')}</span>
          <span className="nhl-gc-sog-lbl">Shots</span>
          <span className="nhl-gc-sog-val">{getStat(homeStats,'shotsTotal')}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="nhl-gc-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`nhl-gc-tab${activeTab===t.id?' nhl-gc-tab-active':''}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Gamecast */}
      {activeTab === 'gamecast' && (
        <div className="nhl-gc-body">
          <div className="nhl-gc-stat-rows">
            {statRows.slice(0,4).map(row => {
              const a = parseFloat(row.away)||0, h = parseFloat(row.home)||0, tot = a+h;
              return (
                <div key={row.label} className="nhl-gc-stat-row">
                  <span className="nhl-gc-stat-val nhl-gc-stat-away">{row.away}</span>
                  <div className="nhl-gc-stat-bar-wrap">
                    <div className="nhl-gc-stat-bar" style={{width:tot>0?`${a/tot*100}%`:'50%',background:awayColor}}/>
                    <span className="nhl-gc-stat-label">{row.label}</span>
                    <div className="nhl-gc-stat-bar" style={{width:tot>0?`${h/tot*100}%`:'50%',background:homeColor}}/>
                  </div>
                  <span className="nhl-gc-stat-val nhl-gc-stat-home">{row.home}</span>
                </div>
              );
            })}
          </div>
          {goals.length > 0 && (
            <div className="nhl-gc-section">
              <div className="nhl-gc-section-title">Goals</div>
              {goals.map((g,i) => <EspnGoalRow key={i} play={g} away={away} home={home} navigate={navigate} sport={sport}/>)}
            </div>
          )}
          {penalties.length > 0 && (
            <div className="nhl-gc-section">
              <div className="nhl-gc-section-title">Penalties</div>
              {penalties.slice(-5).reverse().map((p,i) => <EspnPenaltyRow key={i} play={p} away={away} home={home}/>)}
            </div>
          )}
        </div>
      )}

      {/* Goals */}
      {activeTab === 'goals' && (
        <div className="nhl-gc-body">
          {goals.length === 0 && <div className="nhl-gc-empty">No goals scored.</div>}
          {Object.entries(goalsByPeriod).map(([p,gs]) => (
            <div key={p} className="nhl-gc-section">
              <div className="nhl-gc-section-title">{pLabel(parseInt(p))} Period</div>
              {gs.map((g,i) => <EspnGoalRow key={i} play={g} away={away} home={home} navigate={navigate} sport={sport}/>)}
            </div>
          ))}
        </div>
      )}

      {/* Play-by-Play */}
      {activeTab === 'plays' && (
        <div className="nhl-gc-body">
          <div className="nhl-gc-event-filters">
            {['all','goals','shots','hits','penalties'].map(f => (
              <button key={f} className={`nhl-gc-filter-btn${eventFilter===f?' nhl-gc-filter-active':''}`} onClick={()=>setEventFilter(f)}>
                {f.charAt(0).toUpperCase()+f.slice(1)}
              </button>
            ))}
          </div>
          <div className="nhl-gc-event-feed">
            {filteredEvents.length === 0 && <div className="nhl-gc-empty">No events.</div>}
            {filteredEvents.map((e,i) => <EspnEventRow key={i} play={e} away={away} home={home} navigate={navigate} sport={sport}/>)}
          </div>
        </div>
      )}

      {/* Penalties */}
      {activeTab === 'penalties' && (
        <div className="nhl-gc-body">
          {penalties.length === 0 && <div className="nhl-gc-empty">No penalties.</div>}
          {penalties.map((p,i) => <EspnPenaltyRow key={i} play={p} away={away} home={home}/>)}
        </div>
      )}

      {/* Stats */}
      {activeTab === 'stats' && (
        <div className="nhl-gc-body">
          <div className="nhl-gc-stat-rows" style={{padding:'14px'}}>
            {statRows.map(row => (
              <div key={row.label} className="nhl-gc-stat-row">
                <span className="nhl-gc-stat-val nhl-gc-stat-away">{row.away}</span>
                <span className="nhl-gc-stat-label" style={{flex:1,textAlign:'center',fontSize:11}}>{row.label}</span>
                <span className="nhl-gc-stat-val nhl-gc-stat-home">{row.home}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── ESPN play sub-components ───────────────────────── */
const PLAY_ICONS = { 'Goal':'🚨', 'Penalty':'🟡', 'Shot':'🎯', 'Blocked':'🛡', 'Missed':'💨', 'Hit':'💥', 'Face Off':'⭕', 'Giveaway':'↓', 'Takeaway':'↑' };

function EspnGoalRow({ play, away, home, navigate, sport }) {
  const isHome = play.team?.id === home.team?.id;
  const teamAbb = isHome ? home.team?.abbreviation : away.team?.abbreviation;
  const scorer = play.participants?.[0]?.athlete;
  const headshot = scorer?.headshot?.href || scorer?.headshot;
  const espnId = scorer?.id;

  return (
    <div className="nhl-goal-row">
      <div className="nhl-goal-icon">🚨</div>
      <div className="nhl-goal-info">
        <div className="nhl-goal-scorer" style={{gap:8}}>
          {headshot && (
            <img src={headshot} alt="" className="nhl-gc-goal-headshot"
              style={{cursor:espnId?'pointer':'default'}}
              onClick={()=>espnId&&navigate(`/player/${sport}/${espnId}`)}
              onError={e=>e.target.style.display='none'}/>
          )}
          <div>
            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              <span className="nhl-goal-team">{teamAbb}</span>
              <span className="nhl-goal-name" style={{cursor:espnId?'pointer':'default'}} onClick={()=>espnId&&navigate(`/player/${sport}/${espnId}`)}>
                {scorer?.displayName || 'Unknown'}
              </span>
            </div>
            <div className="nhl-goal-assists" style={{marginTop:2}}>{play.text?.includes('assists:') ? 'Assists: '+play.text.split('assists:')[1].trim() : ''}</div>
            <div className="nhl-goal-meta">{play.period?.displayValue} · {play.clock?.displayValue}</div>
          </div>
        </div>
      </div>
      <div className="nhl-goal-score">{play.awayScore}–{play.homeScore}</div>
    </div>
  );
}

function EspnPenaltyRow({ play, away, home }) {
  const isHome = play.team?.id === home.team?.id;
  const teamAbb = isHome ? home.team?.abbreviation : away.team?.abbreviation;
  const penaltyPlayer = play.participants?.[0]?.athlete;
  return (
    <div className="nhl-penalty-row">
      <span className="nhl-penalty-icon">🟡</span>
      <div className="nhl-penalty-info">
        <div className="nhl-penalty-name">
          <span className="nhl-goal-team">{teamAbb}</span>
          {penaltyPlayer && <span>{penaltyPlayer.shortName || penaltyPlayer.displayName}</span>}
        </div>
        <div className="nhl-penalty-desc">{play.type?.text}{play.type?.penaltyMinutes ? ` · ${play.type.penaltyMinutes} min` : ''}</div>
        <div className="nhl-goal-meta">{play.period?.displayValue} · {play.clock?.displayValue}</div>
      </div>
    </div>
  );
}

function EspnEventRow({ play, away, home, navigate, sport }) {
  const isHome = play.team?.id === home.team?.id;
  const teamAbb = isHome ? home.team?.abbreviation : (play.team?.id ? away.team?.abbreviation : '');
  const icon = PLAY_ICONS[play.type?.text] || '·';
  const athlete = play.participants?.[0]?.athlete;
  const espnId = athlete?.id;

  return (
    <div className={`nhl-event-row${isHome?' nhl-event-home':' nhl-event-away'}`}>
      <span className="nhl-event-icon">{icon}</span>
      <div className="nhl-event-info">
        <div className="nhl-event-desc">
          {teamAbb && <span className="nhl-goal-team" style={{marginRight:4}}>{teamAbb}</span>}
          <span style={{cursor:espnId?'pointer':'default'}} onClick={()=>espnId&&navigate(`/player/${sport}/${espnId}`)}>{play.text}</span>
        </div>
        <div className="nhl-event-meta">{play.period?.displayValue} · {play.clock?.displayValue}</div>
      </div>
      {play.type?.text==='Goal' && <span className="nhl-goal-score">{play.awayScore}–{play.homeScore}</span>}
    </div>
  );
}

/* ─── Demo mode: render NHL API static JSON ──────────── */
function NhlDemoGamecast({ data, navigate }) {
  const [activeTab, setActiveTab] = useState('gamecast');
  const away = data.awayTeam || {};
  const home = data.homeTeam || {};
  const period = data.periodDescriptor?.number || 3;
  const pType  = data.periodDescriptor?.periodType || 'REG';
  const isFinal = data.gameState === 'OFF';
  const plays  = data.plays || [];
  const roster = data.rosterSpots || [];
  const playerMap = {};
  for (const p of roster) playerMap[p.playerId] = p;
  const pName = (id) => {
    const p = playerMap[id]; return p ? `${p.firstName?.default} ${p.lastName?.default}` : '';
  };
  const goals = plays.filter(p => p.typeDescKey === 'goal');
  const penalties = plays.filter(p => p.typeDescKey === 'penalty');
  const goalsByPeriod = {};
  for (const g of goals) { const p = g.periodDescriptor?.number||1; if(!goalsByPeriod[p])goalsByPeriod[p]=[]; goalsByPeriod[p].push(g); }

  const awayColor = tc(away.abbrev); const homeColor = tc(home.abbrev);
  const periodDisplay = pType === 'OT' ? 'OT' : pType === 'SO' ? 'SO' : `${['','1st','2nd','3rd'][period]||`P${period}`}`;
  const statusStr = isFinal ? `FINAL` : `${periodDisplay} · ${data.clock?.timeRemaining || ''}`;
  const awaySOG = away.sog || 0; const homeSOG = home.sog || 0;

  const tabs = [
    {id:'gamecast',label:'Gamecast'},{id:'goals',label:`Goals (${goals.length})`},
    {id:'plays',label:'Play-by-Play'},{id:'penalties',label:`Penalties (${penalties.length})`},
  ];

  return (
    <div className="nhl-gc">
      <div className="nhl-gc-header" style={{background:`linear-gradient(135deg,color-mix(in srgb,${awayColor} 20%,var(--bg2)) 0%,var(--bg2) 50%,color-mix(in srgb,${homeColor} 20%,var(--bg2)) 100%)`}}>
        <div style={{textAlign:'center',fontSize:10,color:'var(--text2)',marginBottom:4,letterSpacing:'0.5px',textTransform:'uppercase',fontWeight:700}}>
          DEMO · 2026 Stanley Cup Final · Game 6
        </div>
        <div className="nhl-gc-scoreline">
          <div className="nhl-gc-team">
            <img src={away.logo} alt={away.abbrev} className="nhl-gc-logo" onError={e=>e.target.style.display='none'}/>
            <div className="nhl-gc-team-name">{away.abbrev}</div>
          </div>
          <div className="nhl-gc-center">
            <div className="nhl-gc-scores">
              <span className={`nhl-gc-score${isFinal&&away.score>home.score?' nhl-gc-score-win':''}`}>{away.score??0}</span>
              <span className="nhl-gc-score-sep">–</span>
              <span className={`nhl-gc-score${isFinal&&home.score>away.score?' nhl-gc-score-win':''}`}>{home.score??0}</span>
            </div>
            <div className="nhl-gc-status">{statusStr}</div>
          </div>
          <div className="nhl-gc-team">
            <img src={home.logo} alt={home.abbrev} className="nhl-gc-logo" onError={e=>e.target.style.display='none'}/>
            <div className="nhl-gc-team-name">{home.abbrev}</div>
          </div>
        </div>
        <div className="nhl-gc-sog-bar">
          <span className="nhl-gc-sog-val">{awaySOG}</span><span className="nhl-gc-sog-lbl">Shots</span><span className="nhl-gc-sog-val">{homeSOG}</span>
        </div>
      </div>
      <div className="nhl-gc-tabs">{tabs.map(t=><button key={t.id} className={`nhl-gc-tab${activeTab===t.id?' nhl-gc-tab-active':''}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>)}</div>

      {activeTab==='gamecast' && (
        <div className="nhl-gc-body">
          <div className="nhl-gc-stat-rows">
            {[{label:'Shots',a:awaySOG,h:homeSOG},{label:'Goals',a:away.score??0,h:home.score??0},{label:'Penalties',a:penalties.filter(p=>p.details?.eventOwnerTeamId===away.id).length,h:penalties.filter(p=>p.details?.eventOwnerTeamId===home.id).length}].map(r=>(
              <div key={r.label} className="nhl-gc-stat-row">
                <span className="nhl-gc-stat-val nhl-gc-stat-away">{r.a}</span>
                <div className="nhl-gc-stat-bar-wrap">
                  <div className="nhl-gc-stat-bar" style={{width:r.a+r.h>0?`${r.a/(r.a+r.h)*100}%`:'50%',background:awayColor}}/>
                  <span className="nhl-gc-stat-label">{r.label}</span>
                  <div className="nhl-gc-stat-bar" style={{width:r.a+r.h>0?`${r.h/(r.a+r.h)*100}%`:'50%',background:homeColor}}/>
                </div>
                <span className="nhl-gc-stat-val nhl-gc-stat-home">{r.h}</span>
              </div>
            ))}
          </div>
          {goals.length>0&&<div className="nhl-gc-section"><div className="nhl-gc-section-title">Goals</div>{goals.map((g,i)=><NhlApiGoalRow key={i} goal={g} away={away} home={home} pName={pName}/>)}</div>}
          {penalties.length>0&&<div className="nhl-gc-section"><div className="nhl-gc-section-title">Recent Penalties</div>{penalties.slice(-4).reverse().map((p,i)=><NhlApiPenaltyRow key={i} penalty={p} away={away} home={home}/>)}</div>}
        </div>
      )}
      {activeTab==='goals'&&(
        <div className="nhl-gc-body">
          {Object.entries(goalsByPeriod).map(([p,gs])=>(
            <div key={p} className="nhl-gc-section">
              <div className="nhl-gc-section-title">{['','1st','2nd','3rd'][parseInt(p)]||`P${p}`} Period</div>
              {gs.map((g,i)=><NhlApiGoalRow key={i} goal={g} away={away} home={home} pName={pName}/>)}
            </div>
          ))}
        </div>
      )}
      {activeTab==='plays'&&(
        <div className="nhl-gc-body">
          <div className="nhl-gc-event-feed">
            {[...plays].reverse().filter(e=>!['period-start','game-start'].includes(e.typeDescKey)).map((e,i)=>{
              const isAway = e.details?.eventOwnerTeamId===away.id;
              const team = isAway?away.abbrev:home.abbrev;
              const icon = {'goal':'🚨','penalty':'🟡','shot-on-goal':'🎯','blocked-shot':'🛡','missed-shot':'💨','hit':'💥','faceoff':'⭕','giveaway':'↓','takeaway':'↑','period-end':'🔔','game-end':'🏒'}[e.typeDescKey]||'·';
              const desc = formatNhlApiEvent(e, pName, away.abbrev, home.abbrev);
              if (!desc) return null;
              return (
                <div key={i} className={`nhl-event-row${isAway?' nhl-event-away':' nhl-event-home'}`}>
                  <span className="nhl-event-icon">{icon}</span>
                  <div className="nhl-event-info">
                    <div className="nhl-event-desc">{desc}</div>
                    <div className="nhl-event-meta">{['','1st','2nd','3rd'][e.periodDescriptor?.number]||`P${e.periodDescriptor?.number}`} · {e.timeInPeriod}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {activeTab==='penalties'&&(
        <div className="nhl-gc-body">
          {penalties.length===0&&<div className="nhl-gc-empty">No penalties.</div>}
          {penalties.map((p,i)=><NhlApiPenaltyRow key={i} penalty={p} away={away} home={home}/>)}
        </div>
      )}
    </div>
  );
}

function NhlApiGoalRow({ goal, away, home, pName }) {
  const isAway = goal.details?.eventOwnerTeamId===away.id;
  const teamAbb = isAway?away.abbrev:home.abbrev;
  const scorer = pName(goal.details?.scoringPlayerId);
  const a1 = pName(goal.details?.assist1PlayerId);
  const a2 = pName(goal.details?.assist2PlayerId);
  const headshot = `https://assets.nhle.com/mugs/nhl/20252026/${teamAbb}/${goal.details?.scoringPlayerId}.png`;
  return (
    <div className="nhl-goal-row">
      <div className="nhl-goal-icon">🚨</div>
      <div className="nhl-goal-info">
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <img src={headshot} alt="" className="nhl-gc-goal-headshot" onError={e=>e.target.style.display='none'}/>
          <div>
            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              <span className="nhl-goal-team">{teamAbb}</span>
              <span className="nhl-goal-name">{scorer}</span>
              {goal.details?.scoringPlayerTotal&&<span style={{fontSize:10,color:'var(--text2)'}}>({goal.details.scoringPlayerTotal})</span>}
            </div>
            {(a1||a2)&&<div className="nhl-goal-assists">Assists: {[a1,a2].filter(Boolean).join(', ')}</div>}
            <div className="nhl-goal-meta">{['','1st','2nd','3rd'][goal.periodDescriptor?.number]||`P${goal.periodDescriptor?.number}`} · {goal.timeInPeriod}</div>
          </div>
        </div>
      </div>
      <div className="nhl-goal-score">{goal.details?.awayScore}–{goal.details?.homeScore}</div>
    </div>
  );
}

function NhlApiPenaltyRow({ penalty, away, home }) {
  const isAway = penalty.details?.eventOwnerTeamId===away.id;
  const teamAbb = isAway?away.abbrev:home.abbrev;
  return (
    <div className="nhl-penalty-row">
      <span className="nhl-penalty-icon">🟡</span>
      <div className="nhl-penalty-info">
        <div className="nhl-penalty-name"><span className="nhl-goal-team">{teamAbb}</span></div>
        <div className="nhl-penalty-desc">{(penalty.details?.descKey||'').replace(/-/g,' ')}{penalty.details?.duration?` · ${penalty.details.duration} min`:''}</div>
        <div className="nhl-goal-meta">{['','1st','2nd','3rd'][penalty.periodDescriptor?.number]||`P${penalty.periodDescriptor?.number}`} · {penalty.timeInPeriod}</div>
      </div>
    </div>
  );
}

function formatNhlApiEvent(e, pName, awayAbb, homeAbb) {
  const d = e.details||{};
  const isAway = e.details?.eventOwnerTeamId !== undefined;
  const team = awayAbb;
  switch(e.typeDescKey) {
    case 'goal': return `🚨 GOAL – ${pName(d.scoringPlayerId)}`;
    case 'shot-on-goal': return `${awayAbb} shot – ${pName(d.shootingPlayerId)} (${d.shotType||''})`;
    case 'penalty': return `🟡 Penalty – ${(d.descKey||'').replace(/-/g,' ')} ${d.duration?`(${d.duration}min)`:''}`;
    case 'hit': return `Hit – ${pName(d.hittingPlayerId)} on ${pName(d.hitteePlayerId)}`;
    case 'faceoff': return `Faceoff – ${pName(d.winningPlayerId)} wins`;
    case 'blocked-shot': return `Blocked – ${pName(d.blockingPlayerId)}`;
    case 'missed-shot': return `Missed shot – ${pName(d.shootingPlayerId)}`;
    case 'giveaway': return `Giveaway – ${pName(d.playerId)}`;
    case 'takeaway': return `Takeaway – ${pName(d.playerId)}`;
    case 'period-end': return `End of period ${e.periodDescriptor?.number}`;
    case 'game-end': return `Game Over`;
    default: return null;
  }
}

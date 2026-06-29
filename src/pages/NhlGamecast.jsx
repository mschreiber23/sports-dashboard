import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useNhlLiveFeed, { findNhlGameId, periodLabel, strengthLabel, parseSitCode } from '../hooks/useNhlLiveFeed';

/* ── Helpers ─────────────────────────────────────────── */
function teamColor(abbrev) {
  const colors = {
    BOS:'#FFB81C',TOR:'#003E7E',MTL:'#AF1E2D',OTT:'#C52032',BUF:'#003087',DET:'#CE1126',
    FLA:'#041E42',TBL:'#002868',CBJ:'#002654',CAR:'#CC0000',WSH:'#041E42',PIT:'#FCB514',
    PHI:'#F74902',NYR:'#0038A8',NYI:'#003087',NJD:'#CE1126',
    CHI:'#CF0A2C',STL:'#002F87',NSH:'#FFB81C',MIL:'#041E42',MIN:'#154734',WPG:'#004C97',
    COL:'#6F263D',DAL:'#006847',ARI:'#8C2633',VGK:'#B4975A',SEA:'#99D9D9',
    VAN:'#00843D',CGY:'#C8102E',EDM:'#FF4C00',SJS:'#006D75',ANA:'#F47A38',LAK:'#A2AAAD',
  };
  return colors[abbrev] || '#0092ff';
}

/* ── Ice Rink SVG for shot map ───────────────────────── */
function IceRink({ shots, awayTeamId, homeTeamId, awayAbbrev, homeAbbrev }) {
  const W = 400, H = 170;
  // Rink scale: real ice 200ft × 85ft → SVG 400×170
  const sx = (x) => (x + 100) / 200 * W;
  const sy = (y) => (y + 42.5) / 85 * H;

  return (
    <div className="nhl-shot-map-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="nhl-shot-map">
        {/* Ice surface */}
        <rect x="0" y="0" width={W} height={H} fill="#0a1628" rx="8" />
        {/* Rink outline */}
        <rect x="2" y="2" width={W-4} height={H-4} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" rx="6" />
        {/* Center line */}
        <line x1={W/2} y1="2" x2={W/2} y2={H-2} stroke="rgba(255,0,0,0.4)" strokeWidth="2" />
        {/* Blue lines */}
        <line x1={W*0.25} y1="2" x2={W*0.25} y2={H-2} stroke="rgba(0,100,255,0.5)" strokeWidth="1.5" />
        <line x1={W*0.75} y1="2" x2={W*0.75} y2={H-2} stroke="rgba(0,100,255,0.5)" strokeWidth="1.5" />
        {/* Goal creases */}
        <ellipse cx={W*0.05} cy={H/2} rx="14" ry="10" fill="rgba(0,120,255,0.15)" stroke="rgba(0,120,255,0.4)" strokeWidth="1" />
        <ellipse cx={W*0.95} cy={H/2} rx="14" ry="10" fill="rgba(0,120,255,0.15)" stroke="rgba(0,120,255,0.4)" strokeWidth="1" />
        {/* Face-off dots */}
        {[
          [0.2, 0.25], [0.2, 0.75], [0.8, 0.25], [0.8, 0.75],
          [0.5, 0.5],
        ].map(([fx, fy], i) => (
          <circle key={i} cx={fx*W} cy={fy*H} r="3" fill="rgba(255,255,255,0.3)" />
        ))}
        {/* Team labels */}
        <text x={W*0.12} y={H-6} fill="rgba(255,255,255,0.4)" fontSize="9" textAnchor="middle">{awayAbbrev}</text>
        <text x={W*0.88} y={H-6} fill="rgba(255,255,255,0.4)" fontSize="9" textAnchor="middle">{homeAbbrev}</text>
        {/* Shots */}
        {shots.map((s, i) => {
          const isAway = s.teamId === awayTeamId;
          // Normalize: away always shoots left (negative x), home shoots right (positive x)
          const nx = isAway ? (s.x > 0 ? -s.x : s.x) : (s.x < 0 ? -s.x : s.x);
          const cx = sx(nx), cy = sy(s.y);
          const isGoal = s.type === 'goal';
          const color = isAway ? '#4fc3f7' : '#ef9a9a';
          return (
            <circle key={i} cx={cx} cy={cy} r={isGoal ? 5 : 3}
              fill={isGoal ? color : 'none'} stroke={color}
              strokeWidth={isGoal ? 2 : 1} opacity={isGoal ? 1 : 0.6} />
          );
        })}
      </svg>
      <div className="nhl-shot-legend">
        <span><span className="nhl-shot-dot" style={{background:'#4fc3f7'}}/>{awayAbbrev}</span>
        <span><span className="nhl-shot-dot" style={{background:'#ef9a9a'}}/>{homeAbbrev}</span>
        <span className="nhl-shot-legend-note">● = goal, ○ = shot</span>
      </div>
    </div>
  );
}

/* ── Event icons ─────────────────────────────────────── */
const EVENT_ICONS = {
  'goal': '🚨', 'penalty': '🟡', 'shot-on-goal': '🎯', 'blocked-shot': '🛡',
  'missed-shot': '💨', 'hit': '💥', 'faceoff': '⭕', 'giveaway': '↓', 'takeaway': '↑',
  'stoppage': '⏸', 'period-start': '🏒', 'period-end': '🔔',
};

/* ── Main NhlGamecast component ──────────────────────── */
export default function NhlGamecast({ espnGame, sport }) {
  const navigate = useNavigate();
  const [nhlGameId, setNhlGameId] = useState(null);
  const [activeTab, setActiveTab] = useState('gamecast');
  const [eventFilter, setEventFilter] = useState('all');

  useEffect(() => {
    if (!espnGame) return;
    findNhlGameId(espnGame).then(id => { if (id) setNhlGameId(id); });
  }, [espnGame?.id]);

  const feed = useNhlLiveFeed(nhlGameId);

  if (!feed) return (
    <div className="nhl-gc-loading">
      <div className="loading-text">Loading NHL data…</div>
    </div>
  );

  const { away, home, period, periodType, clock, isLive, isFinal, isPre,
    sitCode, ppTeam, ppTimeRemaining, emptyNet, goals, penalties, shots,
    events, plays, playerMap, playerName, broadcast, venue, seriesStatus } = feed;

  const awayColor = teamColor(away.abbrev);
  const homeColor = teamColor(home.abbrev);

  // Period label
  const pLabel = periodLabel(period, periodType);
  const statusStr = isFinal ? `FINAL${periodType !== 'REG' ? ` (${pLabel})` : ''}`
    : isLive ? `${pLabel} · ${clock.timeRemaining}`
    : 'UPCOMING';

  // Goals by period
  const goalsByPeriod = {};
  for (const g of goals) {
    const p = g.periodDescriptor?.number || 1;
    if (!goalsByPeriod[p]) goalsByPeriod[p] = [];
    goalsByPeriod[p].push(g);
  }

  // Strength display
  const sit = parseSitCode(sitCode);
  const showStrength = isLive && sit && (sit.awaySkaters !== sit.homeSkaters || !sit.awayGoalie || !sit.homeGoalie);
  const strengthStr = showStrength ? strengthLabel(sitCode) : null;

  // Stat categories from plays
  const awaySOG = away.sog ?? shots.filter(s => s.teamId === away.id && ['shot-on-goal','goal'].includes(s.type)).length;
  const homeSOG = home.sog ?? shots.filter(s => s.teamId === home.id && ['shot-on-goal','goal'].includes(s.type)).length;

  // Event feed filter
  const filterTypes = {
    all: null,
    goals: ['goal'],
    penalties: ['penalty'],
    shots: ['shot-on-goal', 'missed-shot', 'blocked-shot'],
    hits: ['hit'],
  };
  const filteredEvents = filterTypes[eventFilter]
    ? events.filter(e => filterTypes[eventFilter].includes(e.typeDescKey))
    : events.filter(e => !['period-start', 'game-start'].includes(e.typeDescKey));

  const tabs = [
    { id: 'gamecast', label: 'Gamecast' },
    { id: 'goals', label: 'Goals' },
    { id: 'shots', label: 'Shot Map' },
    { id: 'plays', label: 'Play-by-Play' },
    { id: 'penalties', label: 'Penalties' },
  ];

  return (
    <div className="nhl-gc">
      {/* ── Score Header ── */}
      <div className="nhl-gc-header" style={{
        background: `linear-gradient(135deg, color-mix(in srgb,${awayColor} 20%,var(--bg2)) 0%, var(--bg2) 50%, color-mix(in srgb,${homeColor} 20%,var(--bg2)) 100%)`
      }}>
        {seriesStatus && (
          <div className="nhl-gc-series">{seriesStatus.seriesTitle} · {seriesStatus.topSeedTeamAbbrev} leads {seriesStatus.topSeedWins}-{seriesStatus.bottomSeedWins}</div>
        )}
        <div className="nhl-gc-scoreline">
          {/* Away */}
          <div className="nhl-gc-team nhl-gc-away">
            <img src={away.logo} alt={away.abbrev} className="nhl-gc-logo" onError={e=>e.target.style.display='none'} />
            <div className="nhl-gc-team-name">{away.abbrev}</div>
          </div>
          {/* Score + status */}
          <div className="nhl-gc-center">
            <div className="nhl-gc-scores">
              <span className={`nhl-gc-score ${isFinal && away.score > home.score ? 'nhl-gc-score-win' : ''}`}>{away.score ?? 0}</span>
              <span className="nhl-gc-score-sep">–</span>
              <span className={`nhl-gc-score ${isFinal && home.score > away.score ? 'nhl-gc-score-win' : ''}`}>{home.score ?? 0}</span>
            </div>
            <div className={`nhl-gc-status ${isLive ? 'nhl-gc-live' : ''}`}>
              {isLive && <span className="live-dot" style={{marginRight:4}}/>}
              {statusStr}
            </div>
            {strengthStr && (
              <div className="nhl-gc-strength">{strengthStr}{ppTimeRemaining ? ` · ${ppTimeRemaining}` : ''}</div>
            )}
            {emptyNet && <div className="nhl-gc-en">{emptyNet} Empty Net</div>}
            {broadcast && <div className="nhl-gc-broadcast">{broadcast}</div>}
          </div>
          {/* Home */}
          <div className="nhl-gc-team nhl-gc-home">
            <img src={home.logo} alt={home.abbrev} className="nhl-gc-logo" onError={e=>e.target.style.display='none'} />
            <div className="nhl-gc-team-name">{home.abbrev}</div>
          </div>
        </div>
        {/* SOG bar */}
        <div className="nhl-gc-sog-bar">
          <span className="nhl-gc-sog-val">{awaySOG}</span>
          <span className="nhl-gc-sog-lbl">Shots</span>
          <span className="nhl-gc-sog-val">{homeSOG}</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="nhl-gc-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`nhl-gc-tab ${activeTab === t.id ? 'nhl-gc-tab-active' : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── Gamecast ── */}
      {activeTab === 'gamecast' && (
        <div className="nhl-gc-body">
          {/* Period stats comparison */}
          <div className="nhl-gc-stat-rows">
            {[
              { label: 'Shots', away: awaySOG, home: homeSOG },
              { label: 'Goals', away: away.score ?? 0, home: home.score ?? 0 },
              { label: 'Penalties', away: penalties.filter(p => p.teamId === away.id).length, home: penalties.filter(p => p.teamId === home.id).length },
            ].map(row => (
              <div key={row.label} className="nhl-gc-stat-row">
                <span className="nhl-gc-stat-val nhl-gc-stat-away">{row.away}</span>
                <div className="nhl-gc-stat-bar-wrap">
                  <div className="nhl-gc-stat-bar nhl-gc-stat-bar-away" style={{
                    width: row.away + row.home > 0 ? `${row.away / (row.away + row.home) * 100}%` : '50%',
                    background: awayColor,
                  }}/>
                  <span className="nhl-gc-stat-label">{row.label}</span>
                  <div className="nhl-gc-stat-bar nhl-gc-stat-bar-home" style={{
                    width: row.away + row.home > 0 ? `${row.home / (row.away + row.home) * 100}%` : '50%',
                    background: homeColor,
                  }}/>
                </div>
                <span className="nhl-gc-stat-val nhl-gc-stat-home">{row.home}</span>
              </div>
            ))}
          </div>

          {/* Recent goals */}
          {goals.length > 0 && (
            <div className="nhl-gc-section">
              <div className="nhl-gc-section-title">Goals</div>
              {goals.slice(-6).reverse().map((g, i) => (
                <GoalRow key={i} goal={g} away={away} home={home} playerName={playerName} />
              ))}
            </div>
          )}

          {/* Active penalties */}
          {isLive && penalties.length > 0 && (
            <div className="nhl-gc-section">
              <div className="nhl-gc-section-title">Recent Penalties</div>
              {penalties.slice(-4).reverse().map((p, i) => (
                <PenaltyRow key={i} penalty={p} away={away} home={home} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Goals tab ── */}
      {activeTab === 'goals' && (
        <div className="nhl-gc-body">
          {goals.length === 0 && <div className="nhl-gc-empty">No goals yet.</div>}
          {Object.entries(goalsByPeriod).map(([p, gs]) => (
            <div key={p} className="nhl-gc-section">
              <div className="nhl-gc-section-title">{periodLabel(parseInt(p), 'REG')} Period</div>
              {gs.map((g, i) => <GoalRow key={i} goal={g} away={away} home={home} playerName={playerName} />)}
            </div>
          ))}
        </div>
      )}

      {/* ── Shot Map tab ── */}
      {activeTab === 'shots' && (
        <div className="nhl-gc-body">
          <IceRink shots={shots} awayTeamId={away.id} homeTeamId={home.id} awayAbbrev={away.abbrev} homeAbbrev={home.abbrev} />
          <div className="nhl-gc-stat-rows" style={{marginTop:16}}>
            {['shot-on-goal','missed-shot','blocked-shot','goal'].map(type => {
              const label = type === 'shot-on-goal' ? 'Shots on Goal' : type === 'missed-shot' ? 'Missed Shots' : type === 'blocked-shot' ? 'Blocked Shots' : 'Goals';
              const awayN = shots.filter(s => s.type === type && s.teamId === away.id).length;
              const homeN = shots.filter(s => s.type === type && s.teamId === home.id).length;
              return (
                <div key={type} className="nhl-gc-stat-row">
                  <span className="nhl-gc-stat-val nhl-gc-stat-away">{awayN}</span>
                  <span className="nhl-gc-stat-label" style={{flex:1,textAlign:'center'}}>{label}</span>
                  <span className="nhl-gc-stat-val nhl-gc-stat-home">{homeN}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Play-by-Play tab ── */}
      {activeTab === 'plays' && (
        <div className="nhl-gc-body">
          <div className="nhl-gc-event-filters">
            {Object.keys(filterTypes).map(f => (
              <button key={f} className={`nhl-gc-filter-btn ${eventFilter === f ? 'nhl-gc-filter-active' : ''}`}
                onClick={() => setEventFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="nhl-gc-event-feed">
            {filteredEvents.map((e, i) => (
              <EventRow key={i} event={e} away={away} home={home} playerName={playerName} />
            ))}
            {filteredEvents.length === 0 && <div className="nhl-gc-empty">No events.</div>}
          </div>
        </div>
      )}

      {/* ── Penalties tab ── */}
      {activeTab === 'penalties' && (
        <div className="nhl-gc-body">
          {penalties.length === 0 && <div className="nhl-gc-empty">No penalties.</div>}
          {penalties.map((p, i) => <PenaltyRow key={i} penalty={p} away={away} home={home} />)}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────── */
function GoalRow({ goal, away, home, playerName }) {
  const isAway = goal.teamId === away.id;
  const teamAbbrev = isAway ? away.abbrev : home.abbrev;
  const scorer = goal.scorerName || playerName(goal.details?.scoringPlayerId);
  const a1 = goal.assist1Name || playerName(goal.details?.assist1PlayerId);
  const a2 = goal.assist2Name || playerName(goal.details?.assist2PlayerId);
  const scorerTotal = goal.details?.scoringPlayerTotal;
  const pLabel = periodLabel(goal.periodDescriptor?.number, goal.periodDescriptor?.periodType);
  const sit = parseSitCode(goal.situationCode);
  const strength = sit && (sit.awaySkaters !== sit.homeSkaters || !sit.awayGoalie || !sit.homeGoalie)
    ? (goal.situationCode === '1560' || goal.situationCode === '0651' ? 'EN' : 'PP') : 'EV';
  const awayScore = goal.details?.awayScore ?? 0;
  const homeScore = goal.details?.homeScore ?? 0;

  return (
    <div className="nhl-goal-row">
      <div className="nhl-goal-icon">🚨</div>
      <div className="nhl-goal-info">
        <div className="nhl-goal-scorer">
          <span className="nhl-goal-team">{teamAbbrev}</span>
          <span className="nhl-goal-name">{scorer}{scorerTotal ? ` (${scorerTotal})` : ''}</span>
          {strength !== 'EV' && <span className={`nhl-strength-tag nhl-strength-${strength.toLowerCase()}`}>{strength}</span>}
        </div>
        {(a1 || a2) && (
          <div className="nhl-goal-assists">Assists: {[a1, a2].filter(Boolean).join(', ')}</div>
        )}
        <div className="nhl-goal-meta">{pLabel} · {goal.timeInPeriod}</div>
      </div>
      <div className="nhl-goal-score">{awayScore}–{homeScore}</div>
    </div>
  );
}

function PenaltyRow({ penalty, away, home }) {
  const isAway = penalty.teamId === away.id;
  const teamAbbrev = isAway ? away.abbrev : home.abbrev;
  const pLabel = periodLabel(penalty.periodDescriptor?.number, penalty.periodDescriptor?.periodType);
  const desc = penalty.desc?.replace(/-/g, ' ') || 'Penalty';

  return (
    <div className="nhl-penalty-row">
      <span className="nhl-penalty-icon">🟡</span>
      <div className="nhl-penalty-info">
        <div className="nhl-penalty-name">
          <span className="nhl-goal-team">{teamAbbrev}</span>
          {penalty.playerName && <span>{penalty.playerName}</span>}
        </div>
        <div className="nhl-penalty-desc">{desc}{penalty.duration ? ` · ${penalty.duration} min` : ''}</div>
        <div className="nhl-goal-meta">{pLabel} · {penalty.timeInPeriod}</div>
      </div>
    </div>
  );
}

function EventRow({ event, away, home, playerName }) {
  const isAway = event.details?.eventOwnerTeamId === away.id;
  const icon = EVENT_ICONS[event.typeDescKey] || '·';
  const pLabel = periodLabel(event.periodDescriptor?.number, event.periodDescriptor?.periodType);
  const desc = formatEventDesc(event, playerName, away, home);

  if (!desc) return null;

  return (
    <div className={`nhl-event-row ${isAway ? 'nhl-event-away' : 'nhl-event-home'}`}>
      <span className="nhl-event-icon">{icon}</span>
      <div className="nhl-event-info">
        <div className="nhl-event-desc">{desc}</div>
        <div className="nhl-event-meta">{pLabel} · {event.timeInPeriod}</div>
      </div>
    </div>
  );
}

function formatEventDesc(e, playerName, away, home) {
  const d = e.details || {};
  const isAway = d.eventOwnerTeamId === away.id;
  const team = isAway ? away.abbrev : home.abbrev;
  switch (e.typeDescKey) {
    case 'goal':
      return `🚨 ${team} GOAL – ${playerName(d.scoringPlayerId)}`;
    case 'shot-on-goal':
      return `${team} shot on goal – ${playerName(d.shootingPlayerId)} (${d.shotType || ''})`;
    case 'missed-shot':
      return `${team} missed shot – ${playerName(d.shootingPlayerId)}`;
    case 'blocked-shot':
      return `${team} shot blocked by ${playerName(d.blockingPlayerId)}`;
    case 'penalty':
      return `🟡 ${team} penalty – ${playerName(d.committedByPlayerId)} · ${(d.descKey || '').replace(/-/g, ' ')} (${d.duration || 2} min)`;
    case 'hit':
      return `${team} hit – ${playerName(d.hittingPlayerId)} on ${playerName(d.hitteePlayerId)}`;
    case 'faceoff':
      return `Faceoff – ${team} win (${playerName(d.winningPlayerId)})`;
    case 'giveaway':
      return `${team} giveaway – ${playerName(d.playerId)}`;
    case 'takeaway':
      return `${team} takeaway – ${playerName(d.playerId)}`;
    case 'period-end':
      return `End of ${periodLabel(e.periodDescriptor?.number, e.periodDescriptor?.periodType)} Period`;
    case 'game-end':
      return `Game Over`;
    default:
      return null;
  }
}

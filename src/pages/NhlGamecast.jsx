import { useState, useEffect } from 'react';
import useNhlLiveFeed, { findNhlGameId, periodLabel } from '../hooks/useNhlLiveFeed';

/* ─── Play type badge config ─────────────────────────── */
const BADGES = {
  'shot-on-goal':  { label: 'SHOT ON GOAL',  bg: '#14532d', color: '#4ade80' },
  'blocked-shot':  { label: 'SHOT BLOCKED',  bg: '#7c2d12', color: '#fb923c' },
  'missed-shot':   { label: 'MISSED SHOT',   bg: '#1f2937', color: '#9ca3af' },
  'goal':          { label: 'GOAL',           bg: '#7f1d1d', color: '#f87171' },
  'hit':           { label: 'HIT',            bg: '#3b0764', color: '#c4b5fd' },
  'giveaway':      { label: 'GIVEAWAY',       bg: '#78350f', color: '#fbbf24' },
  'takeaway':      { label: 'TAKEAWAY',       bg: '#134e4a', color: '#2dd4bf' },
  'faceoff':       { label: 'FACE-OFF',       bg: '#1e3a5f', color: '#60a5fa' },
  'penalty':       { label: 'PENALTY',        bg: '#7f1d1d', color: '#fbbf24' },
};

/* ─── Describe a play from NHL API data ──────────────── */
function describePlay(play, playerName) {
  const d = play.details || {};
  switch (play.typeDescKey) {
    case 'shot-on-goal': {
      const shooter = playerName(d.shootingPlayerId);
      const goalie  = playerName(d.goalieInNetId);
      return `${shooter}${d.shotType ? ` ${d.shotType}` : ''} saved${goalie ? ` by ${goalie}` : ''}`;
    }
    case 'goal': {
      const scorer = playerName(d.scoringPlayerId);
      const a1 = playerName(d.assist1PlayerId);
      const a2 = playerName(d.assist2PlayerId);
      const assists = [a1, a2].filter(Boolean);
      return `${scorer} (${d.scoringPlayerTotal || 1})${assists.length ? ` · Assists: ${assists.join(', ')}` : ''}`;
    }
    case 'blocked-shot': {
      const shooter = playerName(d.shootingPlayerId);
      const blocker = playerName(d.blockingPlayerId);
      return `${shooter} shot blocked by ${blocker}`;
    }
    case 'missed-shot': {
      const shooter = playerName(d.shootingPlayerId);
      const goalie  = playerName(d.goalieInNetId);
      return `${shooter} shot misses${goalie ? ` on ${goalie}` : ''}`;
    }
    case 'hit': {
      const hitter = playerName(d.hittingPlayerId);
      const hittee = playerName(d.hitteePlayerId);
      return `${hitter} hit on ${hittee}`;
    }
    case 'faceoff': {
      const winner = playerName(d.winningPlayerId);
      const loser  = playerName(d.losingPlayerId);
      return `${winner} faceoff won against ${loser}`;
    }
    case 'giveaway': return `${playerName(d.playerId)} giveaway`;
    case 'takeaway': return `${playerName(d.playerId)} takeaway`;
    case 'penalty': {
      const pl = playerName(d.committedByPlayerId);
      const type = (d.descKey || '').replace(/-/g, ' ');
      return `${pl} – ${type}${d.duration ? ` (${d.duration} min)` : ''}`;
    }
    case 'stoppage': return (d.reason || 'Stoppage').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    case 'period-start': return `Start of ${periodLabel(play.periodDescriptor?.number, play.periodDescriptor?.periodType)} Period`;
    case 'period-end':   return `End of ${periodLabel(play.periodDescriptor?.number, play.periodDescriptor?.periodType)} Period`;
    case 'game-end':     return 'Game Over';
    default: return (play.typeDescKey || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

/* ─── Ice Rink SVG ───────────────────────────────────── */
function IceRink({ homeLogo, awayLogo, lastPlay, away, home }) {
  const W = 500, H = 210;
  const rx = 54, ry = 54; // corner radius
  const goalLineX = [48, W - 48];
  const blueX = [148, W - 148];

  return (
    <div className="nhl-rink-outer">
      <div className="nhl-rink-perspective">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg">
          {/* Ice surface */}
          <rect x={1} y={1} width={W - 2} height={H - 2} rx={rx} ry={ry} fill="#e8f4fb" stroke="#b0cde0" strokeWidth={2} />

          {/* Blue lines */}
          {blueX.map(x => (
            <line key={x} x1={x} y1={ry * 0.5} x2={x} y2={H - ry * 0.5} stroke="#0038a8" strokeWidth={4} />
          ))}

          {/* Red center line */}
          <line x1={W / 2} y1={ry * 0.5} x2={W / 2} y2={H - ry * 0.5} stroke="#c8102e" strokeWidth={3} />

          {/* Goal lines */}
          {goalLineX.map(x => (
            <line key={x} x1={x} y1={H * 0.28} x2={x} y2={H * 0.72} stroke="#c8102e" strokeWidth={2} />
          ))}

          {/* Center circle */}
          <circle cx={W / 2} cy={H / 2} r={38} fill="none" stroke="#c8102e" strokeWidth={2} />
          <circle cx={W / 2} cy={H / 2} r={3} fill="#c8102e" />
          {/* Center faceoff dot */}

          {/* Zone faceoff circles */}
          {[
            [108, H * 0.3], [108, H * 0.7],
            [W - 108, H * 0.3], [W - 108, H * 0.7],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={26} fill="none" stroke="#c8102e" strokeWidth={1.5} />
          ))}

          {/* Goal creases */}
          <path d={`M${goalLineX[0]},${H*0.38} A20,20 0 0,0 ${goalLineX[0]},${H*0.62} L${goalLineX[0]-22},${H*0.62} L${goalLineX[0]-22},${H*0.38} Z`}
            fill="rgba(0,56,168,0.18)" stroke="#0038a8" strokeWidth={1.5} />
          <path d={`M${goalLineX[1]},${H*0.38} A20,20 0 0,1 ${goalLineX[1]},${H*0.62} L${goalLineX[1]+22},${H*0.62} L${goalLineX[1]+22},${H*0.38} Z`}
            fill="rgba(0,56,168,0.18)" stroke="#0038a8" strokeWidth={1.5} />

          {/* Away logo (left end zone) */}
          {awayLogo && <image href={awayLogo} x={8} y={H/2 - 24} width={48} height={48} opacity={0.6} />}

          {/* Home logo (center ice) */}
          {homeLogo && <image href={homeLogo} x={W/2 - 30} y={H/2 - 30} width={60} height={60} opacity={0.65} />}

          {/* Away logo right end zone */}
          {awayLogo && <image href={awayLogo} x={W - 56} y={H/2 - 24} width={48} height={48} opacity={0.6}
            transform={`scale(-1,1) translate(-${W}, 0)`} />}
        </svg>
      </div>
      {/* Last play overlay */}
      {lastPlay && (
        <div className="nhl-rink-last-play">
          <span className="nhl-rink-lp-period">
            {lastPlay.timeInPeriod} – {periodLabel(lastPlay.periodDescriptor?.number, lastPlay.periodDescriptor?.periodType)}
          </span>
          <span className="nhl-rink-lp-desc">{lastPlay._desc}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Recent play row (Gamecast tab) ─────────────────── */
function RecentPlayRow({ play, away, home }) {
  const isAway = play.details?.eventOwnerTeamId === away.id;
  const isHome = play.details?.eventOwnerTeamId === home.id;
  const team   = isHome ? home : (isAway ? away : null);
  const logo   = team ? (team.logo || `https://assets.nhle.com/logos/nhl/svg/${team.abbrev}_dark.svg`) : null;
  const pNum   = play.periodDescriptor?.number;
  const pType  = play.periodDescriptor?.periodType;
  const period = periodLabel(pNum, pType);

  const isGoal    = play.typeDescKey === 'goal';
  const isSpecial = !team && play.typeDescKey !== 'faceoff';

  return (
    <div className={`nhl-recent-row${isGoal ? ' nhl-recent-row-goal' : ''}${isSpecial ? ' nhl-recent-row-special' : ''}`}>
      <span className="nhl-recent-time">{play.timeInPeriod}</span>
      {logo
        ? <img src={logo} alt="" className="nhl-recent-logo" onError={e => e.target.style.display = 'none'} />
        : <span className="nhl-recent-logo-placeholder">🏒</span>}
      <span className="nhl-recent-desc">{play._desc}</span>
      {isGoal && (
        <span className="nhl-recent-score">{play.details?.awayScore ?? ''}–{play.details?.homeScore ?? ''}</span>
      )}
    </div>
  );
}

/* ─── PBP play row ───────────────────────────────────── */
function PbpRow({ play, away, home }) {
  const badge = BADGES[play.typeDescKey];
  const isAway = play.details?.eventOwnerTeamId === away.id;
  const isHome = play.details?.eventOwnerTeamId === home.id;
  const team   = isHome ? home : (isAway ? away : null);
  const logo   = team ? (team.logo || `https://assets.nhle.com/logos/nhl/svg/${team.abbrev}_dark.svg`) : null;
  const pNum   = play.periodDescriptor?.number;
  const pType  = play.periodDescriptor?.periodType;
  const period = (periodLabel(pNum, pType) + (pType === 'REG' ? '' : '')).toUpperCase();
  const isSpecial = !badge;

  if (isSpecial) {
    return (
      <div className="nhl-pbp-special">
        <span className="nhl-pbp-special-text">{play._desc}</span>
      </div>
    );
  }

  return (
    <div className="nhl-pbp-row">
      {logo
        ? <img src={logo} alt="" className="nhl-pbp-logo" onError={e => e.target.style.display = 'none'} />
        : <div className="nhl-pbp-logo-placeholder" />}
      <div className="nhl-pbp-body">
        <div className="nhl-pbp-meta-row">
          <span className="nhl-pbp-badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
          <span className="nhl-pbp-period">{period}</span>
          <span className="nhl-pbp-time">{play.timeInPeriod}</span>
          {play.typeDescKey === 'goal' && (
            <span className="nhl-pbp-score">{play.details?.awayScore}–{play.details?.homeScore}</span>
          )}
        </div>
        <div className="nhl-pbp-desc">{play._desc}</div>
      </div>
    </div>
  );
}

/* ─── Shared feed resolver ───────────────────────────── */
function useNhlFeed(espnGame) {
  const [nhlId, setNhlId] = useState(null);

  useEffect(() => {
    if (!espnGame) return;
    findNhlGameId(espnGame).then(id => { if (id) setNhlId(id); });
  }, [espnGame?.id || espnGame?.competitions?.[0]?.id]);

  const feed = useNhlLiveFeed(nhlId);
  return feed;
}

/* ─── Gamecast tab content ───────────────────────────── */
function GamecastContent({ feed }) {
  const { away, home, isLive, isFinal, periodLabel: pLbl, clock, goals, penalties, events, plays, playerName } = feed;

  const annotated = (arr) => arr.map(p => ({ ...p, _desc: describePlay(p, playerName) }));
  const recent = annotated([...plays].reverse()).filter(p =>
    !['period-start', 'game-start', 'game-end'].includes(p.typeDescKey)
  ).slice(0, 10);

  const lastPlay = recent[0] || null;

  const homeLogo = home.logo || `https://assets.nhle.com/logos/nhl/svg/${home.abbrev}_dark.svg`;
  const awayLogo = away.logo || `https://assets.nhle.com/logos/nhl/svg/${away.abbrev}_dark.svg`;

  return (
    <div className="nhl-gc-body">
      {/* Situation */}
      {isLive && (
        <div className="nhl-sit-bar">
          <span className="nhl-sit-period">{pLbl} · {clock.timeRemaining}</span>
          {feed.ppTeam && <span className="nhl-sit-pp">⚡ PP – {feed.ppTeam}</span>}
          {feed.emptyNet && <span className="nhl-sit-en">Empty Net – {feed.emptyNet}</span>}
        </div>
      )}

      {/* Ice rink */}
      <IceRink homeLogo={homeLogo} awayLogo={awayLogo} lastPlay={lastPlay} away={away} home={home} />

      {/* Recent plays */}
      {recent.length > 0 && (
        <div className="nhl-recent-plays">
          {recent.map((p, i) => (
            <RecentPlayRow key={p.eventId || i} play={p} away={away} home={home} />
          ))}
        </div>
      )}

      {/* Stats summary */}
      {(away.sog != null || home.sog != null) && (
        <div className="nhl-gc-stat-rows" style={{ padding: '10px 16px' }}>
          {[
            { label: 'Shots', a: away.sog || 0, h: home.sog || 0 },
            { label: 'Goals', a: away.score || 0, h: home.score || 0 },
          ].map(r => {
            const tot = r.a + r.h;
            return (
              <div key={r.label} className="nhl-gc-stat-row">
                <span className="nhl-gc-stat-val nhl-gc-stat-away">{r.a}</span>
                <div className="nhl-gc-stat-bar-wrap">
                  <div className="nhl-gc-stat-bar" style={{ width: tot > 0 ? `${r.a / tot * 100}%` : '50%', background: '#60a5fa' }} />
                  <span className="nhl-gc-stat-label">{r.label}</span>
                  <div className="nhl-gc-stat-bar" style={{ width: tot > 0 ? `${r.h / tot * 100}%` : '50%', background: '#f87171' }} />
                </div>
                <span className="nhl-gc-stat-val nhl-gc-stat-home">{r.h}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Play-by-Play tab content (exported for BoxScorePage) ── */
export function NhlPbpTab({ espnGame }) {
  const feed = useNhlFeed(espnGame);
  if (!feed) return <div className="tp-loading">Loading play-by-play…</div>;

  const { plays, away, home, playerName } = feed;

  const SHOW_KEYS = new Set([
    'shot-on-goal', 'goal', 'blocked-shot', 'missed-shot',
    'hit', 'faceoff', 'giveaway', 'takeaway', 'penalty',
    'stoppage', 'period-start', 'period-end',
  ]);

  const annotated = [...plays]
    .reverse()
    .filter(p => SHOW_KEYS.has(p.typeDescKey))
    .map(p => ({ ...p, _desc: describePlay(p, playerName) }));

  if (!annotated.length) return <div className="tp-loading">No plays yet.</div>;

  return (
    <div className="nhl-pbp-wrap">
      {annotated.map((p, i) => (
        <PbpRow key={p.eventId || i} play={p} away={away} home={home} />
      ))}
    </div>
  );
}

/* ─── Main export: Gamecast tab ──────────────────────── */
export default function NhlGamecast({ espnGame }) {
  const feed = useNhlFeed(espnGame);

  if (!feed) return <div className="nhl-gc-loading"><div className="loading-text">Connecting to live feed…</div></div>;

  const { away, home, isLive, isFinal, periodLabel: pLbl, clock, goals, away: a, home: h } = feed;

  const awayScore = away.score ?? 0;
  const homeScore = home.score ?? 0;
  const awayColor = '#60a5fa';
  const homeColor = '#f87171';

  const statusStr = isFinal
    ? 'FINAL'
    : isLive
    ? `${pLbl} · ${clock.timeRemaining}`
    : 'UPCOMING';

  const awayLogo = away.logo || `https://assets.nhle.com/logos/nhl/svg/${away.abbrev}_dark.svg`;
  const homeLogo = home.logo || `https://assets.nhle.com/logos/nhl/svg/${home.abbrev}_dark.svg`;

  return (
    <div className="nhl-gc">
      {/* Score Header */}
      <div className="nhl-gc-header">
        <div className="nhl-gc-scoreline">
          <div className="nhl-gc-team">
            <img src={awayLogo} alt={away.abbrev} className="nhl-gc-logo" onError={e => e.target.style.display = 'none'} />
            <div className="nhl-gc-team-name">{away.abbrev}</div>
          </div>
          <div className="nhl-gc-center">
            <div className="nhl-gc-scores">
              <span className={`nhl-gc-score${isFinal && awayScore > homeScore ? ' nhl-gc-score-win' : ''}`}>{awayScore}</span>
              <span className="nhl-gc-score-sep">–</span>
              <span className={`nhl-gc-score${isFinal && homeScore > awayScore ? ' nhl-gc-score-win' : ''}`}>{homeScore}</span>
            </div>
            <div className={`nhl-gc-status${isLive ? ' nhl-gc-live' : ''}`}>
              {isLive && <span className="live-dot" style={{ marginRight: 4 }} />}
              {statusStr}
            </div>
            {feed.broadcast && <div className="nhl-gc-broadcast">{feed.broadcast}</div>}
          </div>
          <div className="nhl-gc-team">
            <img src={homeLogo} alt={home.abbrev} className="nhl-gc-logo" onError={e => e.target.style.display = 'none'} />
            <div className="nhl-gc-team-name">{home.abbrev}</div>
          </div>
        </div>
        {(away.sog != null || home.sog != null) && (
          <div className="nhl-gc-sog-bar">
            <span className="nhl-gc-sog-val">{away.sog ?? 0}</span>
            <span className="nhl-gc-sog-lbl">SOG</span>
            <span className="nhl-gc-sog-val">{home.sog ?? 0}</span>
          </div>
        )}
      </div>

      <GamecastContent feed={feed} />
    </div>
  );
}

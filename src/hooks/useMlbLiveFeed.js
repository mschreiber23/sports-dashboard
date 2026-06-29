import { useState, useEffect, useRef } from 'react';

const POLL_MS = 5000;

// MLB CDN headshot
export function mlbHeadshot(mlbId) {
  return mlbId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current`
    : null;
}

// Extract top 3 batting performers from a boxscore object
export function extractTopPerformers(boxscore) {
  const teams = boxscore?.teams || {};
  const players = [];
  for (const side of ['away', 'home']) {
    for (const player of Object.values(teams[side]?.players || {})) {
      if (player.battingOrder == null) continue;
      const bs = player.stats?.batting || {};
      const ab  = bs.atBats      ?? 0; if (ab === 0) continue;
      const h   = bs.hits        ?? 0;
      const hr  = bs.homeRuns    ?? 0;
      const rbi = bs.rbi         ?? 0;
      const db  = bs.doubles     ?? 0;
      const tr  = bs.triples     ?? 0;
      const sb  = bs.stolenBases ?? 0;
      const score = hr * 4 + rbi * 2 + tr * 2 + db + sb + h * 0.5;
      if (score === 0) continue;
      const fullName = player.person?.fullName || '';
      const lastName = fullName.includes(' ') ? fullName.split(' ').slice(1).join(' ') : fullName;
      const mlbId = player.person?.id;
      const statParts = [
        hr  > 0 && (hr  > 1 ? `${hr} HR`  : 'HR'),
        db  > 0 && (db  > 1 ? `${db} 2B`  : '2B'),
        tr  > 0 && (tr  > 1 ? `${tr} 3B`  : '3B'),
        rbi > 0 && `${rbi} RBI`,
        sb  > 0 && `${sb} SB`,
      ].filter(Boolean);
      players.push({ mlbId, lastName, headshot: mlbHeadshot(mlbId), hAb: `${h}-${ab}`, statLine: statParts.join(', '), score });
    }
  }
  return players.sort((a, b) => b.score - a.score).slice(0, 3);
}

export default function useMlbLiveFeed(gamePk, active = true) {
  const [data, setData] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!gamePk || !active) { setData(null); return; }
    let cancelled = false;

    const poll = () =>
      fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`)
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setData(d); })
        .catch(() => {});

    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(timerRef.current); };
  }, [gamePk, active]);

  if (!data) return {
    raw: null, pitches: [], lastPitch: null, szTop: 3.38, szBot: 1.53,
    matchup: {}, count: { balls: 0, strikes: 0, outs: 0 },
    onFirst: false, onSecond: false, onThird: false, outs: 0,
    recentAtBats: [], allAtBats: [], scoringAtBats: [], currentResult: null, currentAbout: {},
    shortDetail: '', inning: null, inningHalf: null,
    innings: [], linescoreTotals: {},
    pitcherGameStats: {}, batterGameStats: {}, batterPosition: '',
    onDeck: null, inHole: null, inningDisplay: '',
    isBetweenInnings: false, dueUp: [],
    batSide: 'R', venueId: null, topPerformers: [],
  };

  const ld      = data.liveData  || {};
  const plays   = ld.plays       || {};
  const ls      = ld.linescore   || {};
  const offense = ls.offense     || {};
  const defense = ls.defense     || {};
  const current = plays.currentPlay || {};
  const matchup = current.matchup   || {};
  const count   = current.count     || {};

  // ── Current at-bat pitches (must come early — used by isBetweenInnings) ──
  const pitches   = (current.playEvents || []).filter((e) => e.type === 'pitch');
  const lastPitch = pitches[pitches.length - 1] || null;

  // ── All completed at-bats (must come before isBetweenInnings) ──
  const allPlays = plays.allPlays || [];
  const completedAtBats = allPlays
    .filter((p) => p.about?.isComplete && (p.playEvents || []).some((e) => e.type === 'pitch'));
  const recentAtBats = completedAtBats.slice(-5).reverse();
  const allAtBats    = [...completedAtBats].reverse();

  // Scoring plays — plays where runs scored, in reverse order (most recent first)
  const scoringPlayIndices = plays.scoringPlays || [];
  const scoringAtBats = scoringPlayIndices
    .map((i) => allPlays[i])
    .filter(Boolean)
    .reverse();

  // ── Base runners ──
  const onFirst  = !!offense.first;
  const onSecond = !!offense.second;
  const onThird  = !!offense.third;
  const outs     = ls.outs ?? count.outs ?? 0;

  // ── Batter / pitcher ──
  const batterInfo  = offense.batter  || matchup.batter  || {};
  const pitcherInfo = defense.pitcher || matchup.pitcher || {};
  const batSide  = matchup.batSide?.code  || 'R';
  const venueId  = data.gameData?.venue?.id ?? null;

  // ── Inning / sides ──
  const inningHalf   = ls.inningHalf || 'Top';
  const pitchingSide = inningHalf === 'Top' ? 'home' : 'away';
  const battingSide  = inningHalf === 'Top' ? 'away' : 'home';

  // ── Live game stats from boxscore ──
  const boxTeams = ld.boxscore?.teams || {};
  const getPlayerStats = (side, pid, type) => {
    const p = boxTeams[side]?.players?.[`ID${pid}`];
    return p?.stats?.[type] || {};
  };
  const pitcherGameStats = pitcherInfo.id
    ? getPlayerStats(pitchingSide, pitcherInfo.id, 'pitching') : {};
  const batterGameStats  = batterInfo.id
    ? getPlayerStats(battingSide, batterInfo.id, 'batting')  : {};
  const batterPosition   = boxTeams[battingSide]?.players?.[`ID${batterInfo.id}`]?.position?.abbreviation || '';

  const onDeck = offense.onDeck || null;
  const inHole = offense.inHole || null;

  // ── Strike zone ──
  const szTop = matchup.strikeZoneTop    ?? lastPitch?.pitchData?.strikeZoneTop    ?? 3.38;
  const szBot = matchup.strikeZoneBottom ?? lastPitch?.pitchData?.strikeZoneBottom ?? 1.53;

  // ── Between-innings detection (requires pitches + completedAtBats above) ──
  const lastCompleted    = completedAtBats[completedAtBats.length - 1];
  const isBetweenInnings = pitches.length === 0
    && !!lastCompleted
    && lastCompleted.count?.outs === 3;

  let dueUp = [];
  if (isBetweenInnings) {
    const lastHalf   = lastCompleted.about?.halfInning;
    const nextSide   = lastHalf === 'top' ? 'home' : 'away';
    const battingOrd = boxTeams[nextSide]?.battingOrder || [];
    const bxPlayers  = boxTeams[nextSide]?.players || {};

    const lastAtBatFromTeam = [...completedAtBats].reverse().find((ab) => {
      const bid = ab.matchup?.batter?.id;
      return battingOrd.some((id) => String(id) === String(bid));
    });
    const lastBatterId = lastAtBatFromTeam?.matchup?.batter?.id;
    const lastPos      = battingOrd.findIndex((id) => String(id) === String(lastBatterId));

    dueUp = [0, 1, 2].map((offset) => {
      const pos    = ((lastPos < 0 ? -1 : lastPos) + 1 + offset) % (battingOrd.length || 9);
      const id     = battingOrd[pos];
      const player = bxPlayers[`ID${id}`] || {};
      return {
        id,
        fullName:     player.person?.fullName          || '',
        jerseyNumber: player.jerseyNumber               || '',
        position:     player.position?.abbreviation    || '',
        order:        pos + 1,
      };
    }).filter((p) => p.fullName);
  }

  // ── Inning display ──
  const inningDisplay = ls.currentInning
    ? `${inningHalf === 'Top' ? 'TOP' : 'BOT'} ${ls.currentInning}` : '';

  const currentResult = current.about?.isComplete ? current.result : null;

  const topPerformers = extractTopPerformers(ld.boxscore);

  return {
    raw: data,
    pitches, lastPitch, szTop, szBot,
    matchup: { batter: batterInfo, pitcher: pitcherInfo },
    count: { balls: count.balls ?? 0, strikes: count.strikes ?? 0, outs },
    onFirst, onSecond, onThird, outs,
    currentResult,
    currentAbout: current.about || {},
    recentAtBats, allAtBats, scoringAtBats,
    batSide, venueId,
    pitcherGameStats, batterGameStats, batterPosition,
    onDeck, inHole,
    isBetweenInnings, dueUp, inningDisplay,
    gameState: data.gameData?.status?.detailedState,
    innings: ld.linescore?.innings || [],
    linescoreTotals: ld.linescore?.teams || {},
    inning: ls.currentInning,
    inningHalf: ls.inningHalf,
    shortDetail: `${ls.inningHalf === 'Top' ? '▲' : '▼'} ${ls.currentInning}`,
    topPerformers,
  };
}

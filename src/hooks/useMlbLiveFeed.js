import { useState, useEffect, useRef } from 'react';

const POLL_MS = 5000;

// MLB CDN headshot
export function mlbHeadshot(mlbId) {
  return mlbId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current`
    : null;
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
    recentAtBats: [], allAtBats: [], currentResult: null, currentAbout: {},
    shortDetail: '', inning: null, inningHalf: null,
    innings: [], linescoreTotals: {},
    pitcherGameStats: {}, batterGameStats: {}, batterPosition: '',
    onDeck: null, inHole: null, inningDisplay: '',
    batSide: 'R', venueId: null,
  };

  const ld      = data.liveData  || {};
  const plays   = ld.plays       || {};
  const ls      = ld.linescore   || {};
  const offense = ls.offense     || {};
  const defense = ls.defense     || {};
  const current = plays.currentPlay || {};
  const matchup = current.matchup   || {};
  const count   = current.count     || {};

  // Base runners from linescore (most accurate)
  const onFirst  = !!offense.first;
  const onSecond = !!offense.second;
  const onThird  = !!offense.third;
  const outs     = ls.outs ?? count.outs ?? 0;

  // Current batter / pitcher from linescore
  const batterInfo  = offense.batter  || matchup.batter  || {};
  const pitcherInfo = defense.pitcher || matchup.pitcher || {};
  const batSide  = matchup.batSide?.code  || 'R';
  const venueId  = data.gameData?.venue?.id ?? null;

  // Derive which side is pitching vs batting this half-inning
  const inningHalf     = ls.inningHalf || 'Top'; // 'Top' | 'Bottom'
  const pitchingSide   = inningHalf === 'Top' ? 'home' : 'away';
  const battingSide    = inningHalf === 'Top' ? 'away' : 'home';

  // Live game stats from boxscore
  const boxTeams = ld.boxscore?.teams || {};
  const getPlayerStats = (side, pid, type) => {
    const p = boxTeams[side]?.players?.[`ID${pid}`];
    return p?.stats?.[type] || {};
  };
  const pitcherGameStats = pitcherInfo.id
    ? getPlayerStats(pitchingSide, pitcherInfo.id, 'pitching') : {};
  const batterGameStats  = batterInfo.id
    ? getPlayerStats(battingSide,  batterInfo.id,  'batting')  : {};
  const batterPosition   = boxTeams[battingSide]?.players?.[`ID${batterInfo.id}`]?.position?.abbreviation || '';

  // On deck / in hole (MLB linescore)
  const onDeck = offense.onDeck || null;
  const inHole = offense.inHole || null;

  // Inning display string (MLB.com format: "TOP 5" / "BOT 5")
  const inningDisplay = ls.currentInning
    ? `${inningHalf === 'Top' ? 'TOP' : 'BOT'} ${ls.currentInning}`
    : '';

  // Current at-bat pitches
  const pitches   = (current.playEvents || []).filter((e) => e.type === 'pitch');
  const lastPitch = pitches[pitches.length - 1] || null;

  // Strike zone
  const szTop = matchup.strikeZoneTop  ?? lastPitch?.pitchData?.strikeZoneTop  ?? 3.38;
  const szBot = matchup.strikeZoneBottom ?? lastPitch?.pitchData?.strikeZoneBottom ?? 1.53;

  // All completed at-bats
  const allPlays = plays.allPlays || [];
  const completedAtBats = allPlays
    .filter((p) => p.about?.isComplete && (p.playEvents || []).some((e) => e.type === 'pitch'));
  const recentAtBats = completedAtBats.slice(-5).reverse();
  const allAtBats    = [...completedAtBats].reverse(); // newest first, all game

  // Current at-bat result (if just completed)
  const currentResult = current.about?.isComplete ? current.result : null;

  return {
    raw: data,
    pitches,
    lastPitch,
    szTop,
    szBot,
    // MLB matchup
    matchup: { batter: batterInfo, pitcher: pitcherInfo },
    count: { balls: count.balls ?? 0, strikes: count.strikes ?? 0, outs },
    // Base runners (from linescore)
    onFirst, onSecond, onThird, outs,
    // Current at-bat
    currentResult,
    currentAbout: current.about || {},
    recentAtBats,
    allAtBats,
    batSide,
    venueId,
    pitcherGameStats, batterGameStats, batterPosition,
    onDeck, inHole,
    inningDisplay,
    gameState: data.gameData?.status?.detailedState,
    // Linescore — per-inning + totals
    innings: ld.linescore?.innings || [],
    linescoreTotals: ld.linescore?.teams || {},  // { away: {runs,hits,errors}, home: {...} }
    inning: ls.currentInning,
    inningHalf: ls.inningHalf,
    shortDetail: `${ls.inningHalf === 'Top' ? '▲' : '▼'} ${ls.currentInning}`,
  };
}

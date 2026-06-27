import { useState, useEffect, useRef } from 'react';

const POLL_MS = 6000;

export default function useMlbLiveFeed(gamePk, active = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!gamePk || !active) {
      setData(null);
      return;
    }

    let cancelled = false;

    const fetch_ = () => {
      fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`)
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setData(d); })
        .catch((e) => { if (!cancelled) setError(e); });
    };

    fetch_();
    timerRef.current = setInterval(fetch_, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
    };
  }, [gamePk, active]);

  const plays   = data?.liveData?.plays;
  const current = plays?.currentPlay;
  const matchup = current?.matchup || {};
  const count   = current?.count   || {};
  const pitches = (current?.playEvents || []).filter((e) => e.type === 'pitch');
  const lastPitch = pitches[pitches.length - 1] || null;

  // Strike zone — fall back to MLB average if not on matchup
  const szTop = matchup.strikeZoneTop
    ?? lastPitch?.pitchData?.strikeZoneTop
    ?? 3.38;
  const szBot = matchup.strikeZoneBottom
    ?? lastPitch?.pitchData?.strikeZoneBottom
    ?? 1.53;

  return {
    raw: data,
    error,
    current,
    matchup,
    count,
    pitches,
    lastPitch,
    szTop,
    szBot,
    gameState: data?.gameData?.status?.detailedState,
  };
}

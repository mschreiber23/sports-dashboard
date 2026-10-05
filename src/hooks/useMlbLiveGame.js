/**
 * Resolves the MLB gamePk from an ESPN game object, then polls the
 * MLB Stats API live feed for up-to-date scores and situation.
 * Replaces ESPN's useLiveSituation for MLB games.
 */
import { useState, useEffect, useRef } from 'react';
import useMlbLiveFeed from './useMlbLiveFeed';

const STATSAPI = 'https://statsapi.mlb.com/api/v1';

async function fetchMlbPk(dateStr, awayName, homeName) {
  const norm    = (s) => (s || '').toLowerCase();
  const isMatch = (g) => {
    const a = norm(g.teams?.away?.team?.name);
    const h = norm(g.teams?.home?.team?.name);
    return (a === norm(awayName) && h === norm(homeName)) ||
      (norm(awayName).includes(a.split(' ').pop()) && norm(homeName).includes(h.split(' ').pop()));
  };

  const tryDate = async (d) => {
    const r = await fetch(`${STATSAPI}/schedule?sportId=1&date=${d}&hydrate=teams`);
    const data = await r.json();
    return data.dates?.[0]?.games || [];
  };

  const prev = new Date(dateStr + 'T12:00:00Z');
  prev.setDate(prev.getDate() - 1);
  const prevStr = prev.toISOString().slice(0, 10);

  const [g1, g2] = await Promise.all([tryDate(dateStr), tryDate(prevStr)]);
  const all = [...g1, ...g2].filter(isMatch);
  if (!all.length) return null;

  // Prefer Live > Final > Scheduled
  const score = (g) => g.status?.abstractGameState === 'Live' ? 2 : g.status?.abstractGameState === 'Final' ? 1 : 0;
  all.sort((a, b) => score(b) - score(a));
  return all[0]?.gamePk ?? null;
}

export default function useMlbLiveGame(sport, game) {
  const [gamePk, setGamePk] = useState(null);
  const resolvedRef = useRef(null);

  const isLive = game?.competitions?.[0]?.status?.type?.state === 'in';

  useEffect(() => {
    if (sport !== 'mlb' || !game?.id || !isLive) return;
    const gameKey = game.id;
    if (resolvedRef.current === gameKey) return; // already resolved

    const comp    = game.competitions?.[0];
    const comps   = comp?.competitors || [];
    const away    = comps.find((c) => c.homeAway === 'away')?.team?.displayName;
    const home    = comps.find((c) => c.homeAway === 'home')?.team?.displayName;
    const dateStr = (comp?.date || game.date || '').slice(0, 10);
    if (!dateStr || !away || !home) return;

    fetchMlbPk(dateStr, away, home)
      .then((pk) => {
        if (pk) { resolvedRef.current = gameKey; setGamePk(pk); }
      })
      .catch(() => {});
  }, [sport, game?.id, isLive]);

  const feed = useMlbLiveFeed(gamePk, sport === 'mlb' && isLive);
  return feed;
}

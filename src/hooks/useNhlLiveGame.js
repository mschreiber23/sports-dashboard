import { useState, useEffect } from 'react';
import useNhlLiveFeed, { findNhlGameId } from './useNhlLiveFeed';

export default function useNhlLiveGame(sport, game) {
  const [nhlGameId, setNhlGameId] = useState(null);

  useEffect(() => {
    if (sport !== 'nhl' || !game) { setNhlGameId(null); return; }
    findNhlGameId(game).then(id => { if (id) setNhlGameId(id); }).catch(() => {});
  }, [game?.id, sport]);

  return useNhlLiveFeed(nhlGameId);
}

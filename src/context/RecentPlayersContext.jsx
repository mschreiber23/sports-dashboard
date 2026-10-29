import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { loadRecent, saveRecent } from '../api/recentPlayersStore';
import { clearRecent, emptyRecent, removeRecentPlayer, viewPlayer } from '../utils/recentPlayers';

const RecentPlayersContext = createContext(null);

export function RecentPlayersProvider({ userId, children }) {
  const [state, setState] = useState(emptyRecent);

  const refresh = useCallback(() => {
    let cancel = false;
    loadRecent(userId).then((result) => {
      if (cancel || !result) return;
      setState(result.state);
      if (result.dirty) saveRecent(userId, result.state);
    });
    return () => { cancel = true; };
  }, [userId]);

  useEffect(() => refresh(), [refresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  const record = useCallback((player) => {
    setState((prev) => {
      const next = viewPlayer(prev, player, Date.now());
      saveRecent(userId, next);
      return next;
    });
  }, [userId]);

  const remove = useCallback((id, sport) => {
    setState((prev) => {
      const next = removeRecentPlayer(prev, String(id), sport, Date.now());
      saveRecent(userId, next);
      return next;
    });
  }, [userId]);

  const clear = useCallback(() => {
    setState((prev) => {
      const next = clearRecent(prev, Date.now());
      saveRecent(userId, next);
      return next;
    });
  }, [userId]);

  return (
    <RecentPlayersContext.Provider value={{ players: state.players, record, remove, clear, refresh }}>
      {children}
    </RecentPlayersContext.Provider>
  );
}

export function useRecentPlayers() {
  return useContext(RecentPlayersContext) || {
    players: [],
    record: () => {},
    remove: () => {},
    clear: () => {},
    refresh: () => {},
  };
}

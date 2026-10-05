import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { runPropSync } from '../api/propSync';
import { learnCalibration } from '../utils/propCalibration';
import { loadTrades, loadUnit, saveTrades, saveUnit } from '../api/tradeStore';
import { tradeId } from '../utils/propBook';

const PropSyncContext = createContext(null);

function mergeTradeSnapshot(current, incoming) {
  if (!current) return incoming;
  const byId = new Map(incoming.map((trade) => [trade.id, trade]));
  return current.map((trade) => {
    const update = byId.get(trade.id);
    if (update?.result && !trade.result) {
      return { ...trade, result: update.result, actual: update.actual, gradedAt: update.gradedAt };
    }
    return trade;
  });
}

export function PropSyncProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id || '';
  const [reads, setReads] = useState(null);
  const [trades, setTrades] = useState(null);
  const [unit, setUnitState] = useState(25);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [calibration, setCalibration] = useState(() => learnCalibration([]));
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const pendingForce = useRef(false);
  const stop = useRef(false);

  const refresh = useCallback((force = false) => {
    if (busy.current) {
      pendingForce.current = pendingForce.current || Boolean(force);
      return;
    }
    const runForce = Boolean(force) || pendingForce.current;
    pendingForce.current = false;
    busy.current = true;
    stop.current = false;
    setWorking(true);
    setError('');
    runPropSync({
      userId,
      force: runForce,
      onStatus: (text) => { if (!stop.current) setStatus(text || ''); },
      onUpdate: (next) => {
        if (stop.current) return;
        setReads(next.reads);
        setCalibration(next.calibration);
        if (next.trades) setTrades((current) => mergeTradeSnapshot(current, next.trades));
      },
      shouldStop: () => stop.current,
    }).then((result) => {
      if (stop.current || !result) return;
      setReads(result.reads);
      setCalibration(result.calibration);
      if (result.trades) setTrades((current) => mergeTradeSnapshot(current, result.trades));
    }).catch((err) => {
      if (!stop.current) setError(err?.message || 'Could not update the prop log.');
    }).finally(() => {
      busy.current = false;
      if (!stop.current) setWorking(false);
      if (pendingForce.current && !stop.current) refresh(true);
    });
  }, [userId]);

  useEffect(() => {
    let cancel = false;
    loadTrades(userId).then((rows) => { if (!cancel) setTrades(rows); });
    loadUnit().then((value) => { if (!cancel) setUnitState(value); });
    return () => { cancel = true; };
  }, [userId]);

  const addTrade = useCallback(async (draft) => {
    const id = tradeId(draft);
    const current = await loadTrades(userId);
    if (current.some((trade) => trade.id === id)) return;
    const next = [...current, {
      ...draft,
      id,
      unit,
      result: null,
      actual: null,
      gradedAt: null,
      recordedAt: Date.now(),
    }];
    await saveTrades(userId, next);
    setTrades(next);
  }, [unit, userId]);

  const removeTrade = useCallback(async (id) => {
    const current = await loadTrades(userId);
    const next = current.filter((trade) => trade.id !== id || trade.result);
    await saveTrades(userId, next);
    setTrades(next);
  }, [userId]);

  const setUnit = useCallback(async (value) => {
    const next = Math.min(10000, Math.max(1, Math.round(Number(value))));
    if (!Number.isFinite(next)) return;
    await saveUnit(next);
    setUnitState(next);
  }, []);

  useEffect(() => {
    refresh(false);
    return () => { stop.current = true; };
  }, [refresh]);

  return (
    <PropSyncContext.Provider value={{ reads, trades, unit, addTrade, removeTrade, setUnit, status, error, calibration, working, refresh }}>
      {children}
    </PropSyncContext.Provider>
  );
}

export function usePropSync() {
  return useContext(PropSyncContext) || {
    reads: null,
    trades: null,
    unit: 25,
    addTrade: () => {},
    removeTrade: () => {},
    setUnit: () => {},
    status: '',
    error: '',
    calibration: learnCalibration([]),
    working: false,
    refresh: () => {},
  };
}

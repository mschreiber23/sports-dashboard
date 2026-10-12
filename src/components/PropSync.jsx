import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { runPropSync } from '../api/propSync';
import { learnCalibration } from '../utils/propCalibration';
import { loadTrades, loadUnit, saveTrades, saveUnit } from '../api/tradeStore';
import { expectedProfit, quoteForUnit, tradeId } from '../utils/propBook';
import { mergeTradeLists } from '../utils/tradeSync';

const PropSyncContext = createContext(null);

function mergeTradeSnapshot(current, incoming) {
  if (!current) return incoming || [];
  return mergeTradeLists(current, incoming);
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
  const tradeLock = useRef(Promise.resolve());

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

  const addTrade = useCallback((draft) => {
    const run = tradeLock.current.then(async () => {
      const id = tradeId(draft);
      const quote = quoteForUnit(draft.price, unit);
      if (!quote) return;
      const current = await loadTrades(userId);
      if (current.some((trade) => trade.id === id)) return;
      const next = [...current, {
        ...draft,
        id,
        unit: quote.stake,
        payout: quote.payout,
        result: null,
        actual: null,
        gradedAt: null,
        recordedAt: Date.now(),
      }];
      setTrades(await saveTrades(userId, next));
    });
    tradeLock.current = run.then(() => {}, () => {});
    return run;
  }, [unit, userId]);

  const updateTrade = useCallback((id, patch) => {
    const run = tradeLock.current.then(async () => {
      const current = await loadTrades(userId);
      const next = current.map((trade) => {
        if (trade.id !== id) return trade;
        const row = { ...trade, editedAt: Date.now() };
        if (patch.unit != null || patch.profit != null) {
          const stake = patch.unit != null ? Number(patch.unit) : Number(trade.unit);
          const profit = patch.profit != null ? Number(patch.profit) : expectedProfit(trade);
          if (profit == null || !Number.isFinite(profit)) return trade;
          const unit = Math.round(stake * 100) / 100;
          const net = Math.round(profit * 100) / 100;
          if (!(unit > 0) || unit > 1000000 || net < 0 || net > 1000000) return trade;
          row.unit = unit;
          row.payout = Math.round((unit + net) * 100) / 100;
        }
        if (patch.price != null) {
          const price = Math.round(Number(patch.price) * 100) / 100;
          const old = Number(trade.price);
          if (!(price > 0 && price < 1) || !(old > 0 && old < 1)) return trade;
          row.price = price;
          if (typeof trade.edge === 'number') {
            row.edge = Math.round((trade.edge + (old - price)) * 100) / 100;
          }
        }
        return row;
      });
      setTrades(await saveTrades(userId, next));
    });
    tradeLock.current = run.then(() => {}, () => {});
    return run;
  }, [userId]);

  const removeTrade = useCallback((id) => {
    const run = tradeLock.current.then(async () => {
      const current = await loadTrades(userId);
      const next = current.filter((trade) => trade.id !== id || trade.result);
      setTrades(await saveTrades(userId, next));
    });
    tradeLock.current = run.then(() => {}, () => {});
    return run;
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

  useEffect(() => {
    if (!userId) return undefined;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      loadTrades(userId).then((rows) => setTrades(rows));
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [userId]);

  return (
    <PropSyncContext.Provider value={{ reads, trades, unit, addTrade, updateTrade, removeTrade, setUnit, status, error, calibration, working, refresh }}>
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
    updateTrade: () => {},
    removeTrade: () => {},
    setUnit: () => {},
    status: '',
    error: '',
    calibration: learnCalibration([]),
    working: false,
    refresh: () => {},
  };
}

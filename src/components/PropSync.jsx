import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { runPropSync } from '../api/propSync';
import { learnCalibration } from '../utils/propCalibration';

const PropSyncContext = createContext(null);

export function PropSyncProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id || '';
  const [reads, setReads] = useState(null);
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
      },
      shouldStop: () => stop.current,
    }).then((result) => {
      if (stop.current || !result) return;
      setReads(result.reads);
      setCalibration(result.calibration);
    }).catch((err) => {
      if (!stop.current) setError(err?.message || 'Could not update the prop log.');
    }).finally(() => {
      busy.current = false;
      if (!stop.current) setWorking(false);
      if (pendingForce.current && !stop.current) refresh(true);
    });
  }, [userId]);

  useEffect(() => {
    refresh(false);
    return () => { stop.current = true; };
  }, [refresh]);

  return (
    <PropSyncContext.Provider value={{ reads, status, error, calibration, working, refresh }}>
      {children}
    </PropSyncContext.Provider>
  );
}

export function usePropSync() {
  return useContext(PropSyncContext) || {
    reads: null,
    status: '',
    error: '',
    calibration: learnCalibration([]),
    working: false,
    refresh: () => {},
  };
}

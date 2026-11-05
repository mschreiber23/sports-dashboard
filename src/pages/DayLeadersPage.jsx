import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadDayLeaders } from '../api/dayLeaders';
import { DAY_COLUMNS, DAY_SPORTS, formatLeaderStat, sortDayLeaders } from '../utils/dayLeaders';
import { formatSportsDateLabel, msUntilNextSportsRollover, sportsDayDate, sportsDayStr } from '../utils/sportsDay';

const REFRESH_MS = 20000;

const SPORT_LABEL = { nba: 'NBA', nhl: 'NHL' };

function defaultSorts() {
  return { nba: { key: 'points', dir: 'desc' }, nhl: { key: 'points', dir: 'desc' } };
}

export default function DayLeadersPage() {
  const navigate = useNavigate();
  const [sport, setSport] = useState('nba');
  const [day, setDay] = useState(() => sportsDayStr());
  const [sorts, setSorts] = useState(defaultSorts);
  const [boards, setBoards] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const boardsRef = useRef({});
  const pullGen = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDay(sportsDayStr()), msUntilNextSportsRollover());
    return () => clearTimeout(timer);
  }, [day]);

  useEffect(() => {
    let stop = false;

    async function pull(quiet) {
      const gen = ++pullGen.current;
      if (!quiet) setLoading(true);
      try {
        const next = await loadDayLeaders(sport, day, boardsRef.current[sport]);
        if (stop || gen !== pullGen.current) return;
        boardsRef.current = { ...boardsRef.current, [sport]: next };
        setBoards((prev) => ({ ...prev, [sport]: next }));
        setError('');
      } catch {
        if (!stop && !boardsRef.current[sport]) setError('Could not load today’s performers.');
      } finally {
        if (!stop && gen === pullGen.current) setLoading(false);
      }
    }

    pull(boardsRef.current[sport]?.dateStr === day);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') pull(true);
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sport, day]);

  const board = boards[sport]?.dateStr === day ? boards[sport] : null;
  const sort = sorts[sport];
  const columns = DAY_COLUMNS[sport];
  const rows = board ? sortDayLeaders(board.players, sort.key, sort.dir) : [];
  const today = sportsDayDate();
  const label = formatSportsDateLabel(today, today);

  function chooseSort(key) {
    setSorts((prev) => {
      const current = prev[sport];
      const dir = current.key === key && current.dir === 'desc' ? 'asc' : 'desc';
      return { ...prev, [sport]: { key, dir } };
    });
  }

  return (
    <div className="day-leaders">
      <div className="day-leaders-head">
        <h1>Top today</h1>
        <p className="day-leaders-note">
          {label}’s games. Points lead the list. Tap a stat to sort.
          {board?.live && (
            <span className="day-leaders-live">
              <span className="ts-live-dot" />
              Live
            </span>
          )}
        </p>
      </div>

      <div className="scores-sport-tabs">
        {DAY_SPORTS.map((key) => (
          <button
            key={key}
            type="button"
            className={`ts-tab${sport === key ? ' ts-tab-active' : ''}`}
            onClick={() => setSport(key)}
          >
            {SPORT_LABEL[key]}
          </button>
        ))}
      </div>

      {loading && !board && <div className="day-leaders-status">Loading today’s box scores…</div>}
      {error && !board && <div className="day-leaders-status">{error}</div>}
      {board && rows.length === 0 && (
        <div className="day-leaders-status">
          {board.scheduled === 0 ? 'No games on today’s slate.' : 'No one has played yet today.'}
        </div>
      )}

      {rows.length > 0 && (
        <div className="day-leaders-scroll">
          <table className="day-leaders-table">
            <thead>
              <tr>
                <th className="day-leaders-player">Player</th>
                {columns.map((col) => {
                  const active = sort.key === col.key;
                  const mark = !active ? '' : sort.dir === 'asc' ? ' ↑' : ' ↓';
                  return (
                    <th key={col.key} className={active ? 'day-leaders-sort' : ''}>
                      <button type="button" onClick={() => chooseSort(col.key)}>
                        {col.label}{mark}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} onClick={() => navigate(`/player/${sport}/${row.id}`)}>
                  <td className="day-leaders-player">
                    <div className="day-leaders-who">
                      <span className="day-leaders-rank">{index + 1}</span>
                      {row.headshot
                        ? <img src={row.headshot} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        : <span className="day-leaders-photo" />}
                      <span>
                        <span className="day-leaders-name">{row.name}</span>
                        <span className="day-leaders-meta">
                          {row.position ? `${row.position} · ` : ''}
                          {row.team} {row.home ? 'vs' : '@'} {row.opponent}
                          {row.live && row.clock ? ` · ${row.clock}` : ''}
                        </span>
                      </span>
                    </div>
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className={sort.key === col.key ? 'day-leaders-sort' : ''}>
                      {formatLeaderStat(col.key, row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

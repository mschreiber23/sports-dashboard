import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadDayLeaders } from '../api/dayLeaders';
import { DAY_COLUMNS, DAY_GROUPS, DAY_SPORTS, formatLeaderStat, sortDayLeaders } from '../utils/dayLeaders';
import { formatSportsDateLabel, msUntilNextSportsRollover, sportsDayDate, sportsDayStr } from '../utils/sportsDay';

const REFRESH_MS = 20000;

const SPORT_LABEL = { nba: 'NBA', nhl: 'NHL', nfl: 'NFL', mlb: 'MLB' };

function defaultSorts() {
  const sorts = {};
  for (const sport of DAY_SPORTS) {
    const groups = DAY_GROUPS[sport];
    if (!groups) {
      sorts[sport] = { key: DAY_COLUMNS[sport][0].key, dir: 'desc' };
      continue;
    }
    for (const [line, group] of Object.entries(groups)) {
      sorts[`${sport}:${line}`] = { key: group.defaultSort, dir: 'desc' };
    }
  }
  return sorts;
}

export default function DayLeadersPage() {
  const navigate = useNavigate();
  const [sport, setSport] = useState('nba');
  const [lines, setLines] = useState({ nfl: 'passing', mlb: 'hitting' });
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
  const groups = DAY_GROUPS[sport] || null;
  const line = groups ? lines[sport] : null;
  const view = line ? `${sport}:${line}` : sport;
  const columns = groups ? groups[line].columns : DAY_COLUMNS[sport];
  const sort = sorts[view];
  const pool = board ? (line ? board.players.filter((row) => row.line === line) : board.players) : [];
  const rows = sort ? sortDayLeaders(pool, sort.key, sort.dir) : [];
  const today = sportsDayDate();
  const label = formatSportsDateLabel(today, today);

  function chooseSort(key) {
    setSorts((prev) => {
      const current = prev[view];
      const dir = current.key === key && current.dir === 'desc' ? 'asc' : 'desc';
      return { ...prev, [view]: { key, dir } };
    });
  }

  function chooseLine(next) {
    setLines((prev) => ({ ...prev, [sport]: next }));
  }

  const activeColumn = columns.find((col) => col.key === sort.key) || columns[0];

  return (
    <div className="day-leaders">
      <div className="day-leaders-head">
        <div>
          <h1>Top today</h1>
          <p className="day-leaders-note">{label}. Tap a stat to sort.</p>
        </div>
        {board?.live && (
          <span className="day-leaders-live">
            <span className="ts-live-dot" />
            Live
          </span>
        )}
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

      {groups && (
        <div className="scores-sport-tabs">
          {Object.entries(groups).map(([key, group]) => (
            <button
              key={key}
              type="button"
              className={`ts-tab${line === key ? ' ts-tab-active' : ''}`}
              onClick={() => chooseLine(key)}
            >
              {group.label}
            </button>
          ))}
        </div>
      )}

      {columns && (
        <div className="day-leaders-sorts">
          {columns.map((col) => {
            const active = sort.key === col.key;
            const mark = !active ? '' : sort.dir === 'asc' ? ' ↑' : ' ↓';
            return (
              <button
                key={col.key}
                type="button"
                className={active ? 'on' : ''}
                onClick={() => chooseSort(col.key)}
              >
                {col.label}{mark}
              </button>
            );
          })}
        </div>
      )}

      {loading && !board && <div className="day-leaders-status">Loading today’s box scores…</div>}
      {error && !board && <div className="day-leaders-status">{error}</div>}
      {board && rows.length === 0 && (
        <div className="day-leaders-status">
          {board.scheduled === 0 ? 'No games on today’s slate.' : 'No one has played yet today.'}
        </div>
      )}

      {rows.length > 0 && (
        <ol className="day-leaders-list">
          {rows.map((row, index) => (
            <li key={`${row.line || 'player'}-${row.id}`}>
              <button type="button" className="day-leaders-row" onClick={() => navigate(`/player/${sport}/${row.id}`)}>
                <span className="day-leaders-rank">{index + 1}</span>
                {row.headshot
                  ? <img src={row.headshot} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  : <span className="day-leaders-photo" />}
                <span className="day-leaders-id">
                  <span className="day-leaders-name">{row.name}</span>
                  <span className="day-leaders-meta">
                    {row.position ? `${row.position} · ` : ''}
                    {row.team} {row.home ? 'vs' : '@'} {row.opponent}
                    {row.live && row.clock ? ` · ${row.clock}` : ''}
                  </span>
                  <span className="day-leaders-stats">
                    {columns.filter((col) => col.key !== sort.key).map((col) => (
                      <span key={col.key}>
                        <b>{formatLeaderStat(col.key, row[col.key])}</b>
                        {col.label}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="day-leaders-main">
                  <b>{formatLeaderStat(activeColumn.key, row[activeColumn.key])}</b>
                  <span>{activeColumn.label}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

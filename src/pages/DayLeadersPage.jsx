import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadDayLeaders } from '../api/dayLeaders';
import useSportsDaySelection from '../hooks/useSportsDay';
import { DAY_COLUMNS, DAY_GROUPS, DAY_SPORTS, formatLeaderStat, sortDayLeaders } from '../utils/dayLeaders';
import { formatSportsDateLabel, sportsDayDate, toDateStr, toIsoDate } from '../utils/sportsDay';

const REFRESH_MS = 20000;

const SPORT_LABEL = { nba: 'NBA', nhl: 'NHL', nfl: 'NFL', mlb: 'MLB' };

function TeamLogo({ side, className }) {
  const src = side?.logo || side?.logoFallback;
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className={className}
      onError={(e) => {
        const fallback = side.logoFallback;
        if (fallback && e.currentTarget.src !== fallback) {
          e.currentTarget.onerror = null;
          e.currentTarget.src = fallback;
        } else {
          e.currentTarget.style.display = 'none';
        }
      }}
    />
  );
}

function Scoreboard({ row }) {
  const away = row.awaySide;
  const home = row.homeSide;
  if (!away?.abbr && !home?.abbr) return null;
  const awayScore = Number(away?.score);
  const homeScore = Number(home?.score);
  const comparable = away?.score !== '' && home?.score !== '' && Number.isFinite(awayScore) && Number.isFinite(homeScore);
  const pace = (score, other) => {
    if (!comparable || score === other) return '';
    return score > other ? ' ahead' : ' behind';
  };
  const live = row.live ? [row.clock, row.period].filter(Boolean).join(' – ') : '';
  return (
    <span className="day-card-board">
      <span className={`day-card-side away${!row.home ? ' mine' : ''}${pace(awayScore, homeScore)}`}>
        <TeamLogo side={away} className="day-card-logo" />
        <span className="day-card-abbr">{away?.abbr}</span>
        {away?.score !== '' && <span className="day-card-pts">{away.score}</span>}
      </span>
      <span className="day-card-mid">
        {live ? <span className="day-card-live">{live}</span> : <span className="day-card-at">@</span>}
      </span>
      <span className={`day-card-side home${row.home ? ' mine' : ''}${pace(homeScore, awayScore)}`}>
        {home?.score !== '' && <span className="day-card-pts">{home.score}</span>}
        <span className="day-card-abbr">{home?.abbr}</span>
        <TeamLogo side={home} className="day-card-logo" />
      </span>
    </span>
  );
}

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
  const { selectedDate, setSelectedDate, sportsToday, isToday } = useSportsDaySelection();
  const day = toDateStr(selectedDate);
  const [sorts, setSorts] = useState(defaultSorts);
  const [boards, setBoards] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const boardsRef = useRef({});
  const pullGen = useRef(0);

  const shiftDate = (n) => setSelectedDate((current) => {
    const next = new Date(current);
    next.setDate(next.getDate() + n);
    const today = sportsDayDate();
    if (toDateStr(next) > toDateStr(today)) return today;
    return next;
  });

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
        if (!stop && !boardsRef.current[sport]) setError('Could not load performers.');
      } finally {
        if (!stop && gen === pullGen.current) setLoading(false);
      }
    }

    pull(boardsRef.current[sport]?.dateStr === day);
    const timer = isToday ? setInterval(() => {
      if (document.visibilityState === 'visible') pull(true);
    }, REFRESH_MS) : null;
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sport, day, isToday]);

  const board = boards[sport]?.dateStr === day ? boards[sport] : null;
  const groups = DAY_GROUPS[sport] || null;
  const line = groups ? lines[sport] : null;
  const view = line ? `${sport}:${line}` : sport;
  const columns = groups ? groups[line].columns : DAY_COLUMNS[sport];
  const sort = sorts[view];
  const pool = board ? (line ? board.players.filter((row) => row.line === line) : board.players) : [];
  const rows = sort ? sortDayLeaders(pool, sort.key, sort.dir) : [];
  const label = formatSportsDateLabel(selectedDate, sportsToday);
  const emptyCopy = board?.scheduled === 0
    ? (label === 'Today' ? 'No games on today’s slate.' : `No games on ${label}.`)
    : (label === 'Today' ? 'No one has played yet today.' : `No one has played on ${label}.`);

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
          <p className="day-leaders-note">Tap a stat to sort.</p>
          {board?.live && isToday && (
            <span className="day-leaders-live">
              <span className="ts-live-dot" />
              Live
            </span>
          )}
        </div>
        <div className="sp-date-nav" aria-label="Leaderboard date">
          <button type="button" className="sp-date-btn" aria-label="Previous day" onClick={() => shiftDate(-1)}>‹</button>
          <label className="sp-date-label">
            {label}
            <input
              type="date"
              className="sp-date-input"
              aria-label="Choose a date"
              value={toIsoDate(selectedDate)}
              max={toIsoDate(sportsToday)}
              onChange={(e) => {
                if (!e.target.value) return;
                const next = new Date(`${e.target.value}T12:00:00`);
                if (toDateStr(next) > toDateStr(sportsToday)) return;
                setSelectedDate(next);
              }}
            />
          </label>
          <button type="button" className="sp-date-btn" aria-label="Next day" onClick={() => shiftDate(1)} disabled={isToday}>›</button>
          {!isToday && (
            <button type="button" className="sp-date-today" onClick={() => setSelectedDate(sportsDayDate())}>Today</button>
          )}
        </div>
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

      {loading && !board && <div className="day-leaders-status">Loading box scores…</div>}
      {error && !board && <div className="day-leaders-status">{error}</div>}
      {board && rows.length === 0 && (
        <div className="day-leaders-status">{emptyCopy}</div>
      )}

      {rows.length > 0 && (
        <ol className="day-leaders-list">
          {rows.map((row, index) => (
            <li key={`${row.line || 'player'}-${row.id}`}>
              <button type="button" className="day-card" onClick={() => navigate(`/player/${sport}/${row.id}`)}>
                <span className="day-card-identity">
                  <span className="day-card-face">
                    {row.headshot
                      ? <img className="day-leaders-headshot" src={row.headshot} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      : <span className="day-leaders-photo" />}
                  </span>
                  <span className="day-card-who">
                    <span className="day-card-rank">#{index + 1}</span>
                    <span className="day-leaders-name">{row.name}</span>
                    {row.position && <span className="day-leaders-pos">{row.position}</span>}
                  </span>
                  <span className="day-card-hero">
                    <b>{formatLeaderStat(activeColumn.key, row[activeColumn.key])}</b>
                    <span>{activeColumn.label}</span>
                  </span>
                </span>
                <span className="day-card-plate">
                  <Scoreboard row={row} />
                </span>
                <span className="day-card-stats">
                  {columns.filter((col) => col.key !== sort.key).map((col) => (
                    <span key={col.key} className="day-card-stat">
                      <b>{formatLeaderStat(col.key, row[col.key])}</b>
                      <span>{col.label}</span>
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

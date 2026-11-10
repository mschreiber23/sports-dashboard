import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSeasonLeaders } from '../api/seasonLeaders';
import { DAY_COLUMNS, DAY_GROUPS, DAY_SPORTS, formatLeaderStat, sortDayLeaders } from '../utils/dayLeaders';

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

function TeamMark({ row }) {
  if (!row.team && !row.teamLogo) return null;
  return (
    <span className="day-card-board">
      <span className="day-card-side">
        <TeamLogo side={{ logo: row.teamLogo, logoFallback: row.teamLogoFallback }} className="day-card-logo" />
        {row.team && <span className="day-card-pts">{row.team}</span>}
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

export default function LeadersPage() {
  const navigate = useNavigate();
  const [sport, setSport] = useState('nba');
  const [lines, setLines] = useState({ nfl: 'passing', mlb: 'hitting' });
  const [sorts, setSorts] = useState(defaultSorts);
  const [boards, setBoards] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const boardsRef = useRef({});
  const pullGen = useRef(0);

  useEffect(() => {
    let stop = false;

    async function pull() {
      const gen = ++pullGen.current;
      if (boardsRef.current[sport]) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const next = await loadSeasonLeaders(sport);
        if (stop || gen !== pullGen.current) return;
        boardsRef.current = { ...boardsRef.current, [sport]: next };
        setBoards((prev) => ({ ...prev, [sport]: next }));
        setError('');
      } catch {
        if (!stop && !boardsRef.current[sport]) setError('Could not load season totals.');
      } finally {
        if (!stop && gen === pullGen.current) setLoading(false);
      }
    }

    pull();
    return () => { stop = true; };
  }, [sport]);

  const board = boards[sport] || null;
  const groups = DAY_GROUPS[sport] || null;
  const line = groups ? lines[sport] : null;
  const view = line ? `${sport}:${line}` : sport;
  const columns = groups ? groups[line].columns : DAY_COLUMNS[sport];
  const sort = sorts[view];
  const pool = board ? (line ? board.players.filter((row) => row.line === line) : board.players) : [];
  const rows = sort ? sortDayLeaders(pool, sort.key, sort.dir) : [];

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

  return (
    <div className="day-leaders">
      <div className="day-leaders-head">
        <div>
          <h1>Leaders</h1>
          <p className="day-leaders-note">Season totals. Tap a stat to sort.</p>
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

      {loading && !board && <div className="day-leaders-status">Loading season totals…</div>}
      {error && !board && <div className="day-leaders-status">{error}</div>}
      {board && rows.length === 0 && (
        <div className="day-leaders-status">No season totals yet.</div>
      )}

      {rows.length > 0 && (
        <ol className="day-leaders-list">
          {rows.map((row, index) => (
            <li key={`${row.line || 'player'}-${row.id}`}>
              <button type="button" className="day-card" onClick={() => navigate(`/player/${sport}/${row.id}`)}>
                <span className="day-card-identity">
                  <span className="day-card-rank">#{index + 1}</span>
                  <span className="day-card-face">
                    {row.headshot
                      ? <img className="day-leaders-headshot" src={row.headshot} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      : <span className="day-leaders-photo" />}
                  </span>
                  <span className="day-leaders-title">
                    <span className="day-leaders-name">{row.name}</span>
                    {row.position && <span className="day-leaders-pos">{row.position}</span>}
                  </span>
                  <TeamMark row={row} />
                </span>
                <span className="day-card-line">
                  <span className="day-card-labels">
                    {columns.map((col) => (
                      <span key={col.key} className={col.key === sort.key ? 'on' : ''}>{col.label}</span>
                    ))}
                  </span>
                  <span className="day-card-stats">
                    {columns.map((col) => (
                      <b key={col.key} className={col.key === sort.key ? 'on' : ''}>{formatLeaderStat(col.key, row[col.key])}</b>
                    ))}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

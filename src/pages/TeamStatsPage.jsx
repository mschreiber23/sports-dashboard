import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { getTeamLogo } from '../api/espn';
import { loadNbaTeamBoard, loadNbaTeams } from '../api/nbaTeamBoard';
import { loadNhlTeamBoard, loadNhlTeams } from '../api/nhlTeamBoard';
import { chartMax, formatAverage, NBA_CATEGORIES, sortPlayers } from '../utils/nbaTeamPlayers';
import { sortSkaters } from '../utils/nhlTeamSkaters';

const SPORTS = {
  nba: {
    label: 'NBA',
    loadTeams: loadNbaTeams,
    loadBoard: loadNbaTeamBoard,
    rows: (board) => board?.players || [],
    sort: sortPlayers,
    remembered: 'nba_team_stats_id',
    empty: 'No players on this roster.',
    loading: 'Loading players…',
    note: 'Per-game averages. Tap a column to sort. The charts follow the category you pick.',
  },
  nhl: {
    label: 'NHL',
    loadTeams: loadNhlTeams,
    loadBoard: loadNhlTeamBoard,
    rows: (board) => board?.skaters || [],
    sort: (rows, key, dir) => sortSkaters(rows, key, dir),
    remembered: 'nhl_team_stats_id',
    empty: 'No skaters on this roster.',
    loading: 'Loading skaters…',
    note: 'Season points, goals, and assists. Tap a column to sort.',
  },
};

const NHL_COLUMNS = [
  { key: 'points', label: 'PTS' },
  { key: 'goals', label: 'G' },
  { key: 'assists', label: 'A' },
];

const SPORT_KEY = 'team_stats_sport';

function gameLabel(opponent) {
  if (!opponent?.date) return '';
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(opponent.date));
  const where = opponent.home ? 'vs' : '@';
  const live = opponent.state === 'in' ? 'Live · ' : '';
  return `${live}${day} ${where} ${opponent.abbreviation || opponent.name}`;
}

function Bars({ values, label, max, color }) {
  return (
    <div className="nts-chart">
      <div className="nts-chart-label">{label}</div>
      {values.length === 0 ? (
        <div className="nts-chart-empty">No games</div>
      ) : (
        <div className="nts-bars" aria-label={label}>
          {values.map((value, index) => (
            <div key={`${label}-${index}`} className="nts-bar-col">
              <div className="nts-bar-track">
                <div
                  className="nts-bar"
                  style={{ height: `${(Math.max(0, value) / max) * 100}%`, background: color }}
                />
              </div>
              <span>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerButton({ sport, row, onOpen }) {
  return (
    <button type="button" className="nts-player" onClick={() => onOpen(`/player/${sport}/${row.id}`)}>
      {row.headshot
        ? <img src={row.headshot} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
        : <span className="nts-photo" />}
      {sport === 'nba' ? (
        <span className="nts-id">
          <span className="nts-name">{row.name}</span>
          {row.position && <span className="nts-pos">{row.position}</span>}
        </span>
      ) : (
        <>
          <span className="nts-name">{row.name}</span>
          {row.position && <span className="nts-pos">{row.position}</span>}
        </>
      )}
    </button>
  );
}

export function LegacyTeamStats({ sport }) {
  const { teamId } = useParams();
  const to = teamId ? `/team-stats/${sport}/${teamId}` : `/team-stats/${sport}`;
  return <Navigate to={to} replace />;
}

export default function TeamStatsPage() {
  const { sport: sportParam, teamId } = useParams();
  const navigate = useNavigate();
  const sport = SPORTS[sportParam] ? sportParam : '';
  const spec = SPORTS[sport] || SPORTS.nba;
  const [teams, setTeams] = useState([]);
  const [teamSport, setTeamSport] = useState('');
  const [board, setBoard] = useState(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [sort, setSort] = useState({ key: 'points', dir: 'desc' });
  const [category, setCategory] = useState('points');

  useEffect(() => {
    if (sport) return;
    const remembered = localStorage.getItem(SPORT_KEY);
    const next = SPORTS[remembered] ? remembered : 'nba';
    navigate(`/team-stats/${next}`, { replace: true });
  }, [sport, navigate]);

  useEffect(() => {
    if (!sport) return;
    localStorage.setItem(SPORT_KEY, sport);
    setSort({ key: 'points', dir: 'desc' });
    setCategory('points');
    let cancel = false;
    setTeams([]);
    spec.loadTeams()
      .then((list) => {
        if (cancel) return;
        setTeams(list);
        setTeamSport(sport);
      })
      .catch(() => { if (!cancel) setError('Could not load teams.'); });
    return () => { cancel = true; };
  }, [sport]);

  useEffect(() => {
    if (!sport || teamId || teamSport !== sport || teams.length === 0) return;
    const remembered = localStorage.getItem(spec.remembered);
    const pick = teams.find((team) => String(team.id) === remembered) || teams[0];
    if (pick?.id) navigate(`/team-stats/${sport}/${pick.id}`, { replace: true });
  }, [sport, teamId, teams, teamSport, navigate, spec.remembered]);

  useEffect(() => {
    if (!sport || !teamId) return;
    localStorage.setItem(spec.remembered, String(teamId));
    let cancel = false;
    setLoading(true);
    setError('');
    setProgress('');
    setBoard(null);
    const requestKey = `${sport}:${teamId}`;
    spec.loadBoard(teamId, (done, total) => {
      if (!cancel) setProgress(`${done} of ${total}`);
    }).then((next) => {
      if (cancel) return;
      setBoard(next);
      setLoadedKey(requestKey);
    }).catch(() => {
      if (!cancel) setError('Could not load this team.');
    }).finally(() => {
      if (!cancel) setLoading(false);
    });
    return () => { cancel = true; };
  }, [sport, teamId]);

  const teamList = teamSport === sport ? teams : [];
  const visibleBoard = loadedKey === `${sport}:${teamId || ''}` ? board : null;
  const team = teamList.find((item) => String(item.id) === String(teamId));
  const sourceRows = spec.rows(visibleBoard);
  const rows = useMemo(
    () => (sport ? spec.sort(sourceRows, sort.key, sort.dir) : []),
    [sourceRows, sort, sport],
  );
  const color = team?.color ? `#${String(team.color).replace('#', '')}` : '#3aabff';
  const selected = NBA_CATEGORIES.find((item) => item.key === category) || NBA_CATEGORIES[0];
  const opponent = visibleBoard?.opponent;
  const versusName = opponent?.abbreviation || opponent?.name || 'opponent';
  const versusLabel = sport === 'nba'
    ? `Last 10 ${selected.word} vs ${versusName}`
    : `Last 10 vs ${versusName}`;

  function chooseSport(next) {
    if (next === sport) return;
    const remembered = localStorage.getItem(SPORTS[next].remembered);
    navigate(remembered ? `/team-stats/${next}/${remembered}` : `/team-stats/${next}`);
  }

  function chooseSort(key) {
    setSort((current) => (
      current.key === key
        ? { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    ));
  }

  function columns() {
    const list = sport === 'nhl' ? NHL_COLUMNS : NBA_CATEGORIES;
    return list.map((column) => {
      const active = sort.key === column.key;
      const mark = !active ? '' : sort.dir === 'asc' ? '↑' : '↓';
      return (
        <button
          key={column.key}
          type="button"
          className={active ? 'on' : ''}
          onClick={() => chooseSort(column.key)}
        >
          {column.label}{mark}
        </button>
      );
    });
  }

  return (
    <div className={`nts${sport === 'nba' ? ' nba-team' : ''}`}>
      <div className="nts-head">
        <h1>Team Stats</h1>
        <p className="nts-note">{spec.note}</p>
      </div>

      <div className="nts-cats" role="group" aria-label="Sport">
        {Object.entries(SPORTS).map(([key, item]) => (
          <button
            key={key}
            type="button"
            className={key === sport ? 'on' : ''}
            aria-pressed={key === sport}
            onClick={() => chooseSport(key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="nts-picker">
        {team && getTeamLogo(team) && <img src={getTeamLogo(team)} alt="" className="nts-picker-logo" />}
        <select
          aria-label={`${spec.label} team`}
          value={teamId || ''}
          onChange={(event) => navigate(`/team-stats/${sport}/${event.target.value}`)}
        >
          {!teamId && <option value="">Choose a team</option>}
          {teamList.map((item) => (
            <option key={item.id} value={item.id}>
              {item.displayName || item.name}
            </option>
          ))}
        </select>
      </label>

      {opponent && <p className="nts-next">{gameLabel(opponent)}</p>}

      {sport === 'nba' && (
        <div className="nts-cats" role="group" aria-label="Chart category">
          {NBA_CATEGORIES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === selected.key ? 'on' : ''}
              aria-pressed={item.key === selected.key}
              onClick={() => setCategory(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="nts-status">{progress ? `Loading game logs, ${progress}` : spec.loading}</p>}
      {error && <p className="nts-status">{error}</p>}

      {rows.length > 0 && (
        <div className="nts-list">
          <div className="nts-columns" role="row">
            <span>{sport === 'nhl' ? 'Skaters' : 'Players'}</span>
            {columns()}
          </div>
          {sport === 'nba' && rows.map((row) => {
            const last10 = row.last10[selected.key] || [];
            const versus = row.versus[selected.key] || [];
            const max = chartMax([last10, versus]);
            return (
              <article key={row.id} className="nts-row">
                <PlayerButton sport="nba" row={row} onOpen={navigate} />
                {NBA_CATEGORIES.map((column) => (
                  <span key={column.key} className="nts-stat">{formatAverage(row.averages[column.key])}</span>
                ))}
                <div className="nts-charts">
                  <Bars values={last10} label={`Last 10 ${selected.word}`} max={max} color={color} />
                  <Bars values={versus} label={versusLabel} max={max} color={color} />
                </div>
              </article>
            );
          })}
          {sport === 'nhl' && rows.map((row) => {
            const max = chartMax([row.last10, row.versus]);
            return (
              <article key={row.id} className="nts-row">
                <PlayerButton sport="nhl" row={row} onOpen={navigate} />
                <span className="nts-stat">{row.points}</span>
                <span className="nts-stat">{row.goals}</span>
                <span className="nts-stat">{row.assists}</span>
                <div className="nts-charts">
                  <Bars values={row.last10} label="Last 10" max={max} color={color} />
                  <Bars values={row.versus} label={versusLabel} max={max} color={color} />
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!loading && !error && visibleBoard && rows.length === 0 && (
        <p className="nts-status">{spec.empty}</p>
      )}
    </div>
  );
}

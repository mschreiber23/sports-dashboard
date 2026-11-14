import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTeamLogo } from '../api/espn';
import { loadNhlTeamBoard, loadNhlTeams } from '../api/nhlTeamBoard';
import { chartMax, sortSkaters } from '../utils/nhlTeamSkaters';

const COLUMNS = [
  { key: 'points', label: 'PTS' },
  { key: 'goals', label: 'G' },
  { key: 'assists', label: 'A' },
];

const REMEMBERED = 'nhl_team_stats_id';

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

export default function NhlTeamPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [sort, setSort] = useState({ key: 'points', dir: 'desc' });

  useEffect(() => {
    let cancel = false;
    loadNhlTeams()
      .then((list) => { if (!cancel) setTeams(list); })
      .catch(() => { if (!cancel) setError('Could not load NHL teams.'); });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (teamId || teams.length === 0) return;
    const remembered = localStorage.getItem(REMEMBERED);
    const pick = teams.find((team) => String(team.id) === remembered) || teams[0];
    if (pick?.id) navigate(`/nhl-teams/${pick.id}`, { replace: true });
  }, [teamId, teams, navigate]);

  useEffect(() => {
    if (!teamId) return;
    localStorage.setItem(REMEMBERED, String(teamId));
    let cancel = false;
    setLoading(true);
    setError('');
    setProgress('');
    setBoard(null);
    loadNhlTeamBoard(teamId, (done, total) => {
      if (!cancel) setProgress(`${done} of ${total}`);
    }).then((next) => {
      if (!cancel) setBoard(next);
    }).catch(() => {
      if (!cancel) setError('Could not load this team.');
    }).finally(() => {
      if (!cancel) setLoading(false);
    });
    return () => { cancel = true; };
  }, [teamId]);

  const team = teams.find((item) => String(item.id) === String(teamId));
  const rows = useMemo(
    () => sortSkaters(board?.skaters || [], sort.key, sort.dir),
    [board, sort],
  );
  const color = team?.color ? `#${String(team.color).replace('#', '')}` : '#3aabff';
  const opponent = board?.opponent;
  const versusLabel = opponent
    ? `Last 10 vs ${opponent.abbreviation || opponent.name}`
    : 'Last 10 vs opponent';

  function chooseSort(key) {
    setSort((current) => (
      current.key === key
        ? { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    ));
  }

  return (
    <div className="nts">
      <div className="nts-head">
        <h1>NHL Teams</h1>
        <p className="nts-note">Season points, goals, and assists. Tap a column to sort.</p>
      </div>

      <label className="nts-picker">
        {team && getTeamLogo(team) && <img src={getTeamLogo(team)} alt="" className="nts-picker-logo" />}
        <select
          aria-label="NHL team"
          value={teamId || ''}
          onChange={(event) => navigate(`/nhl-teams/${event.target.value}`)}
        >
          {!teamId && <option value="">Choose a team</option>}
          {teams.map((item) => (
            <option key={item.id} value={item.id}>
              {item.displayName || item.name}
            </option>
          ))}
        </select>
      </label>

      {opponent && <p className="nts-next">{gameLabel(opponent)}</p>}
      {loading && <p className="nts-status">{progress ? `Loading game logs, ${progress}` : 'Loading skaters…'}</p>}
      {error && <p className="nts-status">{error}</p>}

      {rows.length > 0 && (
        <div className="nts-list">
          <div className="nts-columns" role="row">
            <span>Skaters</span>
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              const mark = !active ? '' : sort.dir === 'asc' ? ' ↑' : ' ↓';
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
            })}
          </div>
          {rows.map((row) => {
            const max = chartMax([row.last10, row.versus]);
            return (
              <article key={row.id} className="nts-row">
                <button type="button" className="nts-player" onClick={() => navigate(`/player/nhl/${row.id}`)}>
                  {row.headshot
                    ? <img src={row.headshot} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                    : <span className="nts-photo" />}
                  <span className="nts-name">{row.name}</span>
                  {row.position && <span className="nts-pos">{row.position}</span>}
                </button>
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
      {!loading && !error && board && rows.length === 0 && (
        <p className="nts-status">No skaters on this roster.</p>
      )}
    </div>
  );
}

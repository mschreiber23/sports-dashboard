import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nhlRegularSeasonPoints } from '../api/playerLogs';
import { loadNhlSlate } from '../api/nhlSlate';
import { easternDay, formatDayLabel } from '../api/polymarket';
import { coldScorers } from '../utils/coldStreak';

function clock(ms) {
  if (!ms) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

function rate(value) {
  return value.toFixed(2);
}

export default function NhlColdPage() {
  const navigate = useNavigate();
  const day = easternDay(Date.now());
  const [rows, setRows] = useState([]);
  const [games, setGames] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [error, setError] = useState('');
  const [loadingSlate, setLoadingSlate] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      let slate = [];
      try {
        slate = await loadNhlSlate(day);
      } catch (err) {
        if (!cancel) {
          setError(err?.message || 'Could not load tonight’s games.');
          setLoadingSlate(false);
        }
        return;
      }
      if (cancel) return;
      const live = (slate || []).filter((game) => game.state !== 'post');
      const list = live.flatMap((game) => game.players || []);
      setGames(live.length);
      setTotal(list.length);
      setLoadingSlate(false);
      if (!list.length) return;

      const found = [];
      let cursor = 0;
      let finished = 0;
      async function worker() {
        while (cursor < list.length) {
          const player = list[cursor++];
          try {
            const season = await nhlRegularSeasonPoints(player.id, player.gameStart);
            const row = { ...player, games: season };
            if (coldScorers([row]).length) found.push(row);
          } catch { /* one skater should not blank the list */ }
          finished += 1;
          if (cancel) return;
          setDone(finished);
          setRows(coldScorers(found));
        }
      }
      await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker));
    })();
    return () => { cancel = true; };
  }, [day]);

  return (
    <div className="nhl-points">
      <h1 className="page-title">Cold streaks</h1>
      <p className="nhl-points-note">
        Skaters playing {formatDayLabel(day) === 'Today' ? 'tonight' : formatDayLabel(day)} who have gone at least two games without a point and still average 0.65 points a game this season. Longest drought first.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {loadingSlate && <div className="tp-loading">Loading tonight’s games…</div>}
      {!loadingSlate && !error && games === 0 && <div className="empty-state"><p>No NHL games left tonight.</p></div>}
      {!loadingSlate && games > 0 && (
        <p className="nhl-points-progress">
          {done < total
            ? `Checking ${done} of ${total} skaters…`
            : rows.length
              ? `${rows.length} skaters on a drought.`
              : 'Nobody on tonight’s slate is on a drought that long.'}
        </p>
      )}
      <div className="nhl-points-list">
        {rows.map((row, index) => (
          <article key={row.id} className="nhl-point">
            <button type="button" className="nhl-point-main" onClick={() => navigate(`/player/nhl/${row.id}`)}>
              <span className="nhl-point-rank">{index + 1}</span>
              {row.headshot && (
                <img src={row.headshot} alt="" className="nhl-point-photo" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
              )}
              <span className="nhl-point-who">
                <span className="nhl-point-name">{row.shortName || row.name}</span>
                <span className="nhl-point-meta">
                  {row.position ? `${row.position} · ` : ''}
                  {row.teamAbbr} {row.home ? 'vs' : '@'} {row.opponentAbbr}
                  {row.gameStart ? ` · ${clock(row.gameStart)} ET` : ''}
                  {` · ${rate(row.perGame)} per game · ${row.points} points in ${row.games}`}
                </span>
              </span>
              <span className="nhl-cold-streak">
                <b>{row.streak}</b>
                <span>{row.streak === 1 ? 'game' : 'games'}</span>
              </span>
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

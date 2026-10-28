import { useEffect, useState } from 'react';
import { getGameBoxscore } from '../api/espn';
import { nbaPlayedSides } from '../utils/nbaScoreLine';

export default function NbaScoreStats({ gameId, awayId, homeId, live = false }) {
  const [open, setOpen] = useState(false);
  const [sides, setSides] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !gameId) return undefined;
    let cancel = false;
    const load = () => {
      getGameBoxscore('nba', gameId)
        .then((summary) => {
          if (cancel) return;
          setSides(nbaPlayedSides(summary, awayId, homeId));
          setError(false);
        })
        .catch(() => { if (!cancel) setError(true); });
    };
    load();
    const timer = live ? setInterval(load, 30000) : null;
    return () => {
      cancel = true;
      if (timer) clearInterval(timer);
    };
  }, [open, gameId, awayId, homeId, live]);

  const played = (sides || []).reduce((sum, side) => sum + side.players.length, 0);

  return (
    <div className="nba-stats-wrap" onClick={(event) => event.stopPropagation()}>
      <div className="mlbc-divider" />
      <button
        type="button"
        className={`nba-stats-toggle${open ? ' nba-stats-on' : ''}`}
        aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
      >
        Player Stats
      </button>
      {open && (
        <div className="nba-stats">
          {error && <p className="nba-stats-empty">Stats aren’t available.</p>}
          {!error && sides == null && <p className="nba-stats-empty">Loading stats…</p>}
          {!error && sides && played === 0 && <p className="nba-stats-empty">No one has played yet.</p>}
          {!error && sides && played > 0 && sides.map((side) => (
            <div className="nba-stats-side" key={side.id || side.abbr}>
              <div className="nba-stats-team">{side.abbr}</div>
              {side.players.map((player) => (
                <div className="nba-stats-row" key={player.id || player.name}>
                  <span className="nba-stats-name">{player.name}</span>
                  <span className="nba-stats-line">{player.line}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

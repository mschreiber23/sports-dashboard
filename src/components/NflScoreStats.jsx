import { useEffect, useState } from 'react';
import { getGameBoxscore } from '../api/espn';
import { nflPlayedSides } from '../utils/nflScoreLine';

export default function NflScoreStats({ gameId, awayId, homeId, live = false }) {
  const [open, setOpen] = useState(false);
  const [sides, setSides] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !gameId) return undefined;
    let cancel = false;
    const load = () => {
      getGameBoxscore('nfl', gameId)
        .then((summary) => {
          if (cancel) return;
          setSides(nflPlayedSides(summary, awayId, homeId));
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

  const played = (sides || []).reduce((sum, side) => sum + side.sections.reduce((count, section) => count + section.players.length, 0), 0);

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
          {!error && sides && played > 0 && sides.filter((side) => side.sections.length > 0).map((side) => (
            <div className="nba-stats-side" key={side.id || side.abbr}>
              <div className="nba-stats-team">{side.abbr}</div>
              {side.sections.map((section) => (
                <div className={`nfl-stats-group nfl-stats-${section.key}`} key={section.key}>
                  <div className="nba-stats-head">
                    <span className="nfl-stats-label">{section.label}</span>
                    {section.columns.map((col) => (
                      <span className="nba-stats-col" key={col.key}>{col.label}</span>
                    ))}
                  </div>
                  {section.players.map((player) => (
                    <div className="nba-stats-row" key={player.id || player.name}>
                      <span className="nba-stats-name">{player.name}</span>
                      {player.stats.map((value, index) => (
                        <span
                          className={`nba-stats-cell${value === '0' ? ' is-zero' : ''}`}
                          key={section.columns[index].key}
                        >
                          {value}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

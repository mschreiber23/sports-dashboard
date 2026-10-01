import { useEffect, useMemo, useState } from 'react';
import {
  loadPlayerProps, formatGameTime, formatLiquidity, compareProps,
  easternDay, shiftDay, formatDayLabel,
} from '../api/polymarket';
import { attachSeasonStats, formatAvg } from '../api/propStats';
import { bookLabel } from '../utils/propHit';

const TABS = ['All', 'NFL', 'NBA', 'WNBA', 'MLB', 'NHL', 'Soccer'];

function pct(n) {
  return `${Math.round(n * 100)}%`;
}

function hitClass(row) {
  if (row.hit >= 0.72 && row.quality >= 0.45) return 'props-hit-strong';
  if (row.hit >= 0.6) return 'props-hit-mid';
  return 'props-hit-weak';
}

function likely(row) {
  return !row.lock && row.hit >= 0.64 && row.quality >= 0.5 && (row.statP == null || row.statP >= 0.55);
}

function PropCard({ row }) {
  const spread = row.spread == null ? null : `${Math.round(row.spread * 100)}¢`;
  return (
    <a className="props-card" href={row.url} target="_blank" rel="noopener noreferrer">
      <div className="props-card-top">
        <div className="props-card-main">
          <div className="props-player">
            {row.player}
            {likely(row) && <span className="props-likely">Likely</span>}
          </div>
          <div className="props-side">{row.sideText}</div>
        </div>
        <div className={`props-hit ${hitClass(row)}`}>
          <span className="props-hit-num">{pct(row.hit)}</span>
          <span className="props-hit-lbl">to hit</span>
        </div>
      </div>
      <div className="props-factors">
        <span>Market {pct(row.marketP)}</span>
        <span>{bookLabel(row.quality)}</span>
        {spread && <span>{spread} spread</span>}
        <span>{formatLiquidity(row.liquidity)}</span>
      </div>
      {row.seasonAvg != null && row.statP != null && (
        <div className="props-season">
          Season {formatAvg(row.seasonAvg)} {row.seasonUnit} · stats {pct(row.statP)} {row.side.toLowerCase()}
        </div>
      )}
    </a>
  );
}

export default function PropsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const [statsNote, setStatsNote] = useState(false);
  const [sport, setSport] = useState('All');
  const [day, setDay] = useState(() => easternDay(Date.now()));
  const [gameKey, setGameKey] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancel = false;
    setRows(null);
    setError('');
    setStatsNote(false);
    loadPlayerProps((next) => { if (!cancel) setProgress(next); })
      .then(async (list) => {
        if (cancel) return;
        setRows(list);
        const withStats = await attachSeasonStats(list);
        if (cancel) return;
        withStats.sort(compareProps);
        setRows(withStats);
        setStatsNote(withStats.some((row) => row.seasonAvg != null));
      })
      .catch((err) => {
        if (!cancel) setError(err?.message || 'Could not load props');
      });
    return () => { cancel = true; };
  }, [reloadKey]);

  const games = useMemo(() => {
    const map = new Map();
    for (const row of rows || []) {
      if (easternDay(row.gameStart) !== day) continue;
      if (sport !== 'All' && row.sport !== sport) continue;
      const key = row.eventSlug || row.id;
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: row.eventTitle || row.question,
          sport: row.sport,
          gameStart: row.gameStart,
          rows: [],
        });
      }
      map.get(key).rows.push(row);
    }
    const list = [...map.values()];
    for (const game of list) game.rows.sort(compareProps);
    list.sort((a, b) => a.gameStart - b.gameStart || a.title.localeCompare(b.title));
    return list;
  }, [rows, day, sport]);

  const counts = useMemo(() => {
    const bySport = new Map();
    const seen = new Set();
    for (const row of rows || []) {
      if (easternDay(row.gameStart) !== day) continue;
      const key = `${row.sport}|${row.eventSlug || row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bySport.set(row.sport, (bySport.get(row.sport) || 0) + 1);
    }
    return bySport;
  }, [rows, day]);

  const openGame = games.find((game) => game.key === gameKey) || null;

  return (
    <div className="page-content props-page">
      <div className="props-header">
        <h1 className="page-title">Props</h1>
        <p className="props-note">
          Games for the day, including NHL. Open a game to see every prop, most likely to hit first.
          {statsNote ? ' Season averages are blended in for the strongest NFL, NBA, WNBA, and MLB props.' : ''}
          {' '}This is a read of the market, not a pick.
        </p>
      </div>

      {rows == null && !error && (
        <div className="loading-text">
          Loading props… {progress.total ? `${progress.done}/${progress.total}` : ''}
        </div>
      )}

      {error && (
        <div className="empty-state">
          <p>Couldn’t load Polymarket props.</p>
          <button className="btn-primary" type="button" onClick={() => setReloadKey((n) => n + 1)}>Try again</button>
        </div>
      )}

      {rows && !openGame && (
        <>
          <div className="props-day-nav">
            <button type="button" className="props-day-btn" onClick={() => { setDay((d) => shiftDay(d, -1)); setGameKey(null); }} aria-label="Previous day">‹</button>
            <span className="props-day-label">{formatDayLabel(day)}</span>
            <button type="button" className="props-day-btn" onClick={() => { setDay((d) => shiftDay(d, 1)); setGameKey(null); }} aria-label="Next day">›</button>
          </div>

          <div className="scores-sport-tabs">
            {TABS.map((name) => {
              const count = name === 'All'
                ? [...counts.values()].reduce((sum, n) => sum + n, 0)
                : (counts.get(name) || 0);
              return (
                <button key={name} type="button" className={`ts-tab ${sport === name ? 'ts-tab-active' : ''}`} onClick={() => setSport(name)}>
                  {name}
                  <span className="props-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          {games.length === 0 && (
            <div className="empty-state">
              <p>No {sport === 'All' ? '' : `${sport} `}games with props on {formatDayLabel(day).toLowerCase()}.</p>
            </div>
          )}

          <div className="props-list">
            {games.map((game) => {
              const best = game.rows[0];
              return (
                <button key={game.key} type="button" className="props-game" onClick={() => setGameKey(game.key)}>
                  <div className="props-game-main">
                    <div className="props-game-title">{game.title}</div>
                    <div className="props-game-meta">
                      {sport === 'All' ? `${game.sport} · ` : ''}{formatGameTime(game.gameStart)} · {game.rows.length} props
                    </div>
                  </div>
                  {best && (
                    <div className="props-game-best">
                      <span>{pct(best.hit)}</span>
                      <span>{best.sideText}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {openGame && (
        <>
          <button type="button" className="props-back" onClick={() => setGameKey(null)}>‹ Games</button>
          <div className="props-sport-head">
            <h2>{openGame.title}</h2>
            <span>{formatGameTime(openGame.gameStart)}</span>
          </div>
          <div className="props-list">
            {openGame.rows.map((row) => <PropCard key={row.id} row={row} />)}
          </div>
        </>
      )}
    </div>
  );
}

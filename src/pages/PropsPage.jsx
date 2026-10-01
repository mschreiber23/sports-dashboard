import { useEffect, useMemo, useState } from 'react';
import { loadPlayerProps, formatGameTime, formatLiquidity, SPORT_ORDER, compareProps } from '../api/polymarket';
import { attachSeasonStats, formatAvg } from '../api/propStats';
import { bookLabel } from '../utils/propHit';

function pct(n) {
  return `${Math.round(n * 100)}%`;
}

function sideLine(row) {
  if (row.ou && row.line != null) return `${row.side} ${row.line} ${row.propLabel}`;
  if (row.question.includes(':')) return row.question.split(':').slice(1).join(':').trim();
  return row.propLabel;
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
          <div className="props-side">{sideLine(row)}</div>
          <div className="props-meta">
            {[row.eventTitle, formatGameTime(row.gameStart)].filter(Boolean).join(' · ')}
          </div>
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

function SportBlock({ sport, rows, limit }) {
  const visible = rows.slice(0, limit);
  if (!visible.length) return null;
  return (
    <section className="props-sport">
      <div className="props-sport-head">
        <h2>{sport}</h2>
        <span>{rows.length}</span>
      </div>
      <div className="props-list">
        {visible.map((row) => <PropCard key={row.id} row={row} />)}
      </div>
    </section>
  );
}

export default function PropsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const [statsNote, setStatsNote] = useState(false);
  const [sport, setSport] = useState('All');
  const [shown, setShown] = useState(20);
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

  const sports = useMemo(() => {
    const counts = new Map();
    for (const row of rows || []) counts.set(row.sport, (counts.get(row.sport) || 0) + 1);
    const known = SPORT_ORDER.filter((name) => counts.has(name));
    const rest = [...counts.keys()].filter((name) => !SPORT_ORDER.includes(name)).sort();
    return [...known, ...rest];
  }, [rows]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const name of sports) map.set(name, []);
    for (const row of rows || []) {
      if (!map.has(row.sport)) map.set(row.sport, []);
      map.get(row.sport).push(row);
    }
    for (const list of map.values()) list.sort(compareProps);
    return map;
  }, [rows, sports]);

  const strongest = useMemo(() => {
    return (rows || [])
      .filter((row) => !row.lock && row.quality >= 0.35)
      .slice()
      .sort(compareProps)
      .slice(0, 5);
  }, [rows]);

  const selected = sport === 'All' ? null : (grouped.get(sport) || []);

  return (
    <div className="page-content props-page">
      <div className="props-header">
        <h1 className="page-title">Props</h1>
        <p className="props-note">
          Open Polymarket player props, grouped by sport. Over/unders show the side the market favors. When a player has several lines, this keeps the one most likely to hit that is still under a 90% lock. Yes/no props show the chance that prop happens. A thin book or a wide spread pulls the number down.
          {statsNote ? ' Season averages are blended in for the strongest NFL, NBA, WNBA, and MLB props.' : ''}
          {' '}Near-locks above 90% sit lower in each sport. This is a read of the market, not a pick.
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

      {rows && rows.length === 0 && (
        <div className="empty-state">
          <p>No open player props in the next few days.</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="scores-sport-tabs">
            <button type="button" className={`ts-tab ${sport === 'All' ? 'ts-tab-active' : ''}`} onClick={() => { setSport('All'); setShown(20); }}>
              All
            </button>
            {sports.map((name) => (
              <button key={name} type="button" className={`ts-tab ${sport === name ? 'ts-tab-active' : ''}`} onClick={() => { setSport(name); setShown(20); }}>
                {name}
                <span className="props-tab-count">{grouped.get(name)?.length || 0}</span>
              </button>
            ))}
          </div>

          {sport === 'All' && strongest.length > 0 && (
            <section className="props-sport">
              <div className="props-sport-head">
                <h2>Most likely</h2>
              </div>
              <div className="props-list">
                {strongest.map((row) => <PropCard key={row.id} row={row} />)}
              </div>
            </section>
          )}

          {sport === 'All' && sports.map((name) => (
            <SportBlock key={name} sport={name} rows={grouped.get(name) || []} limit={8} />
          ))}

          {selected && (
            <>
              <SportBlock sport={sport} rows={selected} limit={shown} />
              {shown < selected.length && (
                <button type="button" className="props-more" onClick={() => setShown((n) => n + 30)}>
                  Show more {sport}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  loadPlayerProps, loadNhlPropsForSlugs, mergePropRows,
  formatGameTime, formatLiquidity, compareProps,
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

function lineWindow(lines, selected) {
  const idx = Math.max(0, lines.findIndex((item) => item.line === selected));
  if (lines.length <= 3) return lines;
  const start = Math.min(Math.max(idx - 1, 0), lines.length - 3);
  return lines.slice(start, start + 3);
}

function groupNhlPlayers(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.type !== 'hockey_player_goals' && row.type !== 'hockey_player_points') continue;
    if (row.line == null) continue;
    const key = `${row.playerId}|${row.type}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        player: row.player,
        type: row.type,
        jersey: row.jersey,
        jerseyNumber: row.jerseyNumber,
        teamName: row.teamName,
        color: row.color,
        lines: [],
      });
    }
    map.get(key).lines.push(row);
  }
  for (const group of map.values()) {
    group.lines.sort((a, b) => a.line - b.line);
  }
  return [...map.values()];
}

function NhlPlayerProps({ rows }) {
  const groups = useMemo(() => groupNhlPlayers(rows), [rows]);
  const [stat, setStat] = useState('hockey_player_goals');
  const [team, setTeam] = useState('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [picked, setPicked] = useState({});

  const teams = useMemo(() => {
    const names = new Set();
    for (const group of groups) if (group.teamName) names.add(group.teamName);
    return [...names].sort();
  }, [groups]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .filter((group) => group.type === stat)
      .filter((group) => team === 'all' || group.teamName === team)
      .filter((group) => !q || group.player.toLowerCase().includes(q))
      .map((group) => {
        const selected = group.lines.some((line) => line.line === picked[group.key])
          ? picked[group.key]
          : group.lines[0].line;
        const current = group.lines.find((line) => line.line === selected) || group.lines[0];
        return { ...group, selected, current };
      })
      .sort((a, b) => b.lines[0].yes - a.lines[0].yes || a.player.localeCompare(b.player));
  }, [groups, stat, team, query, picked]);

  function chooseLine(key, lines, dir) {
    setPicked((prev) => {
      const current = lines.some((line) => line.line === prev[key]) ? prev[key] : lines[0].line;
      const idx = lines.findIndex((line) => line.line === current);
      const next = lines[idx + dir];
      if (!next) return prev;
      return { ...prev, [key]: next.line };
    });
  }

  return (
    <div className="pp-board">
      <div className="pp-tools">
        <button type="button" className="pp-search" aria-label="Search players" onClick={() => setSearchOpen((open) => { if (open) setQuery(''); return !open; })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </button>
        {searchOpen && (
          <input
            className="pp-query"
            value={query}
            placeholder="Player"
            aria-label="Player name"
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
        <button type="button" className={`pp-pill ${stat === 'hockey_player_goals' ? 'pp-pill-on' : ''}`} onClick={() => setStat('hockey_player_goals')}>Goals</button>
        <button type="button" className={`pp-pill ${stat === 'hockey_player_points' ? 'pp-pill-on' : ''}`} onClick={() => setStat('hockey_player_points')}>Points</button>
        <select className="pp-team" aria-label="Team" value={team} onChange={(event) => setTeam(event.target.value)}>
          <option value="all">All teams</option>
          {teams.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {visible.length === 0 && <div className="empty-state"><p>No player props for that filter.</p></div>}

      <div className="pp-rows">
        {visible.map((group) => {
          const shown = lineWindow(group.lines, group.selected);
          const idx = group.lines.findIndex((line) => line.line === group.selected);
          const yesPct = `${Math.round(group.current.yes * 100)}%`;
          const noPct = `${Math.round(group.current.no * 100)}%`;
          return (
            <div key={group.key} className="pp-row">
              <div className="pp-who">
                {group.jersey ? (
                  <img className="pp-jersey" src={group.jersey} alt="" />
                ) : (
                  <span className="pp-jersey pp-jersey-fallback" style={{ background: group.color || '#333' }}>{group.jerseyNumber || ''}</span>
                )}
                <div className="pp-id">
                  <div className="pp-name">{group.player} <span>{group.selected}+</span></div>
                  <div className="pp-switch">
                    <button type="button" aria-label="Lower line" disabled={idx <= 0} onClick={() => chooseLine(group.key, group.lines, -1)}>‹</button>
                    {shown.map((line) => (
                      <button
                        key={line.id}
                        type="button"
                        className={line.line === group.selected ? 'pp-line-on' : ''}
                        onClick={() => setPicked((prev) => ({ ...prev, [group.key]: line.line }))}
                      >
                        {line.line}+
                      </button>
                    ))}
                    <button type="button" aria-label="Higher line" disabled={idx >= group.lines.length - 1} onClick={() => chooseLine(group.key, group.lines, 1)}>›</button>
                  </div>
                </div>
              </div>
              <div className="pp-pct">{yesPct}</div>
              <div className="pp-sides">
                <a className="pp-yn" href={group.current.url} target="_blank" rel="noopener noreferrer">Yes {yesPct}</a>
                <a className="pp-yn" href={group.current.url} target="_blank" rel="noopener noreferrer">No {noPct}</a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NhlGameDetail({ game, loading }) {
  const [section, setSection] = useState('players');
  const players = game.rows.filter((row) => row.type === 'hockey_player_goals' || row.type === 'hockey_player_points');
  const lines = game.rows.filter((row) => row.type === 'moneyline' || row.type === 'spreads' || row.type === 'totals');
  const props = game.rows.filter((row) => row.type === 'hockey_team_saves');
  const cards = section === 'lines' ? lines : props;
  return (
    <>
      <div className="pp-tabs">
        <button type="button" className={`pp-tab ${section === 'lines' ? 'pp-tab-on' : ''}`} onClick={() => setSection('lines')}>Game lines</button>
        <button type="button" className={`pp-tab ${section === 'players' ? 'pp-tab-on' : ''}`} onClick={() => setSection('players')}>Player props</button>
        <button type="button" className={`pp-tab ${section === 'props' ? 'pp-tab-on' : ''}`} onClick={() => setSection('props')}>Game props</button>
      </div>
      {section === 'players' && (
        loading && players.length === 0
          ? <div className="loading-text">Loading player props…</div>
          : <NhlPlayerProps rows={players} />
      )}
      {section !== 'players' && (
        <div className="props-list">
          {cards.map((row) => <PropCard key={row.id} row={row} />)}
        </div>
      )}
    </>
  );
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
        {row.liquidity != null && <span>{formatLiquidity(row.liquidity)}</span>}
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
  const [propsLoading, setPropsLoading] = useState(false);

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
        setRows((prev) => {
          const extras = (prev || []).filter((row) => String(row.id).startsWith('us:'));
          return mergePropRows(withStats, extras);
        });
        setStatsNote(withStats.some((row) => row.seasonAvg != null));
      })
      .catch((err) => {
        if (!cancel) setError(err?.message || 'Could not load props');
      });
    return () => { cancel = true; };
  }, [reloadKey]);

  const nhlSlugKey = useMemo(() => {
    const slugs = new Set();
    for (const row of rows || []) {
      if (row.sport !== 'NHL' || !row.eventSlug) continue;
      if (easternDay(row.gameStart) !== day) continue;
      slugs.add(row.eventSlug);
    }
    return [...slugs].sort().join('|');
  }, [rows, day]);

  useEffect(() => {
    const slugs = nhlSlugKey ? nhlSlugKey.split('|') : [];
    if (!slugs.length) return undefined;
    let cancel = false;
    setPropsLoading(true);
    loadNhlPropsForSlugs(slugs)
      .then((extra) => {
        if (cancel) return;
        setRows((prev) => (prev ? mergePropRows(prev, extra) : prev));
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setPropsLoading(false); });
    return () => { cancel = true; };
  }, [nhlSlugKey]);

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
          {openGame.sport === 'NHL' ? (
            <NhlGameDetail key={openGame.key} game={openGame} loading={propsLoading} />
          ) : (
            <div className="props-list">
              {openGame.rows.map((row) => <PropCard key={row.id} row={row} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

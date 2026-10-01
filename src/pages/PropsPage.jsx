import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadPropEvents, loadGameProps, PROP_SPORTS, PILL_ORDER, pillLabel,
  formatGameTime, formatLiquidity, compareProps,
  easternDay, shiftDay, formatDayLabel,
} from '../api/polymarket';
import { recentPlayerLogs, chartLabel } from '../api/playerLogs';
import { bookLabel } from '../utils/propHit';

const TABS = ['All', ...PROP_SPORTS.map((sport) => sport.label)];

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

function lineText(line) {
  return Number.isInteger(line) ? `${line}+` : `${line}+`;
}

function last10Hit(values, line) {
  if (!values?.length || line == null) return null;
  const hits = values.filter((value) => value >= line).length;
  return Math.round((hits / values.length) * 100);
}

function groupPlayers(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.section !== 'player' || row.line == null) continue;
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
        opponentName: row.opponentName || '',
        opponentAbbr: row.opponentAbbr || '',
        gameStart: row.gameStart,
        lines: [],
      });
    }
    const group = map.get(key);
    if (!group.lines.some((line) => line.line === row.line)) group.lines.push(row);
  }
  for (const group of map.values()) {
    group.lines.sort((a, b) => a.line - b.line);
  }
  return [...map.values()];
}

function StatBars({ values, color, label }) {
  if (!values) return null;
  const max = Math.max(1, ...values, 0);
  return (
    <div className="pp-log">
      <div className="pp-log-label">{label}</div>
      {values.length === 0 ? (
        <div className="pp-log-empty">No games</div>
      ) : (
        <div className="pp-bars" aria-label={label}>
          {values.map((value, index) => (
            <div key={`${label}-${index}`} className="pp-bar-col">
              <div className="pp-bar-track">
                <div className="pp-bar" style={{ height: `${(Math.max(0, value) / max) * 100}%`, background: color || '#e10600' }} />
              </div>
              <span>{Number.isInteger(value) ? value : Math.round(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerPropBoard({ rows, league }) {
  const groups = useMemo(() => groupPlayers(rows), [rows]);
  const pills = useMemo(() => {
    const present = new Set(groups.map((group) => group.type));
    const ordered = PILL_ORDER.filter((type) => present.has(type));
    for (const type of present) if (!ordered.includes(type)) ordered.push(type);
    return ordered;
  }, [groups]);
  const [logs, setLogs] = useState({});
  const [stat, setStat] = useState('');
  const [team, setTeam] = useState('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [picked, setPicked] = useState({});

  const activeStat = pills.includes(stat) ? stat : (pills[0] || '');
  const logKey = useMemo(() => groups.map((group) => `${group.player}|${group.opponentAbbr}|${group.gameStart}`).sort().join(';'), [groups]);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  useEffect(() => {
    if (!logKey) return undefined;
    let cancel = false;
    const current = groupsRef.current;
    const players = [];
    const seen = new Set();
    const ordered = [...current.filter((group) => group.type === activeStat), ...current];
    for (const group of ordered) {
      if (seen.has(group.player)) continue;
      seen.add(group.player);
      players.push({
        name: group.player,
        opponentAbbr: group.opponentAbbr,
        opponentName: group.opponentName,
        before: group.gameStart,
      });
    }
    let next = 0;
    async function worker() {
      while (next < players.length) {
        const player = players[next++];
        try {
          const result = await recentPlayerLogs(league, [player]);
          if (!cancel) setLogs((prev) => ({ ...prev, ...result }));
        } catch { /* chart stays hidden */ }
      }
    }
    Promise.all(Array.from({ length: Math.min(4, players.length) }, worker));
    return () => { cancel = true; };
  }, [logKey, league, activeStat]);

  const teams = useMemo(() => {
    const names = new Set();
    for (const group of groups) if (group.teamName) names.add(group.teamName);
    return [...names].sort();
  }, [groups]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .filter((group) => group.type === activeStat)
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
  }, [groups, activeStat, team, query, picked]);

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
        {pills.map((type) => (
          <button key={type} type="button" className={`pp-pill ${activeStat === type ? 'pp-pill-on' : ''}`} onClick={() => setStat(type)}>
            {pillLabel(type)}
          </button>
        ))}
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
          const log = logs[group.player];
          const recent = log?.series?.[activeStat] || null;
          const versus = log?.versus?.[activeStat] || null;
          const statName = chartLabel(activeStat);
          const hit = last10Hit(recent, group.selected);
          const hitText = hit == null ? '—' : `${hit}%`;
          const hitLabel = recent?.length
            ? `Last ${recent.length} hit rate, ${recent.filter((value) => value >= group.selected).length} of ${recent.length}`
            : 'Last 10 hit rate';
          return (
            <div key={group.key} className="pp-player">
              <div className="pp-row">
                <div className="pp-who">
                  {group.jersey ? (
                    <img className="pp-jersey" src={group.jersey} alt="" />
                  ) : (
                    <span className="pp-jersey pp-jersey-fallback" style={{ background: group.color || '#333' }}>{group.jerseyNumber || ''}</span>
                  )}
                  <div className="pp-id">
                    <div className="pp-name">{group.player} <span>{lineText(group.selected)}</span></div>
                    <div className="pp-switch">
                      <button type="button" aria-label="Lower line" disabled={idx <= 0} onClick={() => chooseLine(group.key, group.lines, -1)}>‹</button>
                      {shown.map((line) => (
                        <button
                          key={line.id}
                          type="button"
                          className={line.line === group.selected ? 'pp-line-on' : ''}
                          onClick={() => setPicked((prev) => ({ ...prev, [group.key]: line.line }))}
                        >
                          {lineText(line.line)}
                        </button>
                      ))}
                      <button type="button" aria-label="Higher line" disabled={idx >= group.lines.length - 1} onClick={() => chooseLine(group.key, group.lines, 1)}>›</button>
                    </div>
                  </div>
                </div>
                <div className="pp-pct" aria-label={hitLabel} title={hitLabel}>
                  <span>{hitText}</span>
                  <span className="pp-pct-l10">L10</span>
                </div>
                <div className="pp-sides">
                  <a className="pp-yn" href={group.current.url} target="_blank" rel="noopener noreferrer">Yes {yesPct}</a>
                  <a className="pp-yn" href={group.current.url} target="_blank" rel="noopener noreferrer">No {noPct}</a>
                </div>
              </div>
              {(recent || versus) && (
                <div className="pp-logs">
                  <StatBars values={recent} color={group.color} label={`Last ${recent?.length || 10} ${statName}`} />
                  <StatBars values={versus} color={group.color} label={`Last 5 vs ${log?.opponent || 'opponent'}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function primaryLines(rows) {
  const best = new Map();
  for (const row of rows) {
    const kind = row.sideText;
    const dist = Math.abs((row.marketP ?? 0) - 0.5);
    const prev = best.get(kind);
    if (!prev || dist < prev.dist) best.set(kind, { row, dist });
  }
  const order = ['moneyline', 'spread', 'total'];
  return [...best.entries()]
    .sort((a, b) => (order.indexOf(a[0]) + 1 || 9) - (order.indexOf(b[0]) + 1 || 9))
    .map((entry) => entry[1].row);
}

function GameDetail({ game, rows, loading }) {
  const [section, setSection] = useState('players');
  const list = rows || [];
  const players = list.filter((row) => row.section === 'player');
  const lines = primaryLines(list.filter((row) => row.section === 'line'));
  const props = list.filter((row) => row.section === 'prop');
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
          : <PlayerPropBoard key={game.key} rows={players} league={game.league} />
      )}
      {section !== 'players' && (
        loading && cards.length === 0
          ? <div className="loading-text">Loading markets…</div>
          : (
            <div className="props-list">
              {cards.length === 0 && <div className="empty-state"><p>No markets in this section.</p></div>}
              {cards.map((row) => <PropCard key={row.id} row={row} />)}
            </div>
          )
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
    </a>
  );
}

export default function PropsPage() {
  const [events, setEvents] = useState(null);
  const [loaded, setLoaded] = useState({});
  const [error, setError] = useState('');
  const [sport, setSport] = useState('All');
  const [day, setDay] = useState(() => easternDay(Date.now()));
  const [gameKey, setGameKey] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadingSlug, setLoadingSlug] = useState('');

  useEffect(() => {
    let cancel = false;
    setEvents(null);
    setError('');
    loadPropEvents()
      .then((list) => { if (!cancel) setEvents(list); })
      .catch((err) => { if (!cancel) setError(err?.message || 'Could not load props'); });
    return () => { cancel = true; };
  }, [reloadKey]);

  const games = useMemo(() => {
    const list = [];
    for (const event of events || []) {
      if (easternDay(event.gameStart) !== day) continue;
      if (sport !== 'All' && event.sport !== sport) continue;
      const rows = loaded[event.key];
      list.push({
        ...event,
        rows: rows ? [...rows].sort(compareProps) : null,
      });
    }
    list.sort((a, b) => a.gameStart - b.gameStart || a.title.localeCompare(b.title));
    return list;
  }, [events, day, sport, loaded]);

  const counts = useMemo(() => {
    const bySport = new Map();
    for (const event of events || []) {
      if (easternDay(event.gameStart) !== day) continue;
      bySport.set(event.sport, (bySport.get(event.sport) || 0) + 1);
    }
    return bySport;
  }, [events, day]);

  const openGame = games.find((game) => game.key === gameKey) || null;
  const prefetchKey = games.length > 0 && games.length <= 16 ? games.map((game) => game.key).join('|') : '';

  useEffect(() => {
    const slugs = prefetchKey ? prefetchKey.split('|') : [];
    if (!slugs.length) return undefined;
    let cancel = false;
    let next = 0;
    async function worker() {
      while (next < slugs.length) {
        const slug = slugs[next++];
        try {
          const rows = await loadGameProps(slug);
          if (!cancel) setLoaded((prev) => (prev[slug] ? prev : { ...prev, [slug]: rows }));
        } catch {
          if (!cancel) setLoaded((prev) => (prev[slug] ? prev : { ...prev, [slug]: [] }));
        }
      }
    }
    Promise.all(Array.from({ length: Math.min(4, slugs.length) }, worker));
    return () => { cancel = true; };
  }, [prefetchKey]);

  useEffect(() => {
    if (!gameKey) return undefined;
    let cancel = false;
    setLoadingSlug(gameKey);
    loadGameProps(gameKey)
      .then((rows) => {
        if (cancel) return;
        setLoaded((prev) => (prev[gameKey] ? prev : { ...prev, [gameKey]: rows }));
      })
      .catch(() => {
        if (!cancel) setLoaded((prev) => (prev[gameKey] ? prev : { ...prev, [gameKey]: [] }));
      })
      .finally(() => { if (!cancel) setLoadingSlug(''); });
    return () => { cancel = true; };
  }, [gameKey]);

  return (
    <div className="page-content props-page">
      <div className="props-header">
        <h1 className="page-title">Props</h1>
        <p className="props-note">
          Games for the day. Open a game for player props, the last 10 games, and the last five against the opponent.
          {' '}This is a read of the market, not a pick.
        </p>
      </div>

      {events == null && !error && (
        <div className="loading-text">Loading props…</div>
      )}

      {error && (
        <div className="empty-state">
          <p>Couldn’t load Polymarket props.</p>
          <button className="btn-primary" type="button" onClick={() => setReloadKey((n) => n + 1)}>Try again</button>
        </div>
      )}

      {events && !openGame && (
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
              <p>No {sport === 'All' ? '' : `${sport} `}games {formatDayLabel(day) === 'Today' ? 'today' : `on ${formatDayLabel(day)}`}.</p>
            </div>
          )}

          <div className="props-list">
            {games.map((game) => {
              const best = game.rows?.[0];
              const count = game.rows ? game.rows.length : game.marketCount;
              return (
                <button key={game.key} type="button" className="props-game" onClick={() => setGameKey(game.key)}>
                  <div className="props-game-main">
                    <div className="props-game-title">{game.title}</div>
                    <div className="props-game-meta">
                      {sport === 'All' ? `${game.sport} · ` : ''}{formatGameTime(game.gameStart)} · {count} props
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
          <GameDetail
            key={openGame.key}
            game={openGame}
            rows={openGame.rows}
            loading={loadingSlug === openGame.key || !openGame.rows}
          />
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadPropEvents, loadGameProps, PROP_SPORTS, PILL_ORDER, pillLabel,
  formatGameTime, formatLiquidity, compareProps,
  easternDay, shiftDay, formatDayLabel,
} from '../api/polymarket';
import { recentPlayerLogs, chartLabel } from '../api/playerLogs';
import { bookLabel } from '../utils/propHit';
import { nhlPropEdge, nhlFactorLines, NHL_EDGE_MIN } from '../utils/nhlEdge';
import { nflPropEdge, nflFactorLines, nflModeled } from '../utils/nflEdge';
import { nflWeekSpan } from '../api/nfl';
import PropLedger from '../components/PropLedger';
import { usePropSync } from '../components/PropSync';

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

const LIKELY_MIN_GAMES = 5;
const LIKELY_MIN_RATE = 70;
const LIKELY_PRICE_MIN = 0.43;
const LIKELY_PRICE_MAX = 0.66;

function likelyAgrees(model, yes, league) {
  if (!(model.p >= 0.45 && model.edge >= NHL_EDGE_MIN && model.edge <= 0.15)) return false;
  if (model.rate / 100 + 0.02 < yes) return false;
  if (model.rate / 100 + 0.08 < model.p) return false;
  if (model.tags.some((tag) => tag.endsWith(' down') || tag.endsWith(' back'))) return false;
  if (league === 'nfl' && model.tags.includes('low volume')) return false;
  return true;
}
const NFL_LIKELY_SKIP = new Set([
  'football_player_interceptions_thrown',
  'football_player_longest_reception',
  'football_player_scrimmage_yards',
]);
const NFL_LIKELY_MIN_LINE = {
  football_player_passing_yards: 150,
  football_player_rushing_yards: 40,
  football_player_receiving_yards: 30,
  football_player_receptions: 3,
  football_player_passing_completions: 18,
  football_player_passing_attempts: 25,
  football_player_rushing_attempts: 8,
  football_player_passing_touchdowns: 1.5,
  football_player_touchdowns: 0.5,
};

function mainTotalLabel(rows) {
  if (!rows) return '';
  const { total } = slateContext(rows);
  if (typeof total !== 'number' || !Number.isFinite(total)) return '';
  return `Total ${total}`;
}

function cardClock(ms) {
  if (!ms) return '';
  return `${new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms))} ET`;
}

function mainLine(lines) {
  return lines
    .filter((line) => typeof line.yes === 'number' && Number.isFinite(line.yes))
    .slice()
    .sort((a, b) => Math.abs(a.yes - 0.5) - Math.abs(b.yes - 0.5) || a.line - b.line)[0] || null;
}

function edgePoints(edge) {
  return Math.round(edge * 100);
}

function marketPct(yes) {
  return typeof yes === 'number' && Number.isFinite(yes) ? Math.round(yes * 100) : null;
}

function likelyPick(game, sample, line, recent, extra) {
  return {
    id: line.id,
    player: sample.player,
    prop: `${lineText(line.line)} ${chartLabel(sample.type)}`,
    line: line.line,
    total: recent.length,
    gameKey: game.key,
    game: game.title,
    sport: game.sport,
    market: marketPct(line.yes),
    ...extra,
  };
}

function slateContext(rows) {
  let total = null;
  let totalDist = Infinity;
  let favorite = '';
  let favoriteYes = null;
  let favoriteDist = Infinity;
  let spreadLine = null;
  let spreadLabel = '';
  let spreadDist = Infinity;
  for (const row of rows || []) {
    if (row.section !== 'line' || typeof row.yes !== 'number') continue;
    const dist = Math.abs(row.yes - 0.5);
    const type = row.type || '';
    if (row.sideText === 'total' && row.line != null && !type.includes('points_') && dist < totalDist) {
      total = row.line;
      totalDist = dist;
    }
    if (row.sideText === 'spread' && row.line != null && dist < spreadDist) {
      spreadLine = row.line;
      spreadLabel = row.player || '';
      spreadDist = dist;
    }
    if (row.sideText === 'moneyline' && dist < favoriteDist) {
      favorite = row.player || '';
      favoriteYes = row.yes;
      favoriteDist = dist;
    }
  }
  return { total, favorite, favoriteYes, spreadLine, spreadLabel };
}

function teammateLogs(entries) {
  const mates = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry?.name || seen.has(entry.name)) continue;
    seen.add(entry.name);
    if (!entry.recent && !entry.prior) continue;
    mates.push({ name: entry.name, recent: entry.recent || null, prior: entry.prior || null });
  }
  return mates;
}

function likelyBoard(games, logs, calibration) {
  const picks = [];
  for (const game of games) {
    if (!game.rows) continue;
    const slate = slateContext(game.rows);
    const groups = new Map();
    for (const row of game.rows) {
      if (row.section !== 'player' || row.line == null) continue;
      const key = `${row.playerId}|${row.type}`;
      if (!groups.has(key)) groups.set(key, []);
      const lines = groups.get(key);
      if (!lines.some((item) => item.line === row.line)) lines.push(row);
    }
    for (const lines of groups.values()) {
      const sample = lines[0];
      const log = logs[`${game.league}|${sample.player}|${sample.gameStart}`];
      const recent = log?.series?.[sample.type];
      if (!recent || recent.length < LIKELY_MIN_GAMES) continue;
      const edgeFn = (sample.type === 'hockey_player_goals' || sample.type === 'hockey_player_points')
        ? nhlPropEdge
        : (game.league === 'nfl' && nflModeled(sample.type) ? nflPropEdge : null);
      if (edgeFn) {
        const ranked = game.league === 'nfl' || game.league === 'nhl';
        const candidates = ranked ? [mainLine(lines)].filter(Boolean) : lines;
        for (const line of candidates) {
          if (ranked && (line.yes < LIKELY_PRICE_MIN || line.yes > LIKELY_PRICE_MAX)) continue;
          if (game.league === 'nfl' && (NFL_LIKELY_SKIP.has(sample.type) || !(line.line >= NFL_LIKELY_MIN_LINE[sample.type]))) continue;
          const model = edgeFn({
            type: sample.type,
            line: line.line,
            recent,
            prior: log?.prior?.[sample.type],
            recentContext: log?.context,
            priorContext: log?.priorContext,
            versus: log?.versus?.[sample.type],
            marketYes: line.yes,
            lastPlayed: log?.lastPlayed,
            gameStart: sample.gameStart,
            gameTotal: slate.total,
            teamName: sample.teamName,
            opponentName: sample.opponentName,
            favoriteName: slate.favorite,
            favoriteYes: slate.favoriteYes,
            spreadLine: slate.spreadLine,
            spreadLabel: slate.spreadLabel,
            matchup: log?.matchup,
            teammates: game.league === 'nfl' ? teammateLogs(game.rows.filter((row) => (
              row.section === 'player' && row.player !== sample.player && row.teamName && row.teamName === sample.teamName
            )).map((row) => {
              const mate = logs[`${game.league}|${row.player}|${row.gameStart}`];
              return { name: row.player, recent: mate?.context, prior: mate?.priorContext };
            })) : undefined,
            calibration: calibration?.[game.league],
          });
          if (!model) continue;
          if (ranked && !likelyAgrees(model, line.yes, game.league)) continue;
          picks.push(likelyPick(game, sample, line, recent, {
            rate: model.rate,
            hits: model.hits,
            edge: model.edge,
            edgePts: edgePoints(model.edge),
            modelPct: Math.round(model.p * 100),
            modeled: true,
            tags: model.tags,
          }));
        }
        continue;
      }
      const byRate = new Map();
      for (const line of lines) {
        const hits = recent.filter((value) => value >= line.line).length;
        const rate = Math.round((hits / recent.length) * 100);
        if (rate < LIKELY_MIN_RATE) continue;
        const prev = byRate.get(rate);
        if (!prev || line.line > prev.line) byRate.set(rate, { line, hits, rate });
      }
      for (const best of byRate.values()) {
        const yes = typeof best.line.yes === 'number' ? best.line.yes : null;
        const edge = yes == null ? 0 : best.rate / 100 - yes;
        picks.push(likelyPick(game, sample, best.line, recent, {
          rate: best.rate,
          hits: best.hits,
          edge,
          edgePts: edgePoints(edge),
          modelPct: null,
          modeled: false,
          tags: [],
        }));
      }
    }
  }
  picks.sort((a, b) => b.edge - a.edge || b.rate - a.rate || b.line - a.line || a.player.localeCompare(b.player));
  return picks;
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

const FACTOR_KEY = [
  ['Model', 'Our read of the chance this line hits, after shrinking the recent record and applying the nudges below.'],
  ['Edge', 'The model percent minus the contract’s yes price, in percentage points. A positive number means the read is above the price.'],
  ['Last 10', 'How many of the last 10 games cleared this exact line. The big percentage beside the name is this same record.'],
  ['Long sample', 'How often the line hit in the older games, up to 30. With fewer than 8 of those games, this shows a typical rate instead.'],
  ['TOI', 'Average ice time over the last five games.'],
  ['Prior TOI', 'Average ice time in the games before those five. The model compares the two.'],
  ['Shots', 'Average shots over the last five games. A sharp drop or jump in the last three games becomes the shot rate.'],
  ['Prior shots', 'Average shots in the earlier games. The model compares that with the recent rate.'],
  ['Shooting', 'Shooting percentage, pulled toward a typical NHL rate so a short hot or cold stretch does not take over.'],
  ['Assists', 'Assists per game on a points prop, pulled toward a typical rate. Goals rows leave this off.'],
  ['Volume', 'The chance implied by the shot rate at this line. Points props fold in the assist rate as well.'],
  ['Power play', 'Power-play points per game over the recent games.'],
  ['vs opponent', 'How often this line hit in the recent games against tonight’s opponent.'],
  ['Game total', 'The game total priced closest to 50/50. The model compares that number with 6 goals.'],
  ['Side', 'Whether this player’s team is the favorite or the underdog, and that team’s price.'],
  ['Rest', 'Days since the last regular-season game. A gap under 36 hours is a back-to-back.'],
];

const NFL_FACTOR_KEY = [
  ['Model', 'Our read of the chance this line hits. Most of it is expected attempts, carries, or targets times a stable efficiency rate. The last-10 record is the smaller piece.'],
  ['Edge', 'The model percent minus the contract’s yes price, in percentage points. A positive number means the read is above the price.'],
  ['Last 10', 'How many of the last 10 games cleared this exact line. The big percentage beside the name is this same record. It is shown in full, and it is the smaller piece of the read.'],
  ['Long sample', 'How often the line hit in the older games, up to 30. With fewer than 8 of those games, this shows a typical rate instead. Touchdown props give this a little more weight.'],
  ['Attempts, carries, targets', 'Average usage over the last five games. This is the main input. Passing props use attempts, rushing props use carries, and receiving props use targets. Receptions then use catch rate. Receiving yards use yards per target.'],
  ['Prior attempts, carries, targets', 'The same usage number in the earlier games. Expected usage is about two thirds the last five and one third this longer rate.'],
  ['Role', 'When a high-usage teammate missed games and this player’s targets, carries, or attempts jumped, and that teammate is in the lineup tonight, the read uses the games they played together. The chip names who is back. Those props stay off Likely.'],
  ['Y/A, YPC, catch rate', 'Efficiency pulled toward a typical NFL rate, so a short hot or cold stretch does not take over. Touchdowns use a per-attempt or per-target rate.'],
  ['Volume', 'The chance that tonight’s expected usage and that efficiency imply at this exact line. This is most of the model percent.'],
  ['vs opponent', 'How often this line hit in the recent games against tonight’s opponent. A small nudge, and only with at least three of those games.'],
  ['vs TE, WR, or RB', 'How often this defense has thrown to that position this season, and the yards per target on those throws. A share well above normal lifts expected targets a little. Yards per target moves the efficiency a little. Snap counts are not in this feed, so the player’s own targets still set the role.'],
  ['Game total', 'The full-game total priced closest to 50/50. A higher total adds a little to passing and receiving props.'],
  ['Implied', 'This team’s points, from the game total and the spread. A favorite in a 37.5-point game with a 2.5-point line is about 20. Touchdown props move with this number.'],
  ['Script', 'Throwing when this team is the underdog by about a field goal or more, running when they are favored by that much. Passing and receiving props rise on a throwing script. Rushing props rise on a running script.'],
  ['Side', 'Whether this player’s team is the moneyline favorite or the underdog, and that team’s price. The spread is what the model uses for script.'],
  ['Rest', 'Days since the last game. Under six days is a short week. Ten days or more, a bye included, counts as rested.'],
];

const FACTOR_TAGS = {
  'shot volume': 'volume',
  chances: 'volume',
  'low volume': 'volume',
  'ice time up': 'toi',
  'ice time down': 'toi',
  'shots up': 'shots',
  'shots down': 'shots',
  'power play': 'pp',
  'hot vs opponent': 'opp',
  'cold vs opponent': 'opp',
  'high total': 'total',
  'low total': 'total',
  favorite: 'side',
  underdog: 'side',
  'back to back': 'rest',
  'attempts up': 'usage',
  'attempts down': 'usage',
  'carries up': 'usage',
  'carries down': 'usage',
  'targets up': 'usage',
  'targets down': 'usage',
  'short week': 'rest',
  rested: 'rest',
  volume: 'volume',
  'pass script': 'script',
  'run script': 'script',
  'implied points': 'implied',
  'low implied': 'implied',
};

function shortOpp(name, abbr) {
  const word = String(name || '').trim();
  if (word && !word.includes(' ')) return word;
  return abbr || word.split(/\s+/).pop() || 'opponent';
}

function PlayerPropBoard({ rows, league, slate, calibration }) {
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
  const [keyOpen, setKeyOpen] = useState(false);

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
        const fallback = mainLine(group.lines)?.line ?? group.lines[0].line;
        const selected = group.lines.some((line) => line.line === picked[group.key])
          ? picked[group.key]
          : fallback;
        const current = group.lines.find((line) => line.line === selected) || group.lines[0];
        return { ...group, selected, current };
      })
      .sort((a, b) => b.current.yes - a.current.yes || a.player.localeCompare(b.player));
  }, [groups, activeStat, team, query, picked]);

  function chooseLine(key, lines, dir) {
    setPicked((prev) => {
      const current = lines.some((line) => line.line === prev[key]) ? prev[key] : (mainLine(lines)?.line ?? lines[0].line);
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

      {(league === 'nhl' || league === 'nfl') && (
        <>
          <button type="button" className="pp-key-btn" aria-expanded={keyOpen} onClick={() => setKeyOpen((open) => !open)}>
            {keyOpen ? 'Hide stat key' : 'Stat key'}
          </button>
          {keyOpen && (
            <div className="pp-key">
              <p>Blue numbers are the inputs that moved the model for the line selected on that player. Yes and No stay the contract price.</p>
              {(league === 'nfl' ? NFL_FACTOR_KEY : FACTOR_KEY).map(([label, text]) => (
                <div key={label} className="pp-key-row">
                  <div className="pp-key-label">{label}</div>
                  <div className="pp-key-text">{text}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

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
          const factorInput = {
            type: activeStat,
            line: group.selected,
            recent,
            prior: log?.prior?.[activeStat],
            recentContext: log?.context,
            priorContext: log?.priorContext,
            versus,
            lastPlayed: log?.lastPlayed,
            gameStart: group.gameStart,
            gameTotal: slate?.total,
            teamName: group.teamName,
            opponentName: group.opponentName,
            favoriteName: slate?.favorite,
            favoriteYes: slate?.favoriteYes,
            spreadLine: slate?.spreadLine,
            spreadLabel: slate?.spreadLabel,
            opponentLabel: shortOpp(group.opponentName, group.opponentAbbr),
            matchup: log?.matchup,
            teammates: league === 'nfl' ? teammateLogs(groups.filter((other) => (
              other.player !== group.player && other.teamName && other.teamName === group.teamName
            )).map((other) => ({
              name: other.player,
              recent: logs[other.player]?.context,
              prior: logs[other.player]?.priorContext,
            }))) : undefined,
          };
          const factorFn = league === 'nhl' ? nhlFactorLines : (league === 'nfl' ? nflFactorLines : null);
          const edgeFn = league === 'nhl' ? nhlPropEdge : (league === 'nfl' ? nflPropEdge : null);
          const factors = factorFn ? factorFn(factorInput) : [];
          const model = factors.length && edgeFn ? edgeFn({ ...factorInput, marketYes: group.current.yes, calibration }) : null;
          const moved = new Set((model?.tags || []).map((tag) => {
            if (FACTOR_TAGS[tag]) return FACTOR_TAGS[tag];
            if (String(tag).endsWith(' back')) return 'usage';
            if (/^(TE|WR|RB) targets/.test(tag)) return 'pos';
            return null;
          }).filter(Boolean));
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
              {factors.length > 0 && (
                <div className="pp-factors">
                  {model && (
                    <div className="pp-factor pp-factor-on">
                      <span>Model</span>
                      <span>{Math.round(model.p * 100)}%</span>
                    </div>
                  )}
                  {model && (
                    <div className={`pp-factor ${model.edge >= NHL_EDGE_MIN ? 'pp-factor-on' : ''}`}>
                      <span>Edge</span>
                      <span>{model.edge >= 0 ? `+${Math.round(model.edge * 100)}` : Math.round(model.edge * 100)}</span>
                    </div>
                  )}
                  {factors.map((item) => (
                    <div key={`${item.label}-${item.value}`} className={`pp-factor ${moved.has(item.id) ? 'pp-factor-on' : ''}`}>
                      <span>{item.label}</span>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>
              )}
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

function GameDetail({ game, rows, loading, calibration }) {
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
          : <PlayerPropBoard key={game.key} rows={players} league={game.league} slate={slateContext(list)} calibration={calibration} />
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
  const { calibration } = usePropSync();
  const [events, setEvents] = useState(null);
  const [loaded, setLoaded] = useState({});
  const [error, setError] = useState('');
  const [sport, setSport] = useState('All');
  const [day, setDay] = useState(() => easternDay(Date.now()));
  const [gameKey, setGameKey] = useState(null);
  const [view, setView] = useState('games');
  const [boardLogs, setBoardLogs] = useState({});
  const [logDone, setLogDone] = useState(0);
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

  const nflWeek = useMemo(() => nflWeekSpan(day), [day]);

  const games = useMemo(() => {
    const list = [];
    const weekView = sport === 'NFL' && nflWeek;
    for (const event of events || []) {
      const eventDay = easternDay(event.gameStart);
      if (weekView) {
        if (event.sport !== 'NFL' || eventDay < nflWeek.start || eventDay > nflWeek.end) continue;
      } else if (eventDay !== day || (sport !== 'All' && event.sport !== sport)) {
        continue;
      }
      const rows = loaded[event.key];
      list.push({
        ...event,
        rows: rows ? [...rows].sort(compareProps) : null,
      });
    }
    list.sort((a, b) => a.gameStart - b.gameStart || a.title.localeCompare(b.title));
    return list;
  }, [events, day, sport, loaded, nflWeek]);

  const counts = useMemo(() => {
    const bySport = new Map();
    let nfl = 0;
    for (const event of events || []) {
      const eventDay = easternDay(event.gameStart);
      if (eventDay === day) bySport.set(event.sport, (bySport.get(event.sport) || 0) + 1);
      if (nflWeek && event.sport === 'NFL' && eventDay >= nflWeek.start && eventDay <= nflWeek.end) nfl += 1;
    }
    return { bySport, nfl };
  }, [events, day, nflWeek]);

  const openGame = games.find((game) => game.key === gameKey) || null;
  const fetchKey = games.length > 0 && (view === 'likely' || games.length <= 16)
    ? games.map((game) => game.key).join('|')
    : '';
  const logJob = useMemo(() => {
    if (view !== 'likely') return [];
    const seen = new Set();
    const players = [];
    for (const game of games) {
      if (!game.rows) continue;
      for (const row of game.rows) {
        if (row.section !== 'player') continue;
        const id = `${game.league}|${row.player}|${row.gameStart}`;
        if (seen.has(id)) continue;
        seen.add(id);
        players.push({
          id,
          league: game.league,
          name: row.player,
          opponentAbbr: row.opponentAbbr,
          opponentName: row.opponentName,
          before: row.gameStart,
        });
      }
    }
    return players;
  }, [view, games]);
  const logJobKey = logJob.map((player) => player.id).join(';');
  const likelyPicks = useMemo(() => (view === 'likely' ? likelyBoard(games, boardLogs, calibration) : []), [view, games, boardLogs, calibration]);
  const gamesLoaded = games.filter((game) => game.rows).length;

  useEffect(() => {
    const slugs = fetchKey ? fetchKey.split('|') : [];
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
  }, [fetchKey]);

  useEffect(() => {
    if (!logJobKey) return undefined;
    let cancel = false;
    const players = logJob;
    let cursor = 0;
    let done = 0;
    setLogDone(0);
    async function worker() {
      while (cursor < players.length) {
        const player = players[cursor++];
        try {
          const result = await recentPlayerLogs(player.league, [player]);
          if (!cancel) {
            setBoardLogs((prev) => (player.id in prev ? prev : { ...prev, [player.id]: result[player.name] ?? null }));
          }
        } catch {
          if (!cancel) setBoardLogs((prev) => (player.id in prev ? prev : { ...prev, [player.id]: null }));
        }
        done += 1;
        if (!cancel) setLogDone(done);
      }
    }
    Promise.all(Array.from({ length: Math.min(4, players.length) }, worker));
    return () => { cancel = true; };
  }, [logJobKey, logJob]);

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
          Open a game for the lines and player props. The NFL tab is the full week. This is a read of the market, not a pick.
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
          <div className="props-view-nav">
            <button type="button" className={`props-view-btn ${view === 'games' ? 'props-view-on' : ''}`} onClick={() => setView('games')}>Games</button>
            <button type="button" className={`props-view-btn ${view === 'likely' ? 'props-view-on' : ''}`} onClick={() => setView('likely')}>Likely</button>
            <button type="button" className={`props-view-btn ${view === 'results' ? 'props-view-on' : ''}`} onClick={() => setView('results')}>Results</button>
          </div>

          {view === 'results' ? <PropLedger /> : (
          <>
          <div className="props-day-nav">
            <button type="button" className="props-day-btn" onClick={() => { setDay((d) => shiftDay(d, sport === 'NFL' && nflWeek ? -7 : -1)); setGameKey(null); }} aria-label={sport === 'NFL' && nflWeek ? 'Previous week' : 'Previous day'}>‹</button>
            <span className="props-day-label">{sport === 'NFL' && nflWeek ? nflWeek.label : formatDayLabel(day)}</span>
            <button type="button" className="props-day-btn" onClick={() => { setDay((d) => shiftDay(d, sport === 'NFL' && nflWeek ? 7 : 1)); setGameKey(null); }} aria-label={sport === 'NFL' && nflWeek ? 'Next week' : 'Next day'}>›</button>
          </div>

          <div className="scores-sport-tabs">
            {TABS.map((name) => {
              const count = name === 'All'
                ? [...counts.bySport.values()].reduce((sum, n) => sum + n, 0)
                : name === 'NFL' && nflWeek
                  ? counts.nfl
                  : (counts.bySport.get(name) || 0);
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
              <p>{sport === 'NFL' && nflWeek
                ? `No NFL games in ${nflWeek.label}.`
                : `No ${sport === 'All' ? '' : `${sport} `}games ${formatDayLabel(day) === 'Today' ? 'today' : `on ${formatDayLabel(day)}`}.`}
              </p>
            </div>
          )}

          {games.length > 0 && view === 'likely' && (
            <>
              <p className="props-likely-note">
                Sorted by the gap between our read and the contract price. NHL and NFL keep the line closest to 50/50 when recent usage agrees with it. Token lines and gaps the recent games do not support stay off the list. If the recent opportunity came while a teammate was out and that teammate is playing, the prop stays off the list. Other props stay when they hit in 70% or more of the last 10.
                {gamesLoaded < games.length ? ` Loading games ${gamesLoaded}/${games.length}.` : ''}
                {logJob.length > 0 && logDone < logJob.length ? ` Checking players ${Math.min(logDone, logJob.length)}/${logJob.length}.` : ''}
              </p>
              {likelyPicks.length === 0 && gamesLoaded === games.length && logDone >= logJob.length && (
                <div className="empty-state"><p>No props cleared the list for this slate.</p></div>
              )}
              <div className="props-list">
                {likelyPicks.map((item) => (
                  <button key={item.id} type="button" className="props-game" onClick={() => setGameKey(item.gameKey)}>
                    <div className="props-game-main">
                      <div className="props-game-title">{item.player} <span className="props-likely-line">{item.prop}</span></div>
                      <div className="props-game-meta">
                        {sport === 'All' ? `${item.sport} · ` : ''}{item.game} · {item.hits}/{item.total}
                        {item.modeled ? ` · model ${item.modelPct}%` : ` · L10 ${item.rate}%`}
                        {item.market == null ? '' : ` · market ${item.market}%`}
                      </div>
                      {item.tags.length > 0 && (
                        <div className="props-game-meta props-likely-tags">{item.tags.join(' · ')}</div>
                      )}
                    </div>
                    <div className={`props-game-best ${item.edge < 0 ? 'props-edge-down' : ''}`} aria-label={`${item.edgePts} point edge`}>
                      <span>{item.edgePts > 0 ? `+${item.edgePts}` : `${item.edgePts}`}</span>
                      <span>edge</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {view === 'games' && (
          <div className="props-list">
            {games.map((game) => {
              const totalLabel = mainTotalLabel(game.rows);
              const when = sport === 'NFL' ? formatGameTime(game.gameStart) : cardClock(game.gameStart);
              return (
                <button key={game.key} type="button" className="props-game" onClick={() => setGameKey(game.key)}>
                  <div className="props-game-main">
                    <div className="props-game-title">{game.title}</div>
                    <div className="props-game-meta">
                      {sport === 'All' ? `${game.sport} · ` : ''}{when}
                    </div>
                  </div>
                  {totalLabel && <div className="props-game-ou">{totalLabel}</div>}
                </button>
              );
            })}
          </div>
          )}
          </>
          )}
        </>
      )}

      {openGame && (
        <>
          <button type="button" className="props-back" onClick={() => setGameKey(null)}>{view === 'likely' ? '‹ Likely' : '‹ Games'}</button>
          <div className="props-sport-head">
            <h2>{openGame.title}</h2>
            <span>{formatGameTime(openGame.gameStart)}</span>
          </div>
          <GameDetail
            key={openGame.key}
            game={openGame}
            rows={openGame.rows}
            loading={loadingSlug === openGame.key || !openGame.rows}
            calibration={calibration?.[openGame.league]}
          />
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScoreboard } from '../api/espn';

/* ── CSV helpers (same as StatcastPage) ─────────────────────────────── */
function parseCSV(text) {
  const raw = text.replace(/^\uFEFF/, '');
  const lines = raw.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const vals = splitLine(l);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
  return { headers, rows };
}
function splitLine(line) {
  const result = []; let cur = ''; let q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}
async function bsFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('HTML response');
  return text;
}

const BS = 'https://baseballsavant.mlb.com';
const STATSAPI = 'https://statsapi.mlb.com/api/v1';

// Static MLB team ID → Baseball Savant abbreviation (API doesn't return abbr in schedule)
const MLB_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};
// Short city/team label for display
const MLB_SHORT = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

/* ── Name normalisation for Savant matching ──────────────────────────── */
function normKey(name) { return name.toLowerCase().replace(/[^a-z]/g, ''); }
function savantToDisplay(savantName) {
  const [last, ...rest] = savantName.split(',');
  return `${rest.join('').trim()} ${last.trim()}`;
}

/* ── MLB Stats API helpers ─────────────────────────────────────────── */
async function mlbFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Today's MLB schedule with lineups + probable pitchers
async function getMlbSchedule() {
  const today = new Date().toISOString().slice(0, 10);
  const data = await mlbFetch(
    `${STATSAPI}/schedule?sportId=1&date=${today}&hydrate=probablePitcher,lineups,teams,game(content(summary))`
  );
  return data.dates?.[0]?.games || [];
}

// Get projected lineup from the most recent game's actual boxscore batting order.
// Uses the boxscore endpoint (explicit home/away separation by team.id).
// Includes a `signal` for AbortController so stale requests can be cancelled.
async function getProjectedLineup(teamId, signal) {
  const teamNum = Number(teamId);
  const end   = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(); start.setDate(start.getDate() - 21);
  const fmt   = (d) => d.toISOString().slice(0, 10);

  const schedule = await fetch(
    `${STATSAPI}/schedule?sportId=1&teamId=${teamId}&startDate=${fmt(start)}&endDate=${fmt(end)}&gameType=R`,
    { signal }
  ).then((r) => r.json());

  // Walk dates newest-first
  for (const dateObj of [...(schedule.dates || [])].reverse()) {
    for (const game of [...(dateObj.games || [])].reverse()) {
      if (game.status?.abstractGameState !== 'Final') continue;

      // Verify this game actually involves our team (schedule API should guarantee it,
      // but be explicit to catch any API anomalies)
      const homeId = Number(game.teams?.home?.team?.id);
      const awayId = Number(game.teams?.away?.team?.id);
      if (homeId !== teamNum && awayId !== teamNum) continue;

      try {
        const bs = await fetch(`${STATSAPI}/game/${game.gamePk}/boxscore`, { signal })
          .then((r) => r.json());

        // Pick the team's side by directly matching team.id
        const homeTeam = bs.teams?.home;
        const awayTeam = bs.teams?.away;
        const teamBs = Number(homeTeam?.team?.id) === teamNum ? homeTeam : awayTeam;
        if (!teamBs || Number(teamBs.team?.id) !== teamNum) continue;

        const battingOrder = teamBs.battingOrder || [];
        const playerMap    = teamBs.players || {};
        if (battingOrder.length === 0) continue;

        const players = battingOrder.map((id) => {
          const entry = playerMap[`ID${id}`];
          return entry ? {
            id:              entry.person?.id,
            fullName:        entry.person?.fullName || '',
            useName:         entry.person?.useName  || '',
            primaryPosition: entry.position || {},
            batSide:         entry.person?.batSide || {},
          } : null;
        }).filter(Boolean);

        if (players.length > 0) {
          return { players, confirmed: false, fromDate: dateObj.date };
        }
      } catch (e) {
        if (e.name === 'AbortError') throw e; // propagate cancellation
        continue;
      }
    }
  }
  return { players: [], confirmed: false, fromDate: null };
}

/* ── MLB ID resolution (fallback for pitcher only) ─────────────────── */
async function resolveMlbId(fullName) {
  try {
    const res = await fetch(`${STATSAPI}/people/search?names=${encodeURIComponent(fullName)}&sportIds=1`);
    const data = await res.json();
    const people = data.people || [];
    const match = people.find((p) => p.fullName?.toLowerCase() === fullName.toLowerCase()) || people[0];
    return match?.id ? String(match.id) : null;
  } catch { return null; }
}

/* ── Baseball Savant data fetching ──────────────────────────────────── */
async function fetchBattedBallLeaderboard() {
  const year = new Date().getFullYear();
  const text = await bsFetch(
    `${BS}/leaderboard/batted-ball?type=batter&year=${year}&min=1&csv=true`
  );
  const { rows } = parseCSV(text);
  const map = {};
  rows.forEach((r) => { if (r.id) map[String(r.id).trim()] = r; });
  return map; // keyed by player_id
}

// Batter stats vs a specific pitch type (for the vs Pitch Type tab)
async function fetchTeamBattersByPitchType(teamAbbr, pitcherThrows, pitchType) {
  const year = new Date().getFullYear();
  const throwsParam = pitcherThrows ? `&pitcher_throws=${pitcherThrows}` : '';
  const pitchParam  = pitchType ? `&hfPT=${pitchType}%7C` : '';
  const url = `${BS}/statcast_search/csv?player_type=batter&hfGT=R%7C&hfTeam=${encodeURIComponent(teamAbbr + '|')}&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0${throwsParam}${pitchParam}`;
  const text = await bsFetch(url);
  const { rows } = parseCSV(text);
  const byId = {};
  rows.forEach((r) => {
    if (r.player_id) byId[String(r.player_id).trim()] = r;
  });
  return byId;
}

async function fetchTeamBatters(teamAbbr, pitcherThrows) {
  const year = new Date().getFullYear();
  const throwsParam = pitcherThrows ? `&pitcher_throws=${pitcherThrows}` : '';
  const statsUrl = `${BS}/statcast_search/csv?player_type=batter&hfGT=R%7C&hfTeam=${encodeURIComponent(teamAbbr + '|')}&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0${throwsParam}`;

  // Fetch statcast stats + batted ball profile in parallel
  const [statsRes, bbRes] = await Promise.allSettled([
    bsFetch(statsUrl),
    fetchBattedBallLeaderboard(),
  ]);

  const rows = statsRes.status === 'fulfilled' ? parseCSV(statsRes.value).rows : [];
  const bbMap = bbRes.status === 'fulfilled' ? bbRes.value : {};

  // Merge batted-ball rates into each row (multiply by 100 → percentage)
  const pct = (v) => v != null && v !== '' ? (parseFloat(v) * 100).toFixed(1) : null;
  const merged = rows.map((r) => {
    const bb = bbMap[String(r.player_id).trim()] || {};
    return {
      ...r,
      gb_pct: pct(bb.gb_rate),
      fb_pct: pct(bb.fb_rate),
      ld_pct: pct(bb.ld_rate),
    };
  });

  const byId = {};
  const byName = {};
  merged.forEach((r) => {
    if (r.player_id) byId[String(r.player_id).trim()] = r;
    const display = savantToDisplay(r.player_name || '');
    byName[normKey(display)] = r;
    const last = (r.player_name || '').split(',')[0].trim().toLowerCase().replace(/[^a-z]/g, '');
    if (last && !byName[last]) byName[last] = r;
  });
  return { byId, byName };
}

async function fetchPitcherHand(mlbId) {
  const data = await mlbFetch(`${STATSAPI}/people/${mlbId}`);
  return data.people?.[0]?.pitchHand?.code || null;
}

async function fetchBvpStats(batterId, pitcherId) {
  // vsPlayerTotal = career totals; vsPlayer = per-season rows (we want career)
  const data = await mlbFetch(
    `${STATSAPI}/people/${batterId}/stats?stats=vsPlayerTotal&opposingPlayerId=${pitcherId}&group=hitting&sportId=1`
  );
  const splits = data.stats?.find((s) => s.type?.displayName === 'vsPlayerTotal')?.splits || [];
  return splits[0]?.stat || null;
}

// All pitch type codes Baseball Savant uses
const PITCH_CODES = ['FF','SI','SL','CH','CU','ST','FC','FS','SV','KC','KN'];
const PITCH_NAMES = {
  FF: '4-Seam Fastball', SI: 'Sinker', SL: 'Slider', CH: 'Changeup',
  CU: 'Curveball', ST: 'Sweeper', FC: 'Cutter', FS: 'Split-Finger',
  SV: 'Slurve', KC: 'Knuckle-Curve', KN: 'Knuckleball',
};

async function fetchPitchArsenal(mlbId, stand) {
  // Use statcast_search with hfPT= (pitch type filter) — correctly gives
  // velocity, woba, whiff%, hard_hit% per pitch type AND supports vs L/R via hfStands
  const year = new Date().getFullYear();
  const standFilter = stand ? `&batter_stands=${stand}` : '';
  const base = `${BS}/statcast_search/csv?player_type=pitcher&hfGT=R%7C&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0`;

  const results = await Promise.allSettled(
    PITCH_CODES.map((pt) =>
      bsFetch(`${base}&hfPT=${pt}%7C${standFilter}`)
        .then((text) => {
          const { rows } = parseCSV(text);
          const row = rows.find((r) => String(r.player_id).trim() === String(mlbId).trim());
          if (!row) return null;
          return {
            pitch_type: pt,
            pitches_count: parseInt(row.pitches) || 0, // raw count for correct usage%
            velocity:     row.velocity,
            whiff_percent: row.swing_miss_percent,
            woba:         row.woba,
            ba:           row.ba,
            slg:          row.slg,
            hard_hit_percent: row.hardhit_percent,
          };
        })
        .catch(() => null)
    )
  );

  // Collect only pitch types that were actually thrown
  const rawRows = PITCH_CODES
    .map((pt, i) => {
      const v = results[i].status === 'fulfilled' ? results[i].value : null;
      return v && v.pitches_count > 0 ? { ...v, pitch_type: pt } : null;
    })
    .filter(Boolean);

  // pitch_percent from Savant uses season total as denominator — wrong for vs L/R splits.
  // Recalculate: usage% = pitches_of_type / total_pitches_in_this_group
  const totalPitches = rawRows.reduce((s, r) => s + r.pitches_count, 0);

  return rawRows
    .map((r) => ({
      pitch_type:   r.pitch_type,
      pitch_name:   PITCH_NAMES[r.pitch_type] || r.pitch_type,
      pitch_usage:  totalPitches > 0 ? (r.pitches_count / totalPitches * 100) : 0,
      velocity:     r.velocity,
      whiff_percent: r.whiff_percent,
      woba:         r.woba,
      iso:          (r.ba && r.slg) ? (parseFloat(r.slg) - parseFloat(r.ba)).toFixed(3) : null,
      hard_hit_percent: r.hard_hit_percent,
    }))
    .filter((r) => r.pitch_usage >= 0.5)
    .sort((a, b) => b.pitch_usage - a.pitch_usage);
}

async function fetchPitcherGameLogs(mlbId) {
  const year = new Date().getFullYear();
  const data = await mlbFetch(
    `${STATSAPI}/people/${mlbId}/stats?stats=gameLog&group=pitching&season=${year}&sportId=1`
  );
  const splits = data.stats?.[0]?.splits || [];
  return splits.map((s) => {
    const st = s.stat || {};
    const ip = (() => {
      const parts = String(st.inningsPitched || '0').split('.');
      return parseInt(parts[0]) + (parseInt(parts[1] || '0') / 3);
    })();
    const k  = parseInt(st.strikeOuts || 0);
    const w  = parseInt(st.wins || 0);
    const er = parseInt(st.earnedRuns || 0);
    const h  = parseInt(st.hits || 0);
    const bb = parseInt(st.baseOnBalls || 0);
    const hbp = parseInt(st.hitBatsmen || 0);
    const fpts = (ip * 2.25 + k * 2 + w * 4 + er * -2 + h * -0.6 + bb * -0.6 + hbp * -0.6).toFixed(1);
    const oppName = s.opponent?.name || '?';
    // Build opponent abbreviation from name
    const oppAbbr = Object.entries(MLB_ABBR || {}).find(([id]) =>
      oppName.toLowerCase().includes('astros') ? id === '117' : false
    )?.[1] || oppName.split(' ').slice(-1)[0].slice(0, 3).toUpperCase();
    return {
      date: s.date,
      opponent: oppName,
      ip: st.inningsPitched,
      pitches: st.numberOfPitches,
      er, k, h, bb, w,
      fpts: parseFloat(fpts),
    };
  }).reverse(); // most recent first
}

async function fetchPitcherSeasonStats(mlbId) {
  const year = new Date().getFullYear();
  const data = await mlbFetch(
    `${STATSAPI}/people/${mlbId}/stats?stats=statsSingleSeason&group=pitching&season=${year}&sportId=1`
  );
  const splits = data.stats?.[0]?.splits || [];
  return splits[0]?.stat || null;
}

async function fetchPitcherSplits(mlbId) {
  const year = new Date().getFullYear();
  // NOTE: pitcherID param is ignored by the endpoint — must fetch full leaderboard
  // and filter by player_id client-side (same pattern as percentile rankings).
  const base = `${BS}/statcast_search/csv?player_type=pitcher&hfGT=R%7C&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0`;
  const [allRes, vsLRes, vsRRes] = await Promise.allSettled([
    bsFetch(base),
    bsFetch(base + '&batter_stands=L'),
    bsFetch(base + '&batter_stands=R'),
  ]);
  const pick = (r) => {
    if (r.status !== 'fulfilled') return null;
    const { rows } = parseCSV(r.value);
    return rows.find((row) => String(row.player_id).trim() === String(mlbId).trim()) || null;
  };
  return { all: pick(allRes), vsL: pick(vsLRes), vsR: pick(vsRRes) };
}

/* ── League averages for heat-map (2025/26 approximations) ─────────── */
const BATTER_AVGS = {
  k_percent:             { avg: 22,    invert: true,  higherBetter: false },
  bb_percent:            { avg: 8.5,   invert: false, higherBetter: true  },
  iso:                   { avg: 0.165, invert: false, higherBetter: true  },
  woba:                  { avg: 0.320, invert: false, higherBetter: true  },
  xwoba:                 { avg: 0.320, invert: false, higherBetter: true  },
  hardhit_percent:       { avg: 38,    invert: false, higherBetter: true  },
  barrels_per_bbe_percent:{ avg: 8,   invert: false, higherBetter: true  },
  swing_miss_percent:    { avg: 25,    invert: true,  higherBetter: false },
};
// Pitcher stat: is it good (for pitcher) when high? red/green is from pitcher perspective
const PITCHER_AVGS = {
  k_percent:             { avg: 22,    higherBetter: true  },
  bb_percent:            { avg: 8.5,   higherBetter: false },
  iso:                   { avg: 0.165, higherBetter: false },
  woba:                  { avg: 0.320, higherBetter: false },
  hardhit_percent:       { avg: 38,    higherBetter: false },
  barrels_per_bbe_percent:{ avg: 8,   higherBetter: false },
  babip:                 { avg: 0.295, higherBetter: false },
  swing_miss_percent:    { avg: 25,    higherBetter: true  },
};

function heatClass(val, key, avgs) {
  const cfg = avgs[key];
  if (!cfg || val == null || val === '') return '';
  const n = parseFloat(val);
  if (isNaN(n)) return '';
  const pct = Math.abs((n - cfg.avg) / cfg.avg);
  if (pct < 0.05) return ''; // within 5% = neutral
  const above = n > cfg.avg;
  const good = cfg.higherBetter ? above : !above;
  if (pct < 0.12) return good ? 'dfs-cell-good-sm' : 'dfs-cell-bad-sm';
  if (pct < 0.25) return good ? 'dfs-cell-good' : 'dfs-cell-bad';
  return good ? 'dfs-cell-good-lg' : 'dfs-cell-bad-lg';
}

function fmt(val, key) {
  if (val == null || val === '') return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  if (['woba','xwoba','iso','babip'].includes(key)) {
    return n < 1 ? n.toFixed(3).replace(/^0\./, '.') : n.toFixed(3);
  }
  if (key.includes('percent') || key === 'k_percent' || key === 'bb_percent') {
    return n.toFixed(1) + '%';
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* ── Logo helper — constructed directly from MLB team ID ─────────────── */
// Bypasses ESPN game matching (which has ordering issues) by using the ESPN
// CDN URL pattern directly from the MLB team ID → abbreviation lookup.
function mlbTeamLogo(teamId) {
  const abbr = (MLB_ABBR[teamId] || 'mlb').toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500-dark/${abbr}.png`;
}
function mlbTeamLogoFallback(teamId) {
  const abbr = (MLB_ABBR[teamId] || 'mlb').toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${abbr}.png`;
}
function TeamLogo({ teamId, className }) {
  const dark = mlbTeamLogo(teamId);
  const orig = mlbTeamLogoFallback(teamId);
  if (!teamId) return null;
  return (
    <img
      src={dark}
      onError={(e) => { if (e.target.src !== orig) { e.target.onerror = null; e.target.src = orig; } }}
      alt=""
      className={className}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Batter Table
   ───────────────────────────────────────────────────────────────────── */
const BATTER_AVGS_BB = {
  gb_pct: { avg: 44, higherBetter: false }, // lower GB% = more air = generally better for DFS
  fb_pct: { avg: 24, higherBetter: true  }, // higher FB% = more power chances
  ld_pct: { avg: 24, higherBetter: true  }, // higher LD% = better contact
  babip:  { avg: 0.295, higherBetter: true  },
};

const BATTER_COLS = [
  { key: 'pa',           label: 'PA',       avgs: BATTER_AVGS },
  { key: 'iso',          label: 'ISO',      avgs: BATTER_AVGS },
  { key: 'woba',         label: 'wOBA',     avgs: BATTER_AVGS },
  { key: 'xwoba',        label: 'xwOBA',    avgs: BATTER_AVGS },
  { key: 'k_percent',    label: 'K%',       avgs: BATTER_AVGS },
  { key: 'bb_percent',   label: 'BB%',      avgs: BATTER_AVGS },
  { key: 'hardhit_percent', label: 'HH%',   avgs: BATTER_AVGS },
  { key: 'barrels_per_bbe_percent', label: 'Brl%', avgs: BATTER_AVGS },
  { key: 'gb_pct',       label: 'GB%',      avgs: BATTER_AVGS_BB },
  { key: 'fb_pct',       label: 'FB%',      avgs: BATTER_AVGS_BB },
  { key: 'ld_pct',       label: 'LD%',      avgs: BATTER_AVGS_BB },
  { key: 'babip',        label: 'BABIP',    avgs: BATTER_AVGS_BB },
];

/* ── vs Pitch Type Tab ───────────────────────────────────────────────── */
const PT_COLS = [
  { key: 'pa',                     label: 'PA',     fmt: 'int' },
  { key: 'iso',                    label: 'ISO',    fmt: 'avg', hl: true },
  { key: 'woba',                   label: 'wOBA',   fmt: 'avg', hl: true },
  { key: 'xwoba',                  label: 'xwOBA',  fmt: 'avg', hl: true },
  { key: 'k_percent',              label: 'K%',     fmt: 'pct1', avgs: BATTER_AVGS },
  { key: 'bb_percent',             label: 'BB%',    fmt: 'pct1', avgs: BATTER_AVGS },
  { key: 'hardhit_percent',        label: 'HH%',    fmt: 'pct1', avgs: BATTER_AVGS },
  { key: 'barrels_per_bbe_percent',label: 'Brl%',   fmt: 'pct1', avgs: BATTER_AVGS },
  { key: 'gb_pct',                 label: 'GB%',    fmt: 'pct1' },
  { key: 'fb_pct',                 label: 'FB%',    fmt: 'pct1' },
  { key: 'ld_pct',                 label: 'LD%',    fmt: 'pct1' },
];

function fmtPtVal(val, fmt) {
  if (val == null || val === '' || val === undefined) return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  if (fmt === 'avg') return n < 1 ? n.toFixed(3).replace(/^0\./, '.') : n.toFixed(3);
  if (fmt === 'pct1') return n.toFixed(1) + '%';
  if (fmt === 'int') return String(Math.round(n));
  return String(n);
}

function VsPitchTypeTab({ lineup, battingAbbr, pitcherId, defaultHand }) {
  const [pitchArsenal, setPitchArsenal] = useState([]);
  const [selectedPitch, setSelectedPitch] = useState('');
  const [hand, setHand]                   = useState(defaultHand || '');
  const [statsById, setStatsById]         = useState({});
  const [bbById, setBbById]               = useState({});
  const [loading, setLoading]             = useState(false);
  const lastFetchKey = useRef('');

  // Load pitcher arsenal for dropdown
  useEffect(() => {
    if (!pitcherId) return;
    fetchPitchArsenal(pitcherId, null).then((rows) => {
      setPitchArsenal(rows);
      if (rows.length > 0 && !selectedPitch) setSelectedPitch(rows[0].pitch_type);
    }).catch(() => {});
  }, [pitcherId]);

  // Auto-update hand when pitcher changes
  useEffect(() => {
    if (defaultHand) setHand(defaultHand);
  }, [defaultHand]);

  // Fetch batter stats when pitch type, hand, team or lineup changes
  useEffect(() => {
    if (!battingAbbr || !selectedPitch || !lineup?.length) return;
    const key = `${battingAbbr}|${selectedPitch}|${hand}`;
    if (key === lastFetchKey.current) return;
    lastFetchKey.current = key;
    setLoading(true);
    Promise.allSettled([
      fetchTeamBattersByPitchType(battingAbbr, hand || null, selectedPitch),
      fetchBattedBallLeaderboard(),
    ]).then(([statsRes, bbRes]) => {
      if (statsRes.status === 'fulfilled') setStatsById(statsRes.value);
      if (bbRes.status === 'fulfilled') setBbById(bbRes.value);
      setLoading(false);
    });
  }, [battingAbbr, selectedPitch, hand, lineup]);

  const pitchLabel = (pt) => PITCH_NAMES[pt] || pt;
  const lookupRow = (player) => {
    const id = String(player.id).trim();
    const r = statsById[id] || {};
    const bb = bbById[id] || {};
    return {
      ...r,
      gb_pct: bb.gb_rate != null ? (parseFloat(bb.gb_rate) * 100).toFixed(1) : null,
      fb_pct: bb.fb_rate != null ? (parseFloat(bb.fb_rate) * 100).toFixed(1) : null,
      ld_pct: bb.ld_rate != null ? (parseFloat(bb.ld_rate) * 100).toFixed(1) : null,
    };
  };

  return (
    <div>
      {/* Dropdowns */}
      <div className="dfs-vsp-controls">
        <select className="dfs-arsenal-select" value={selectedPitch}
          onChange={(e) => { setSelectedPitch(e.target.value); lastFetchKey.current = ''; }}>
          {pitchArsenal.length === 0
            ? <option value="">Loading pitches…</option>
            : pitchArsenal.map((p) => (
              <option key={p.pitch_type} value={p.pitch_type}>
                {pitchLabel(p.pitch_type)} ({p.pitch_usage.toFixed(0)}%)
              </option>
            ))}
        </select>
        <select className="dfs-arsenal-select" value={hand}
          onChange={(e) => { setHand(e.target.value); lastFetchKey.current = ''; }}>
          <option value="">vs All Pitchers</option>
          <option value="L">vs LHP</option>
          <option value="R">vs RHP</option>
        </select>
      </div>

      {loading ? (
        <div className="dfs-loading"><div className="auth-spinner"/><span>Loading…</span></div>
      ) : (
        <div className="dfs-table-wrap">
          <table className="dfs-table">
            <thead>
              <tr>
                <th className="dfs-th dfs-th-num dfs-sticky-num">#</th>
                <th className="dfs-th dfs-th-player dfs-sticky-player">Player</th>
                {PT_COLS.map((c) => <th key={c.key} className="dfs-th">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {lineup.map((player, i) => {
                const row = lookupRow(player);
                const hasData = row.pa && parseInt(row.pa) > 0;
                const pos = player.primaryPosition?.abbreviation || '';
                return (
                  <tr key={player.id} className="dfs-player-row">
                    <td className="dfs-td dfs-td-num dfs-sticky-num">{i + 1}</td>
                    <td className="dfs-td dfs-td-player dfs-sticky-player">
                      <span className="dfs-player-name">{player.fullName}</span>
                      {pos && <span className="dfs-player-meta"> {pos}</span>}
                    </td>
                    {PT_COLS.map((c) => (
                      <td key={c.key}
                        className={`dfs-td ${hasData && c.avgs ? heatClass(row[c.key], c.key, c.avgs) : ''}`}>
                        {hasData ? fmtPtVal(row[c.key], c.fmt) : '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BatterTable({ lineup, savantMap }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  if (!lineup || lineup.length === 0) return (
    <div className="dfs-empty">No lineup data available yet.</div>
  );
  const { byId, byName } = savantMap;

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // MLB Stats API lineup player: { id, fullName, primaryPosition, ... }
  const lookupStats = (player) => {
    if (!player) return null;
    // Try MLB person ID first (most reliable), then name fallback
    const byIdMatch = byId?.[String(player.id)];
    if (byIdMatch) return byIdMatch;
    const name = player.fullName || player.useName || '';
    return byName?.[normKey(name)] || byName?.[normKey(name.split(' ').slice(-1)[0])] || null;
  };

  const allRows = lineup.map(lookupStats).filter(Boolean);

  function agg(rows) {
    if (!rows.length) return {};
    const result = {};
    BATTER_COLS.slice(1).forEach(({ key }) => {
      const vals = rows.map((r) => parseFloat(r[key])).filter((n) => !isNaN(n));
      if (vals.length) result[key] = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3);
    });
    result.pa = rows.reduce((s, r) => s + (parseInt(r.pa) || 0), 0);
    return result;
  }

  // MLB Stats API lineup: players have { id, fullName, primaryPosition, batSide, ... }
  const lefties  = lineup.filter((p) => p.batSide?.code === 'L');
  const righties = lineup.filter((p) => p.batSide?.code === 'R' || p.batSide?.code === 'S');

  const aggAll = agg(allRows);
  const aggL   = agg(lefties.map(lookupStats).filter(Boolean));
  const aggR   = agg(righties.map(lookupStats).filter(Boolean));

  // Apply sort to lineup order
  const sortedLineup = sortKey
    ? [...lineup].sort((a, b) => {
        const sa = lookupStats(a) || {};
        const sb = lookupStats(b) || {};
        const va = parseFloat(sa[sortKey]) || 0;
        const vb = parseFloat(sb[sortKey]) || 0;
        return sortDir === 'desc' ? vb - va : va - vb;
      })
    : lineup;

  const AggRow = ({ label, row }) => (
    <tr className="dfs-agg-row">
      <td className="dfs-td dfs-td-num" />
      <td className="dfs-td dfs-td-player">{label}</td>
      {BATTER_COLS.map(({ key, avgs }) => (
        <td key={key} className={`dfs-td dfs-td-stat ${heatClass(row[key], key, avgs)}`}>
          {fmt(row[key], key)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="dfs-table-wrap">
      <table className="dfs-table">
          <thead>
            <tr>
              <th className="dfs-th dfs-th-num dfs-sticky-num">#</th>
              <th className="dfs-th dfs-th-player dfs-sticky-player">Player</th>
              {BATTER_COLS.map((c) => (
                <th key={c.key} className="dfs-th dfs-th-sortable" onClick={() => handleSort(c.key)}>
                  {c.label}{sortKey === c.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedLineup.map((player, i) => {
            // MLB Stats API player object from lineups
            const name = player.fullName || player.useName || '';
            const pos  = player.primaryPosition?.abbreviation || '';
            const hand = player.batSide?.code || '';
            const slot = i + 1;
            const stats = lookupStats(player) || {};
            const hasStats = Object.keys(stats).length > 0;
            return (
              <tr key={i} className="dfs-player-row">
                  <td className="dfs-td dfs-td-num dfs-sticky-num">{sortKey ? i + 1 : slot}</td>
                  <td className="dfs-td dfs-td-player dfs-sticky-player">
                  <span className="dfs-player-name">{name}</span>
                  {pos && <span className="dfs-player-meta"> {pos}</span>}
                  {hand && <span className="dfs-player-hand"> | {hand}</span>}
                </td>
                {BATTER_COLS.map(({ key, avgs }) => (
                  <td key={key} className={`dfs-td dfs-td-stat ${hasStats ? heatClass(stats[key], key, avgs) : ''}`}>
                    {hasStats ? fmt(stats[key], key) : '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <AggRow label="All" row={aggAll} />
          {lefties.length > 0 && <AggRow label={`Lefties (${lefties.length})`} row={aggL} />}
          {righties.length > 0 && <AggRow label={`Righties (${righties.length})`} row={aggR} />}
        </tfoot>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Pitcher Splits Table
   ───────────────────────────────────────────────────────────────────── */
const PITCHER_STATS = [
  { key: 'pa',           label: 'PA',         avgs: {} },
  { key: 'k_percent',    label: 'K%',         avgs: PITCHER_AVGS },
  { key: 'bb_percent',   label: 'BB%',        avgs: PITCHER_AVGS },
  { key: 'iso',          label: 'ISO',        avgs: PITCHER_AVGS },
  { key: 'woba',         label: 'wOBA',       avgs: PITCHER_AVGS },
  { key: 'xwoba',        label: 'xwOBA',      avgs: PITCHER_AVGS },
  { key: 'swing_miss_percent', label: 'Whiff%', avgs: PITCHER_AVGS },
  { key: 'hardhit_percent', label: 'HardHit%', avgs: PITCHER_AVGS },
  { key: 'barrels_per_bbe_percent', label: 'Barrel%', avgs: PITCHER_AVGS },
  { key: 'babip',        label: 'BABIP',      avgs: PITCHER_AVGS },
  { key: 'launch_angle', label: 'Avg LA',     avgs: {} },
];

/* ── Pitch Usage Table ───────────────────────────────────────────── */
function PitchUsageTable({ pitcherId }) {
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [stand, setStand] = useState('');   // '' = All, 'L' = vs Left, 'R' = vs Right
  const lastKey = useRef('');

  useEffect(() => {
    const key = `${pitcherId}|${stand}`;
    if (!pitcherId || key === lastKey.current) return;
    lastKey.current = key;
    setLoading(true);
    fetchPitchArsenal(pitcherId, stand || null)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pitcherId, stand]);

  return (
    <div>
      {/* Stand filter dropdown */}
      <div className="dfs-arsenal-header">
        <select
          className="dfs-arsenal-select"
          value={stand}
          onChange={(e) => setStand(e.target.value)}
        >
          <option value="">vs All Batters</option>
          <option value="L">vs Left Batters</option>
          <option value="R">vs Right Batters</option>
        </select>
      </div>

      {loading ? (
        <div className="dfs-loading"><div className="auth-spinner"/><span>Loading pitch arsenal…</span></div>
      ) : (
        <div className="dfs-table-wrap">
          <table className="dfs-table">
            <thead>
              <tr>
                <th className="dfs-th dfs-th-pitch">Pitch</th>
                <th className="dfs-th">Usage%</th>
                <th className="dfs-th">Velo</th>
                <th className="dfs-th">Whiff%</th>
                <th className="dfs-th">wOBA</th>
                <th className="dfs-th">ISO</th>
                <th className="dfs-th">Hard%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.pitch_type} className="dfs-player-row">
                  <td className="dfs-td dfs-td-pitch">{r.pitch_name}</td>
                  <td className="dfs-td">{r.pitch_usage.toFixed(1)}%</td>
                  <td className="dfs-td">{r.velocity ? r.velocity + ' mph' : '—'}</td>
                  <td className="dfs-td">{r.whiff_percent ? parseFloat(r.whiff_percent).toFixed(1) + '%' : '—'}</td>
                  <td className="dfs-td">{r.woba || '—'}</td>
                  <td className="dfs-td">{r.iso || '—'}</td>
                  <td className="dfs-td">{r.hard_hit_percent ? parseFloat(r.hard_hit_percent).toFixed(1) + '%' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Game Log Table ──────────────────────────────────────────────── */
function PitcherGameLog({ pitcherId }) {
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(null);

  useEffect(() => {
    if (!pitcherId || fetched.current === pitcherId) return;
    fetched.current = pitcherId;
    setLoading(true);
    fetchPitcherGameLogs(pitcherId)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pitcherId]);

  if (loading) return <div className="dfs-loading"><div className="auth-spinner"/><span>Loading game logs…</span></div>;

  const fmtDate = (d) => {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${parseInt(m)}/${parseInt(day)}/${y}`;
  };

  return (
    <div className="dfs-table-wrap">
      <table className="dfs-table">
        <thead>
          <tr>
            <th className="dfs-th" style={{ textAlign: 'left', paddingLeft: 14, minWidth: 90 }}>Date</th>
            <th className="dfs-th" style={{ textAlign: 'left', minWidth: 110 }}>Opponent</th>
            <th className="dfs-th">Pitches</th>
            <th className="dfs-th">IP</th>
            <th className="dfs-th">ER</th>
            <th className="dfs-th">K</th>
            <th className="dfs-th">H</th>
            <th className="dfs-th">BB</th>
            <th className="dfs-th" style={{ color: 'var(--accent2)' }}>FPts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="dfs-player-row">
              <td className="dfs-td" style={{ textAlign: 'left', paddingLeft: 14, color: 'var(--text)' }}>{fmtDate(r.date)}</td>
              <td className="dfs-td" style={{ textAlign: 'left', fontSize: 11, color: 'var(--text2)' }}>
                {r.opponent?.length > 16 ? r.opponent.slice(0, 16) + '…' : r.opponent}
              </td>
              <td className="dfs-td">{r.pitches ?? '—'}</td>
              <td className="dfs-td">{r.ip}</td>
              <td className="dfs-td">{r.er}</td>
              <td className="dfs-td">{r.k}</td>
              <td className="dfs-td">{r.h}</td>
              <td className="dfs-td">{r.bb}</td>
              <td className="dfs-td" style={{ fontWeight: 800, color: r.fpts >= 15 ? '#4ade80' : r.fpts < 5 ? '#f87171' : 'var(--text)' }}>
                {r.fpts}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PitcherSplitsTable({ splits }) {
  if (!splits) return <div className="dfs-empty">Loading pitcher stats…</div>;
  const { all, vsL, vsR } = splits;
  if (!all && !vsL && !vsR) return <div className="dfs-empty">No pitcher stats found for this season.</div>;

  return (
    <div className="dfs-table-wrap">
      <table className="dfs-table">
        <thead>
          <tr>
            <th className="dfs-th dfs-th-player">Stat</th>
            <th className="dfs-th">Vs All</th>
            <th className="dfs-th">Vs L</th>
            <th className="dfs-th">Vs R</th>
          </tr>
        </thead>
        <tbody>
          {PITCHER_STATS.map(({ key, label, avgs }) => (
            <tr key={key} className="dfs-stat-row">
              <td className="dfs-td dfs-td-player dfs-stat-label">{label}</td>
              {[all, vsL, vsR].map((split, i) => (
                <td key={i} className={`dfs-td dfs-td-stat ${split ? heatClass(split[key], key, avgs) : ''}`}>
                  {split ? fmt(split[key], key) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Main DFS Page
   ───────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────
   BvP History Tab
   ───────────────────────────────────────────────────────────────────── */
const BVP_COLS = [
  { key: 'atBats',      label: 'AB' },
  { key: 'hits',        label: 'H' },
  { key: 'doubles',     label: '2B' },
  { key: 'triples',     label: '3B' },
  { key: 'homeRuns',    label: 'HR' },
  { key: 'rbi',         label: 'RBI' },
  { key: 'strikeOuts',  label: 'K' },
  { key: 'baseOnBalls', label: 'BB' },
  { key: 'avg',         label: 'AVG', rate: true },
  { key: 'obp',         label: 'OBP', rate: true },
  { key: 'slg',         label: 'SLG', rate: true },
  { key: 'ops',         label: 'OPS', rate: true },
];

function BvPTab({ lineup, pitcherId, pitcherName, battingTeamId }) {
  // ALL hooks must be at the top — before any conditional returns
  const [roster, setRoster]   = useState([]);   // all position players on the team
  const [rows, setRows]       = useState([]);   // BvP stat rows for each player
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  // Fetch full active roster when team changes
  useEffect(() => {
    if (!battingTeamId) return;
    const year = new Date().getFullYear();
    setRoster([]);
    mlbFetch(`${STATSAPI}/teams/${battingTeamId}/roster?rosterType=active&season=${year}`)
      .then((data) => {
        const pos = (data.roster || [])
          .filter((p) => p.position?.type !== 'Pitcher')
          .map((p) => ({
            id: p.person?.id,
            fullName: p.person?.fullName || '',
            primaryPosition: p.position || {},
          }));
        setRoster(pos);
      })
      .catch(() => {});
  }, [battingTeamId]);

  // Fetch BvP stats for every roster player when pitcher or roster changes
  useEffect(() => {
    setRows([]);
    if (!pitcherId) { setLoading(false); return; }
    if (!roster.length) { setLoading(true); return; }

    setLoading(true);
    Promise.allSettled(
      roster.map((player) =>
        fetchBvpStats(player.id, pitcherId)
          .then((stat) => ({ player, stat }))
          .catch(() => ({ player, stat: null }))
      )
    ).then((results) => {
      setRows(results.map((r) => r.value).filter(Boolean));
      setLoading(false);
    });
  }, [roster, pitcherId]);

  // Build a map of player id → batting order position (1-9)
  const lineupMap = new Map((lineup || []).map((p, i) => [String(p.id), i + 1]));

  if (!pitcherId && !loading) return (
    <div className="dfs-empty" style={{ padding: '20px 16px' }}>No starting pitcher announced — BvP history unavailable.</div>
  );

  if (!lineup?.length && !loading) return (
    <div className="dfs-empty" style={{ padding: '20px 16px' }}>Waiting for lineup data…</div>
  );

  if (loading) return (
    <div className="dfs-loading" style={{ padding: '24px 14px' }}>
      <div className="auth-spinner" />
      <span>Loading career BvP history…</span>
    </div>
  );

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // Default: lineup players (by batting slot 1-9) first, then bench alphabetically
  const defaultSorted = [...rows].sort((a, b) => {
    const ao = lineupMap.get(String(a.player.id));
    const bo = lineupMap.get(String(b.player.id));
    if (ao && bo) return ao - bo;
    if (ao) return -1;
    if (bo) return 1;
    return (a.player.fullName || '').localeCompare(b.player.fullName || '');
  });
  const sortedRows = sortKey
    ? [...defaultSorted].sort((a, b) => {
        const va = parseFloat(a.stat?.[sortKey]) || 0;
        const vb = parseFloat(b.stat?.[sortKey]) || 0;
        return sortDir === 'desc' ? vb - va : va - vb;
      })
    : defaultSorted;

  return (
    <div className="bvp-wrap">
      <div className="bvp-subtitle">
        Career stats vs <strong>{pitcherName || 'pitcher'}</strong>
      </div>
      <div className="dfs-table-wrap">
        <table className="dfs-table bvp-table">
          <thead>
            <tr>
              <th className="dfs-th dfs-th-num dfs-sticky-num">#</th>
              <th className="dfs-th dfs-th-player dfs-sticky-player">Player</th>
              {BVP_COLS.map((c) => (
                <th key={c.key} className={`dfs-th dfs-th-sortable ${c.rate ? 'bvp-th-rate' : ''}`}
                  onClick={() => handleSort(c.key)}>
                  {c.label}{sortKey === c.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(({ player, stat }, i) => {
              const pos        = player.primaryPosition?.abbreviation || '';
              const lineupSlot = lineupMap.get(String(player.id));
              const noHistory  = !stat || (parseInt(stat.atBats) === 0 && !stat.hits);
              return (
                <tr key={player.id} className={`dfs-player-row ${lineupSlot ? 'bvp-lineup-row' : ''}`}>
                  <td className="dfs-td dfs-td-num dfs-sticky-num">{i + 1}</td>
                  <td className="dfs-td dfs-td-player dfs-sticky-player">
                    <span className="dfs-player-name">{player.fullName}</span>
                    {pos && <span className="dfs-player-meta"> {pos}</span>}
                    {lineupSlot && (
                      <span className="bvp-lineup-badge" title="In projected lineup">
                        #{lineupSlot}
                      </span>
                    )}
                  </td>
                  {noHistory ? (
                    <td colSpan={BVP_COLS.length} className="bvp-no-history">
                      No history between batter and pitcher
                    </td>
                  ) : (
                    BVP_COLS.map((c) => {
                      const val = stat?.[c.key];
                      const display = val != null ? (c.rate ? val : String(val)) : '—';
                      return (
                        <td key={c.key} className={`dfs-td ${c.rate ? 'bvp-td-rate' : ''}`}>
                          {display}
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Main DFS Page
   ───────────────────────────────────────────────────────────────────── */
export default function DFSPage() {
  const navigate = useNavigate();
  const [dfsTab, setDfsTab]               = useState('shriebiq'); // 'shriebiq' | 'bvp'
  const [batterTab, setBatterTab]         = useState('dashboard'); // 'dashboard' | 'vs-pitch'
  const [mlbGames, setMlbGames]           = useState([]);   // from MLB Stats API
  const [selectedIdx, setSelectedIdx]     = useState(0);
  const [activeSide, setActiveSide]       = useState('away');
  const [throwsFilter, setThrowsFilter]   = useState('all');
  const [batterStats, setBatterStats]     = useState({ byId: {}, byName: {} });
  const [batterLoading, setBatterLoading] = useState(false);
  const [pitcherSplits, setPitcherSplits]     = useState(null);
  const [pitcherLoading, setPitcherLoading]   = useState(false);
  const [pitcherHand, setPitcherHand]         = useState(null);
  const [pitcherSeasonStat, setPitcherSeasonStat] = useState(null);
  const [pitcherTab, setPitcherTab]               = useState('dashboard'); // 'dashboard'|'pitch-usage'|'game-logs'
  const [lineup, setLineup]               = useState({ players: [], confirmed: false, fromDate: null });
  const [lineupLoading, setLineupLoading] = useState(false);
  const [espnPitcherMap, setEspnPitcherMap] = useState({}); // teamName → ESPN pitcher

  const year = new Date().getFullYear();

  // Load today's MLB games from both APIs
  useEffect(() => {
    const today = new Date();
    const dateStr = today.getFullYear().toString()
      + String(today.getMonth() + 1).padStart(2, '0')
      + String(today.getDate()).padStart(2, '0');

    // MLB Stats API for lineups + confirmed lineup data
    getMlbSchedule().then((games) => {
      setMlbGames(games);
      setSelectedIdx(0);
    }).catch(() => {});

    // ESPN scoreboard — used ONLY as fallback for probable pitchers not in MLB API
    // Matched by full team name (not index) to avoid ordering mismatch
    getScoreboard('mlb', dateStr).then((events) => {
      const map = {};
      for (const event of events) {
        const comp = event.competitions?.[0];
        for (const c of comp?.competitors || []) {
          const teamName = c.team?.displayName;
          const prob = c.probables?.[0];
          if (teamName && prob?.athlete) {
            const ath = prob.athlete;
            map[teamName] = {
              id: String(ath.id || ''),
              name: ath.displayName || ath.fullName || '',
              hand: ath.throwHand?.abbreviation || null,
              headshot: typeof ath.headshot === 'string' ? ath.headshot : ath.headshot?.href || null,
            };
          }
        }
      }
      setEspnPitcherMap(map);
    }).catch(() => {});
  }, []);

  const selectedMlb = mlbGames[selectedIdx] || null;

  // Derive teams from selected MLB game
  const mlbAway = selectedMlb?.teams?.away;
  const mlbHome = selectedMlb?.teams?.home;
  const battingMlb  = activeSide === 'away' ? mlbAway : mlbHome;
  const pitchingMlb = activeSide === 'away' ? mlbHome : mlbAway;

  // Derive probable pitcher: MLB Stats API first, ESPN fallback by team name
  const probPitcherRaw = pitchingMlb?.probablePitcher || null;
  const espnFallback   = espnPitcherMap[pitchingMlb?.team?.name] || null;
  const probPitcher = (() => {
    if (probPitcherRaw) return {
      id: String(probPitcherRaw.id),
      name: probPitcherRaw.fullName || '',
      headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${probPitcherRaw.id}/headshot/67/current`,
      source: 'mlb',
    };
    if (espnFallback) return {
      id: espnFallback.id,
      name: espnFallback.name,
      headshot: espnFallback.headshot
        || (espnFallback.id ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${espnFallback.id}/headshot/67/current` : null),
      source: 'espn',
    };
    return null;
  })();

  // Team IDs for logos (constructed directly from MLB ID, no ESPN game matching needed)
  const battingTeamId  = battingMlb?.team?.id;
  const pitchingTeamId = pitchingMlb?.team?.id;

  // Load lineup when game/side changes
  // AbortController ensures stale fetches (from previous game clicks) are cancelled
  useEffect(() => {
    if (!selectedMlb) return;
    setLineup({ players: [], confirmed: false, fromDate: null });
    setLineupLoading(true);

    const isHome = activeSide === 'home';
    const teamId = isHome ? mlbHome?.team?.id : mlbAway?.team?.id;
    const confirmedPlayers = isHome
      ? selectedMlb.lineups?.homePlayers
      : selectedMlb.lineups?.awayPlayers;

    if (confirmedPlayers?.length > 0) {
      setLineup({ players: confirmedPlayers, confirmed: true, fromDate: null });
      setLineupLoading(false);
      return;
    }

    if (!teamId) { setLineupLoading(false); return; }

    // Use AbortController to cancel if game/side changes before fetch completes
    const controller = new AbortController();
    getProjectedLineup(teamId, controller.signal)
      .then((result) => {
        setLineup(result);
        setLineupLoading(false);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setLineupLoading(false);
      });

    return () => controller.abort(); // cancel on cleanup (game/side changed)
  }, [selectedMlb?.gamePk, activeSide]);

  // Load pitcher splits + hand when pitcher changes
  useEffect(() => {
    if (!probPitcher?.id) return;
    setPitcherLoading(true);
    setPitcherSplits(null);
    setPitcherHand(null);
    setPitcherSeasonStat(null);
    setPitcherTab('dashboard');

    const handPromise = probPitcher.source === 'espn' && espnFallback?.hand
      ? Promise.resolve(espnFallback.hand)
      : fetchPitcherHand(probPitcher.id);

    Promise.allSettled([
      fetchPitcherSplits(probPitcher.id),
      handPromise,
      fetchPitcherSeasonStats(probPitcher.id),
    ]).then(([splitsRes, handRes, seasonRes]) => {
      if (splitsRes.status === 'fulfilled')  setPitcherSplits(splitsRes.value);
      if (handRes.status === 'fulfilled')    setPitcherHand(handRes.value);
      if (seasonRes.status === 'fulfilled')  setPitcherSeasonStat(seasonRes.value);
      setPitcherLoading(false);
    });
  }, [probPitcher?.id, selectedIdx, activeSide]);

  // Load batter Statcast stats when batting team / throws filter changes
  const battingAbbr = battingTeamId ? MLB_ABBR[battingTeamId] : null;
  const prevBattingAbbr = useRef(null);
  useEffect(() => {
    if (!battingAbbr) return;
    setBatterLoading(true);
    // Clear stats only when team changes; keep old data visible during filter change
    if (prevBattingAbbr.current !== battingAbbr) {
      setBatterStats({ byId: {}, byName: {} });
      prevBattingAbbr.current = battingAbbr;
    }
    const throws = throwsFilter === 'all' ? null : throwsFilter;
    fetchTeamBatters(battingAbbr, throws)
      .then(setBatterStats)
      .catch(() => {})
      .finally(() => setBatterLoading(false));
  }, [battingAbbr, throwsFilter]);

  // Auto-set throws filter based on pitcher handedness (from fetched pitcherHand)
  useEffect(() => {
    if (pitcherHand === 'L' || pitcherHand === 'R') setThrowsFilter(pitcherHand);
  }, [pitcherHand]);

  return (
    <div className="dfs-page">
      {/* ── Game selector ─────────────────────────────────────────── */}
      <div className="dfs-game-selector">
        <div className="dfs-selector-label">Select Game</div>
        <div className="dfs-games-list">
          {mlbGames.length === 0 && <span className="dfs-no-games">Loading games…</span>}
          {mlbGames.map((g, i) => {
            const away = g.teams?.away?.team;
            const home = g.teams?.home?.team;
            const awayAbbr = MLB_SHORT[away?.id] || '?';
            const homeAbbr = MLB_SHORT[home?.id] || '?';
            const status = g.status?.detailedState || g.status?.abstractGameState || '';
            const isSelected = i === selectedIdx;
            return (
              <button
                key={g.gamePk}
                className={`dfs-game-pill ${isSelected ? 'dfs-game-pill-active' : ''}`}
                onClick={() => { setSelectedIdx(i); setActiveSide('away'); }}
              >
                <span className="dfs-pill-team">{awayAbbr}</span>
                <span className="dfs-pill-sep">@</span>
                <span className="dfs-pill-team">{homeAbbr}</span>
                {status && <span className="dfs-pill-status">{status}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {selectedMlb && (
        <>
          {/* ── Page tab switcher: ShribeIQ | BvP History ─────────── */}
          <div className="dfs-page-tabs">
            {[
              { key: 'shriebiq', label: '⚡ ShribeIQ' },
              { key: 'bvp',      label: '🆚 BvP History' },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`dfs-page-tab ${dfsTab === key ? 'dfs-page-tab-active' : ''}`}
                onClick={() => setDfsTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Team tab switcher (both tabs) ─────────────────────── */}
          <div className="dfs-team-tabs">
            {[
              { side: 'away', mlbTeam: mlbAway?.team },
              { side: 'home', mlbTeam: mlbHome?.team },
            ].map(({ side, mlbTeam }) => {
              const abbr = MLB_SHORT[mlbTeam?.id] || mlbTeam?.name?.split(' ').slice(-1)[0] || '?';
              return (
                <button
                  key={side}
                  className={`dfs-team-tab ${activeSide === side ? 'dfs-team-tab-active' : ''}`}
                  onClick={() => setActiveSide(side)}
                >
                  <TeamLogo teamId={mlbTeam?.id} className="dfs-tab-logo" />
                  {abbr} Batters
                </button>
              );
            })}
          </div>

          {/* ── ShribeIQ tab: two-panel matchup layout ────────────── */}
          {dfsTab === 'shriebiq' && <div className="dfs-panels">

            {/* ── LEFT: Batter panel ─────────────────────────────── */}
            <div className="dfs-panel dfs-panel-batters">
              <div className="dfs-panel-header">
                <div className="dfs-panel-team">
                  <TeamLogo teamId={battingTeamId} className="dfs-panel-logo" />
                  <div>
                    <div className="dfs-panel-name">{battingMlb?.team?.name}</div>
                    <div className="dfs-panel-sub">
                      {lineupLoading ? 'Loading lineup…' : lineup.confirmed
                        ? <span className="dfs-confirmed-badge">✓ CONFIRMED LINEUP</span>
                        : lineup.fromDate
                          ? <span className="dfs-projected-badge">⟳ PROJECTED LINEUP</span>
                          : 'Batting Lineup'}
                    </div>
                  </div>
                </div>
                {/* Throws filter — only shown on Dashboard tab */}
                {batterTab === 'dashboard' && (
                  <div className="dfs-filter-row">
                    {[
                      { val: 'all', label: 'vs All' },
                      { val: 'L',   label: 'vs L' },
                      { val: 'R',   label: 'vs R' },
                    ].map(({ val, label }) => (
                      <button
                        key={val}
                        className={`dfs-filter-btn ${throwsFilter === val ? 'dfs-filter-active' : ''}`}
                        onClick={() => setThrowsFilter(val)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Batter sub-tabs */}
              <div className="dfs-pitcher-tabs">
                {[
                  { key: 'dashboard', label: 'Dashboard' },
                  { key: 'vs-pitch',  label: 'vs Pitch Type' },
                ].map(({ key, label }) => (
                  <button key={key}
                    className={`dfs-pitcher-tab ${batterTab === key ? 'dfs-pitcher-tab-active' : ''}`}
                    onClick={() => setBatterTab(key)}>
                    {label}
                  </button>
                ))}
              </div>

              {batterTab === 'dashboard' && (
                batterLoading || lineupLoading
                  ? <div className="dfs-loading"><div className="auth-spinner" /><span>Loading…</span></div>
                  : <BatterTable lineup={lineup.players} savantMap={batterStats} />
              )}
              {batterTab === 'vs-pitch' && (
                <VsPitchTypeTab
                  lineup={lineup.players}
                  battingAbbr={battingAbbr}
                  pitcherId={probPitcher?.id}
                  defaultHand={pitcherHand || probPitcher?.hand}
                />
              )}
            </div>

            {/* ── RIGHT: Pitcher panel ───────────────────────────── */}
            <div className="dfs-panel dfs-panel-pitcher">
              {/* Header — team info left, pitcher info right, both in same row */}
              <div className="dfs-panel-header dfs-pitcher-header">
                <div className="dfs-panel-team">
                  <TeamLogo teamId={pitchingTeamId} className="dfs-panel-logo" />
                  <div>
                    <div className="dfs-panel-name">{pitchingMlb?.team?.name}</div>
                    <div className="dfs-panel-sub">Starting Pitcher</div>
                  </div>
                </div>

                {probPitcher ? (
                  <div className="dfs-pitcher-inline">
                    {probPitcher.headshot && (
                      <img
                        src={probPitcher.headshot}
                        alt=""
                        className="dfs-pitcher-avatar-sm"
                        onError={(e) => {
                          // Try ESPN CDN fallback if MLB photo fails
                          const espn = `https://a.espncdn.com/i/headshots/mlb/players/full/${probPitcher.id}.png`;
                          if (e.target.src !== espn) { e.target.onerror = null; e.target.src = espn; }
                          else { e.target.style.display = 'none'; }
                        }}
                      />
                    )}
                    <div className="dfs-pitcher-inline-info">
                      <div className="dfs-pitcher-name-row">
                        <span className="dfs-pitcher-name-text">{probPitcher.name}</span>
                        {(pitcherHand || probPitcher.hand) && (
                          <span className={`dfs-pitcher-arm dfs-pitcher-arm-${(pitcherHand || probPitcher.hand)?.toLowerCase()}`}>
                            {(pitcherHand || probPitcher.hand) === 'L' ? 'LHP' : 'RHP'}
                          </span>
                        )}
                      </div>
                      {pitcherSeasonStat && (
                        <div className="dfs-pitcher-season-stats">
                          {pitcherSeasonStat.wins != null && pitcherSeasonStat.losses != null && (
                            <span>{pitcherSeasonStat.wins}-{pitcherSeasonStat.losses}</span>
                          )}
                          {pitcherSeasonStat.inningsPitched && <span>{pitcherSeasonStat.inningsPitched} IP</span>}
                          {pitcherSeasonStat.strikeOuts != null && <span>{pitcherSeasonStat.strikeOuts} K</span>}
                          {pitcherSeasonStat.era && <span>{pitcherSeasonStat.era} ERA</span>}
                          {pitcherSeasonStat.whip && <span>{pitcherSeasonStat.whip} WHIP</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="dfs-empty" style={{ padding: '4px 0' }}>No starter announced</div>
                )}
              </div>

              {probPitcher && (
                <>
                  {/* Pitcher sub-tabs */}
                  <div className="dfs-pitcher-tabs">
                    {[
                      { key: 'dashboard',   label: 'Dashboard' },
                      { key: 'pitch-usage', label: 'Pitch Usage' },
                      { key: 'game-logs',   label: 'Game Logs' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        className={`dfs-pitcher-tab ${pitcherTab === key ? 'dfs-pitcher-tab-active' : ''}`}
                        onClick={() => setPitcherTab(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {pitcherTab === 'dashboard' && (
                    pitcherLoading
                      ? <div className="dfs-loading"><div className="auth-spinner"/><span>Loading splits…</span></div>
                      : <PitcherSplitsTable splits={pitcherSplits} />
                  )}
                  {pitcherTab === 'pitch-usage' && (
                    <PitchUsageTable pitcherId={probPitcher.id} />
                  )}
                  {pitcherTab === 'game-logs' && (
                    <PitcherGameLog pitcherId={probPitcher.id} />
                  )}
                </>
              )}
            </div>
          </div>}

          {/* ── BvP History tab ───────────────────────────────────── */}
          {dfsTab === 'bvp' && (
            <BvPTab
              lineup={lineup.players}
              pitcherId={probPitcher?.id}
              pitcherName={probPitcher?.name}
              battingTeamId={battingTeamId}
            />
          )}
        </>
      )}

      {mlbGames.length === 0 && (
        <div className="dfs-empty dfs-empty-center">No MLB games scheduled for today.</div>
      )}
    </div>
  );
}

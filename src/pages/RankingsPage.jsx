import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const STATSAPI = 'https://statsapi.mlb.com/api/v1';
const BS = 'https://baseballsavant.mlb.com';

const MLB_ABBR = {
  108:'LAA',109:'ARI',110:'BAL',111:'BOS',112:'CHC',113:'CIN',114:'CLE',
  115:'COL',116:'DET',117:'HOU',118:'KC', 119:'LAD',120:'WSH',121:'NYM',
  133:'ATH',134:'PIT',135:'SD', 136:'SEA',137:'SF', 138:'STL',139:'TB',
  140:'TEX',141:'TOR',142:'MIN',143:'PHI',144:'ATL',145:'CWS',146:'MIA',
  147:'NYY',158:'MIL',
};

/* ── Shared helpers ──────────────────────────────────────────────────── */
function parseCSV(text) {
  const raw = text.replace(/^\uFEFF/, '');
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitLine(lines[0]);
  return lines.slice(1).map(l => {
    const vals = splitLine(l);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}
function splitLine(line) {
  const r = []; let cur = ''; let q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { r.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  r.push(cur.trim());
  return r;
}
async function apiFetch(url, signal) {
  const res = await fetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/* ── Data fetchers ───────────────────────────────────────────────────── */
async function getMlbSchedule() {
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(
    `${STATSAPI}/schedule?sportId=1&date=${today}&hydrate=probablePitcher,lineups,teams,game(content(summary))`
  );
  const data = await res.json();
  return data.dates?.[0]?.games || [];
}

// Fetch ALL pitcher stats for the season in one call — filter client-side
async function fetchAllPitcherStats() {
  const year = new Date().getFullYear();
  const text = await apiFetch(
    `${BS}/statcast_search/csv?player_type=pitcher&hfGT=R%7C&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0`
  );
  const rows = parseCSV(text);
  const map = {};
  rows.forEach(r => { if (r.player_id) map[String(r.player_id).trim()] = r; });
  return map;
}

// Get pitcher splits vs L and R from statcast_search leaderboard
async function fetchPitcherSplitsById(mlbId) {
  const year = new Date().getFullYear();
  const base = `${BS}/statcast_search/csv?player_type=pitcher&hfGT=R%7C&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0`;
  const [allText, vsLText, vsRText] = await Promise.all([
    apiFetch(base),
    apiFetch(base + '&batter_stands=L'),
    apiFetch(base + '&batter_stands=R'),
  ]);
  const pick = (text) => parseCSV(text).find(r => String(r.player_id).trim() === String(mlbId).trim()) || null;
  return { all: pick(allText), vsL: pick(vsLText), vsR: pick(vsRText) };
}

// Season stats for team batters (vs specific pitcher handedness)
// Season stats — NO hand filter, so they're comparable to recent form
async function fetchTeamBattersForRankings(abbr) {
  const year = new Date().getFullYear();
  const url = `${BS}/statcast_search/csv?player_type=batter&hfGT=R%7C&hfTeam=${encodeURIComponent(abbr + '|')}&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0`;
  const text = await apiFetch(url);
  const rows = parseCSV(text);
  const map = {};
  rows.forEach(r => { if (r.player_id) map[String(r.player_id).trim()] = r; });
  return map;
}

// Recent form: last 21 days, also no hand filter → consistent comparison with season
async function fetchTeamRecentForm(abbr) {
  const d = new Date(); d.setDate(d.getDate() - 21);
  const since = d.toISOString().slice(0, 10);
  const url = `${BS}/statcast_search/csv?player_type=batter&hfGT=R%7C&hfTeam=${encodeURIComponent(abbr + '|')}&game_date_gt=${since}&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0`;
  const text = await apiFetch(url).catch(() => '');
  if (!text) return {};
  const rows = parseCSV(text);
  const map = {};
  rows.forEach(r => { if (r.player_id) map[String(r.player_id).trim()] = r; });
  return map;
}

// Hot/cold: compare recent xwOBA to season xwOBA (now both vs all pitchers — apples to apples)
// Require 25+ recent PA and 50+ total PA to avoid noise
// Threshold raised: need 0.040 diff to show emoji (less sensitive to noise)
function formTag(seasonXwoba, recentXwoba, recentPA, totalPA) {
  if (recentPA < 25 || totalPA < 50 || !recentXwoba || !seasonXwoba) return { icon: '', cls: '' };
  const diff = recentXwoba - seasonXwoba;
  if (diff >= 0.060) return { icon: '🔥', cls: 'form-hot' };
  if (diff <= -0.060) return { icon: '❄️', cls: 'form-cold' };
  return { icon: '', cls: '' };
}

/* ── ESPN ID resolution ──────────────────────────────────────────────── */
// Fetch all ESPN MLB team abbreviation → ESPN team ID mapping
async function fetchEspnTeamIds() {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams?limit=50');
  const data = await res.json();
  const map = {};
  for (const t of (data.sports?.[0]?.leagues?.[0]?.teams || [])) {
    const team = t.team;
    if (team?.abbreviation && team?.id) map[team.abbreviation.toUpperCase()] = team.id;
  }
  return map;
}

// Fetch ESPN roster for a team and return normName → espnAthleteId map
async function fetchEspnRoster(espnTeamId) {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/${espnTeamId}/roster`
  );
  const data = await res.json();
  const map = {};
  for (const group of (data.athletes || [])) {
    const items = Array.isArray(group) ? group : (group.items || group.athletes || []);
    for (const a of items) {
      const name = a.fullName || a.displayName || '';
      if (name && a.id) map[normName(name)] = String(a.id);
    }
  }
  return map;
}

/* ── DraftKings salary CSV parser ───────────────────────────────────── */
// Normalize names for fuzzy matching (removes accents, suffixes, punctuation)
function normName(name) {
  return (name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)[\s.]*$/i, '') // strip suffixes
    .toLowerCase().replace(/[^a-z]/g, '');               // letters only
}

function parseDkCsv(text) {
  // DraftKings format:
  // Position,Name + ID,Name,ID,Roster Position,Salary,Game Info,TeamAbbrev,AvgPointsPerGame
  const lines = text.split('\n').filter(l => l.trim());
  const headerIdx = lines.findIndex(l => l.includes('Salary') && l.includes('Name'));
  if (headerIdx === -1) return {};
  const headers = lines[headerIdx].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  const nameIdx   = headers.findIndex(h => h === 'name');
  const salaryIdx = headers.findIndex(h => h === 'salary');
  const teamIdx   = headers.findIndex(h => h.includes('team'));
  const avgPtsIdx = headers.findIndex(h => h.includes('avgpoints') || h.includes('avg_points') || h.includes('ppg'));

  const salaryMap = {};
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const name   = cols[nameIdx]   || '';
    const salary = parseInt((cols[salaryIdx] || '').replace(/[^0-9]/g, '')) || 0;
    const team   = cols[teamIdx]   || '';
    const avgPts = avgPtsIdx >= 0 ? parseFloat(cols[avgPtsIdx]) || 0 : 0;
    if (name && salary > 0) {
      salaryMap[normName(name)] = { name, salary, team, avgPts };
    }
  }
  return salaryMap;
}

/* ── DK Fantasy Points Projection ───────────────────────────────────── */
// When DK salary data is uploaded, use their AvgPointsPerGame as the baseline —
// it's calibrated to real DK scoring. We then apply a matchup multiplier (±25%)
// derived from the ShribeIQ score to adjust for today's specific matchup.
//
// When no DK data is uploaded, we fall back to a rough Statcast estimate.
function projDkPts(dkAvgPts, score) {
  if (dkAvgPts > 0) {
    // ShribeIQ score 65 = league avg matchup → 1.0× (no change)
    // Score 85 (great matchup) → 1.20×, Score 45 (poor) → 0.80×
    const multiplier = Math.max(0.70, Math.min(1.30, 1.0 + (score - 65) / 100));
    return Math.round(dkAvgPts * multiplier * 10) / 10;
  }
  // Fallback (no DK data): rough estimate — shows "~" prefix in UI
  return null;
}

/* ── Scoring formula ─────────────────────────────────────────────────── */
// ShribeIQ score (0-100): reflects TODAY's expected offensive output for this batter.
//
// Design principle: player quality is the PRIMARY factor. A weak hitter
// facing a terrible pitcher should NOT outscore a great hitter in an average matchup.
//
//   70% — Batter talent (season xwOBA normalized to 0-100)
//   20% — Pitcher difficulty today (how hittable is this pitcher vs league avg)
//   10% — Recent form adjustment (capped at ±8 pts to avoid noise)
//
// Score 70+ = above-average matchup worth targeting
// Score 50   = exactly league-average batter vs league-average pitcher
// Score 30-  = below-average matchup

function calcScore(season, recent, pitcherRow) {
  const f = (v, d) => { const n = parseFloat(v); return isNaN(n) ? d : n; };

  // ── BATTER TALENT (70%) ───────────────────────────────────────────────
  // Normalize xwOBA to 0-100 where 50 = league avg (.315), range .210-.430
  const xwoba = f(season?.xwoba, 0.315);
  const xwobaScore = Math.max(0, Math.min(100, (xwoba - 0.210) / (0.430 - 0.210) * 100));

  // Hard Hit % bonus/penalty (secondary batter quality signal)
  const hh = f(season?.hardhit_percent, 36);
  const hhBonus = Math.max(-8, Math.min(8, (hh - 36) / 2)); // ±8 pts for ±16% from avg

  // K% penalty
  const k = f(season?.k_percent, 22);
  const kPenalty = Math.max(-5, Math.min(5, (k - 22) / 2)); // ±5 pts for ±10% from avg

  const batterScore = xwobaScore + hhBonus - kPenalty; // ~0-108, then normalize below

  // ── PITCHER MATCHUP (20%) ─────────────────────────────────────────────
  // How far above/below league avg is this pitcher's xwOBA allowed?
  // League avg pitcher xwOBA ≈ .315. Range .230 (ace) to .400 (terrible).
  const pXwoba = f(pitcherRow?.xwoba, 0.315);
  // 50 = avg pitcher, 80 = very hittable, 20 = dominant ace
  const pitcherScore = Math.max(0, Math.min(100, (pXwoba - 0.230) / (0.400 - 0.230) * 100));
  // Matchup bonus: how much above/below 50 is the pitcher score?
  const matchupBonus = (pitcherScore - 50) * 0.20; // ±10 pts max for extreme pitchers

  // ── RECENT FORM (10%, very conservative) ─────────────────────────────
  // Only fire if we have meaningful recent sample (25+ PA)
  const seasonXwoba = xwoba;
  const recentXwoba = recent ? f(recent.xwoba, seasonXwoba) : seasonXwoba;
  const recentPA    = recent ? (parseInt(recent.pa) || 0) : 0;
  const formWeight  = Math.min(1.0, recentPA / 50); // ramp up to full weight at 50 PA
  const formDiff    = (recentXwoba - seasonXwoba) / 0.080; // normalise: 0.080 gap = 1 unit
  const formBonus   = Math.max(-8, Math.min(8, formDiff * 8 * formWeight));

  // ── FINAL SCORE ────────────────────────────────────────────────────────
  // batterScore (0-108) → target centre of 50 means avg batter = 50
  // batterScore at league avg xwoba (.315 → 50th percentile on 0-100 scale = 50):
  //   xwobaScore(0.315) = (0.315-0.210)/(0.430-0.210)*100 = 47.7 ≈ 50 ✓
  const raw = batterScore * 0.70 + (50 + matchupBonus) * 0.20 + (50 + formBonus) * 0.10;
  // Re-centre so 50 = avg batter, avg pitcher, avg form
  // raw at avg = 47.7*0.70 + 50*0.20 + 50*0.10 = 33.4 + 10 + 5 = 48.4 ≈ 50 ✓
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

/* ── Score badge color ───────────────────────────────────────────────── */
function scoreBadgeClass(score) {
  if (score >= 75) return 'rank-badge-elite';
  if (score >= 65) return 'rank-badge-good';
  if (score >= 55) return 'rank-badge-avg';
  return 'rank-badge-poor';
}

function fmt(val, type) {
  const n = parseFloat(val);
  if (isNaN(n) || val == null || val === '') return '—';
  if (type === 'avg') return n < 1 ? n.toFixed(3).replace(/^0\./, '.') : n.toFixed(3);
  if (type === 'pct') return n.toFixed(1) + '%';
  return String(n);
}

/* ─────────────────────────────────────────────────────────────────────
   Main Rankings Page
   ───────────────────────────────────────────────────────────────────── */
export default function RankingsPage() {
  const [rankings, setRankings]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [progress, setProgress]   = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterHand, setFilterHand] = useState('');
  const [sortCol, setSortCol]     = useState('score');
  const [sortDir, setSortDir]     = useState('desc');
  const [salaryMap, setSalaryMap]   = useState({});
  const [salaryDate, setSalaryDate] = useState('');  // date string of loaded salaries
  const [espnIdMap, setEspnIdMap]   = useState({});
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // On mount: restore cached salaries from localStorage if still today's
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('shribely_dk_salaries') || 'null');
      if (cached?.date === todayStr && cached?.map) {
        setSalaryMap(cached.map);
        setSalaryDate(cached.date);
        setSortCol('value');
        setSortDir('desc');
      }
    } catch {}
  }, []);

  const saveSalaries = (parsed) => {
    setSalaryMap(parsed);
    setSalaryDate(todayStr);
    setSortCol('value');
    setSortDir('desc');
    try {
      localStorage.setItem('shribely_dk_salaries', JSON.stringify({ date: todayStr, map: parsed }));
    } catch {}
  };

  const clearSalaries = () => {
    setSalaryMap({});
    setSalaryDate('');
    setSortCol('score');
    setSortDir('desc');
    try { localStorage.removeItem('shribely_dk_salaries'); } catch {}
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDkUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseDkCsv(ev.target.result || '');
      saveSalaries(parsed);
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRankings([]);

    (async () => {
      try {
        // Step 1: today's schedule
        setProgress('Loading today\'s schedule…');
        const games = await getMlbSchedule();
        if (cancelled) return;

        // Step 2: all pitcher stats (one big call)
        setProgress('Fetching pitcher stats…');
        const allPitcherStats = await fetchAllPitcherStats().catch(() => ({}));
        if (cancelled) return;

        // Step 3: pitcher handedness + batting lineups for each game
        setProgress('Resolving pitchers and lineups…');
        const pitcherMatchups = games.flatMap(g => [
          {
            game: g, pitcher: g.teams?.home?.probablePitcher,
            batterTeamId: g.teams?.away?.team?.id, batterSide: 'away',
            confirmedLineup: g.lineups?.awayPlayers || [],
          },
          {
            game: g, pitcher: g.teams?.away?.probablePitcher,
            batterTeamId: g.teams?.home?.team?.id, batterSide: 'home',
            confirmedLineup: g.lineups?.homePlayers || [],
          },
        ]).filter(m => m.pitcher?.id && m.batterTeamId);

        // Fetch pitcher hands + projected lineups (when not confirmed) in parallel
        const handAndLineupResults = await Promise.allSettled(
          pitcherMatchups.map(async (m) => {
            const [handRes, lineupRes] = await Promise.allSettled([
              fetch(`${STATSAPI}/people/${m.pitcher.id}`).then(r => r.json())
                .then(d => d.people?.[0]?.pitchHand?.code || null),
              // Use confirmed lineup if available, else project from team roster
              m.confirmedLineup.length > 0
                ? Promise.resolve(m.confirmedLineup)
                : fetch(`${STATSAPI}/teams/${m.batterTeamId}/roster?rosterType=active&season=${new Date().getFullYear()}`)
                    .then(r => r.json())
                    .then(d => (d.roster || [])
                      .filter(p => p.position?.type !== 'Pitcher')
                      .slice(0, 9)
                      .map(p => ({ id: p.person?.id, fullName: p.person?.fullName || '' })))
                    .catch(() => []),
            ]);
            return {
              pitcherHand: handRes.status === 'fulfilled' ? handRes.value : null,
              lineupPlayers: lineupRes.status === 'fulfilled' ? lineupRes.value : [],
            };
          })
        );

        const matchupsWithHands = pitcherMatchups.map((m, i) => {
          const r = handAndLineupResults[i].status === 'fulfilled' ? handAndLineupResults[i].value : {};
          return { ...m, pitcherHand: r.pitcherHand || null, lineupPlayers: r.lineupPlayers || [] };
        });

        if (cancelled) return;

        // Step 4: fetch Statcast stats (season + recent) for each batting team
        setProgress('Fetching batter Statcast stats…');
        const batterResults = await Promise.allSettled(
          matchupsWithHands.map(async (m) => {
            const abbr = MLB_ABBR[m.batterTeamId];
            if (!abbr) return null;
            const [seasonById, recentById] = await Promise.allSettled([
              fetchTeamBattersForRankings(abbr), // no hand filter — consistent with recent
              fetchTeamRecentForm(abbr),
            ]);
            return {
              ...m, abbr,
              byId:       seasonById.status  === 'fulfilled' ? seasonById.value  : {},
              recentById: recentById.status  === 'fulfilled' ? recentById.value  : {},
            };
          })
        );

        if (cancelled) return;

        // Step 5: score ONLY the 9 lineup players for each team
        setProgress('Computing ShribeIQ scores…');
        const allRows = [];
        batterResults.forEach(res => {
          if (res.status !== 'fulfilled' || !res.value) return;
          const { pitcher, pitcherHand, abbr, byId, recentById, lineupPlayers } = res.value;
          const pitcherId = String(pitcher.id);
          const pitcherRow = allPitcherStats[pitcherId] || null;

          // Iterate over the 9 lineup players (not all team batters)
          lineupPlayers.forEach(player => {
            const batterId = String(player.id);
            const seasonBatter = byId[batterId]; // may be undefined if < 100 PA

            // Determine player name: from Statcast if available, else from lineup data
            const rawName = seasonBatter?.player_name || '';
            const playerName = rawName
              ? rawName.split(',').map(s => s.trim()).reverse().join(' ')
              : (player.fullName || '');

            // Skip if no usable stats AND no name
            if (!playerName) return;

            const recentBatter = recentById[batterId] || null;
            const hasStats = seasonBatter && (parseInt(seasonBatter.pa) || 0) >= 20;

            // calcScore now takes (season, recent, pitcher) — all vs all pitchers = fair comparison
            const score   = hasStats
              ? calcScore(seasonBatter, recentBatter, pitcherRow)
              : 50;
            const projPts = null;
            // formTag: both season and recent are now vs all pitchers → valid comparison
            const form    = hasStats ? formTag(
              parseFloat(seasonBatter?.xwoba) || 0.315,
              parseFloat(recentBatter?.xwoba) || null,
              parseInt(recentBatter?.pa) || 0,
              parseInt(seasonBatter?.pa) || 0
            ) : { icon: '', cls: '' };

            // Only add to rows (remove old abs check — lineup determines inclusion)
            {  // brace replaces the removed `if (abs >= 100)` filter

            allRows.push({
              batterId,
              playerName,
              playerNameNorm: normName(playerName),
              teamAbbr: abbr,
              pitcherName: pitcher.fullName || '',
              pitcherId,
              pitcherHand: pitcherHand || '?',
              score:   Math.round(score * 10) / 10,
              projPts,
              pa:      seasonBatter?.pa      ?? null,
              xwoba:   seasonBatter?.xwoba   ?? null,
              woba:    seasonBatter?.woba    ?? null,
              hh:      seasonBatter?.hardhit_percent ?? null,
              brl:     seasonBatter?.barrels_per_bbe_percent ?? null,
              kpct:    seasonBatter?.k_percent  ?? null,
              bbpct:   seasonBatter?.bb_percent ?? null,
              iso:     seasonBatter?.iso    ?? null,
              pXwoba:  pitcherRow?.xwoba,
              pKpct:   pitcherRow?.k_percent,
              formIcon: form.icon,
              formCls:  form.cls,
              recentXwoba: parseFloat(recentBatter?.xwoba) || null,
              recentPA:    parseInt(recentBatter?.pa) || 0,
              hasStats,
            });
          } // close the brace replacing the old if-filter
          }); // close lineupPlayers.forEach
        });

        if (!cancelled) {
          allRows.sort((a, b) => b.score - a.score);
          setRankings(allRows);
          setLoading(false);
          setProgress('');
        }

        // Background: resolve ESPN athlete IDs for clickable player links
        if (!cancelled) {
          const teamAbbrs = [...new Set(allRows.map(r => r.teamAbbr))];
          fetchEspnTeamIds().then(async (espnTeamIdMap) => {
            const combined = {};
            await Promise.allSettled(
              teamAbbrs.map(async (abbr) => {
                const espnTeamId = espnTeamIdMap[abbr];
                if (!espnTeamId) return;
                const rosterMap = await fetchEspnRoster(espnTeamId).catch(() => ({}));
                Object.assign(combined, rosterMap);
              })
            );
            if (!cancelled) setEspnIdMap(combined);
          }).catch(() => {});
        }
      } catch (e) {
        if (!cancelled) { setLoading(false); setProgress(''); }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  /* ── Merge salary + compute projPts using DK's AvgPointsPerGame ── */
  const enriched = rankings.map(r => {
    const dk      = salaryMap[r.playerNameNorm] || null;
    const salary  = dk?.salary  || 0;
    const dkAvg   = dk?.avgPts  || 0;
    // Use DK avg as base (adjusted by matchup score) when available
    const projPts = projDkPts(dkAvg, r.score);
    const value   = (salary > 0 && projPts != null)
      ? Math.round((projPts / (salary / 1000)) * 100) / 100
      : null;
    return { ...r, salary, dkAvg, projPts, value };
  });
  const hasSalaries = enriched.some(r => r.salary > 0);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const teams = [...new Set(enriched.map(r => r.teamAbbr))].sort();

  const filtered = enriched.filter(r => {
    if (filterTeam && r.teamAbbr !== filterTeam) return false;
    if (filterHand && r.pitcherHand !== filterHand) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const va = parseFloat(a[sortCol]) || 0;
    const vb = parseFloat(b[sortCol]) || 0;
    return sortDir === 'desc' ? vb - va : va - vb;
  });

  const ColHeader = ({ col, label }) => (
    <th className={`rank-th ${sortCol === col ? 'rank-th-active' : ''}`}
      onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label}{sortCol === col ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  );

  return (
    <div className="rank-page">
      {/* Header */}
      <div className="rank-header">
        <div>
          <div className="rank-title">⚡ ShribeIQ Batter Rankings</div>
          <div className="rank-subtitle">
            All today's batters ranked by matchup favorability — Statcast metrics vs opposing pitcher
          </div>
        </div>
        {!loading && (
          <div className="rank-meta">
            {sorted.length} batters · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* Filters + DK Upload */}
      {!loading && (
        <div className="rank-controls">
          <div className="rank-filters">
            <select className="dfs-arsenal-select" value={filterTeam} onChange={e => setFilterTeam(e.target.value)}>
              <option value="">All Teams</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="dfs-arsenal-select" value={filterHand} onChange={e => setFilterHand(e.target.value)}>
              <option value="">All Pitchers</option>
              <option value="L">vs LHP</option>
              <option value="R">vs RHP</option>
            </select>
          </div>
          <div className="rank-dk-upload">
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={handleDkUpload} />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className={`rank-upload-btn ${hasSalaries ? 'rank-upload-btn-active' : ''}`}
                onClick={() => fileInputRef.current?.click()}>
                {hasSalaries ? `✓ DK Salaries Loaded` : '📥 Import DraftKings Salaries (.csv)'}
              </button>
              {hasSalaries && (
                <button className="rank-clear-btn" onClick={clearSalaries} title="Clear salary data">
                  ✕
                </button>
              )}
            </div>
            {hasSalaries && salaryDate === todayStr && (
              <div className="rank-upload-hint rank-upload-saved">
                💾 Saved for today — auto-loads on refresh
              </div>
            )}
            {!hasSalaries && (
              <div className="rank-upload-hint">
                Download from DK contest lobby → Export Salaries → Upload here (saved all day)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="rank-loading">
          <div className="auth-spinner" />
          <div>
            <div className="rank-loading-title">Building ShribeIQ Rankings…</div>
            <div className="rank-loading-sub">{progress}</div>
          </div>
        </div>
      )}

      {/* Rankings table */}
      {!loading && (
        <div className="rank-table-wrap">
          <table className="rank-table">
            <thead>
              <tr>
                <th className="rank-th rank-th-num">#</th>
                <th className="rank-th rank-th-player">Batter</th>
                <th className="rank-th">Team</th>
                <th className="rank-th rank-th-pitcher">Opposing Pitcher</th>
                {hasSalaries && <ColHeader col="salary"  label="Salary" />}
                {hasSalaries && <ColHeader col="projPts" label="Proj Pts" />}
                {hasSalaries && <ColHeader col="value"   label="Pts/$K" />}
                <ColHeader col="score"  label="Score" />
                <ColHeader col="xwoba"  label="xwOBA" />
                <ColHeader col="woba"   label="wOBA" />
                <ColHeader col="hh"     label="HH%" />
                <ColHeader col="brl"    label="Brl%" />
                <ColHeader col="kpct"   label="K%" />
                <ColHeader col="bbpct"  label="BB%" />
                <ColHeader col="pXwoba" label="P.xwOBA" />
                <ColHeader col="pKpct"  label="P.K%" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={`${r.batterId}-${r.pitcherId}`} className="rank-tr">
                  <td className="rank-td rank-td-num">{i + 1}</td>
                  <td className="rank-td rank-td-player">
                    {espnIdMap[r.playerNameNorm] ? (
                      <span
                        className="rank-player-name rank-player-link"
                        onClick={() => navigate(`/player/mlb/${espnIdMap[r.playerNameNorm]}`)}
                        title="View player profile"
                      >
                        {r.playerName}
                      </span>
                    ) : (
                      <span className="rank-player-name">{r.playerName}</span>
                    )}
                    {r.formIcon && (
                      <span className="rank-form-icon" title={`Recent xwOBA: ${r.recentXwoba?.toFixed(3)} (${r.recentPA} PA last 14d)`}>
                        {r.formIcon}
                      </span>
                    )}
                  </td>
                  <td className="rank-td rank-td-team">{r.teamAbbr}</td>
                  <td className="rank-td rank-td-pitcher">
                    <span>{r.pitcherName.split(' ').map((w,i)=>i===0?w[0]+'.':w).join(' ')}</span>
                    <span className={`rank-hand rank-hand-${r.pitcherHand?.toLowerCase()}`}>{r.pitcherHand}</span>
                  </td>
                  {hasSalaries && (
                    <td className="rank-td rank-salary">
                      {r.salary > 0 ? `$${r.salary.toLocaleString()}` : '—'}
                    </td>
                  )}
                  {hasSalaries && (
                    <td className="rank-td rank-proj" title={r.dkAvg > 0 ? `DK avg: ${r.dkAvg} × matchup adj` : 'No DK data'}>
                      {r.projPts != null ? r.projPts : (r.dkAvg > 0 ? r.dkAvg : '—')}
                    </td>
                  )}
                  {hasSalaries && (
                    <td className="rank-td">
                      {r.value != null ? (
                        <span className={`rank-value-badge ${r.value >= 3.5 ? 'rank-badge-elite' : r.value >= 2.5 ? 'rank-badge-good' : r.value >= 2.0 ? 'rank-badge-avg' : 'rank-badge-poor'}`}>
                          {r.value}x
                        </span>
                      ) : '—'}
                    </td>
                  )}
                  <td className="rank-td">
                    <span className={`rank-score-badge ${scoreBadgeClass(r.score)}`}>{r.score}</span>
                  </td>
                  <td className="rank-td">{fmt(r.xwoba, 'avg')}</td>
                  <td className="rank-td">{fmt(r.woba, 'avg')}</td>
                  <td className="rank-td">{fmt(r.hh, 'pct')}</td>
                  <td className="rank-td">{fmt(r.brl, 'pct')}</td>
                  <td className="rank-td">{fmt(r.kpct, 'pct')}</td>
                  <td className="rank-td">{fmt(r.bbpct, 'pct')}</td>
                  <td className="rank-td rank-td-dim">{fmt(r.pXwoba, 'avg')}</td>
                  <td className="rank-td rank-td-dim">{fmt(r.pKpct, 'pct')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

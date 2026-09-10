import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlayerBio } from '../api/espn';
import { adaptColorForDarkBg } from '../utils/colorUtils';

/* ── CSV parser ──────────────────────────────────────────────────────── */
function parseCSV(text) {
  // strip BOM
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
  const result = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

/* ── Baseball Savant data fetchers (all CORS-enabled, no proxy needed) ─ */
const BS = 'https://baseballsavant.mlb.com';
const UA = 'Mozilla/5.0';

async function bsFetch(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Year-by-year Statcast stats for a specific batter
async function fetchStatcastYears(mlbId) {
  // batterID is ignored by the endpoint (same issue as pitcherID).
  // Fetch full current-year leaderboard and filter client-side.
  // hfSea limits to this year, ensuring all ~576 batters fit in the response.
  const year = new Date().getFullYear();
  const url = `${BS}/statcast_search/csv?player_type=batter&hfGT=R%7C&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0`;
  const text = await bsFetch(url);
  const { rows } = parseCSV(text);
  const row = rows.find((r) => String(r.player_id).trim() === String(mlbId).trim());
  // Return as a single-entry array (year-by-year table shows current year)
  return row ? [{ ...row, year }] : [];
}

// Current-year percentile rankings — fetch all, filter by player_id
async function fetchPercentiles(mlbId, year) {
  const url = `${BS}/leaderboard/percentile-rankings?type=batter&year=${year}&csv=true`;
  const text = await bsFetch(url);
  const { rows } = parseCSV(text);
  return rows.find((r) => String(r.player_id) === String(mlbId)) || null;
}

// Batted ball profile — current year
async function fetchBattedBall(mlbId, year) {
  const url = `${BS}/leaderboard/batted-ball?type=batter&year=${year}&min=1&csv=true`;
  const text = await bsFetch(url);
  const { rows } = parseCSV(text);
  return rows.find((r) => String(r.id) === String(mlbId)) || null;
}

// Sprint speed leaderboard — current year (omit position param = all positions)
async function fetchSprintSpeed(mlbId, year) {
  const url = `${BS}/sprint_speed_leaderboard?year=${year}&team=&min=0&csv=1`;
  const text = await bsFetch(url);
  if (!text || text.trimStart().startsWith('<')) return null;
  const { rows } = parseCSV(text);
  return rows.find((r) => String(r.player_id).trim() === String(mlbId).trim()) || null;
}

// Chase% (out-of-zone swing%) raw value — custom leaderboard
async function fetchChasePct(mlbId, year) {
  const url = `${BS}/leaderboard/custom?year=${year}&type=batter&filter=&selections=oz_swing_percent&min=1&csv=true`;
  const text = await bsFetch(url);
  if (!text || text.trimStart().startsWith('<')) return null;
  const { rows } = parseCSV(text);
  return rows.find((r) => String(r.player_id).trim() === String(mlbId).trim()) || null;
}

// Statcast leaderboard — for max_hit_speed per year
async function fetchStatcastLeaderboard(mlbId, years) {
  const results = await Promise.allSettled(
    years.map((y) =>
      bsFetch(`${BS}/leaderboard/statcast?year=${y}&position=batter&team=&min=1&csv=true`)
        .then((text) => {
          const { rows } = parseCSV(text);
          const row = rows.find((r) => String(r.player_id) === String(mlbId));
          return row ? { year: y, max_hit_speed: row.max_hit_speed } : null;
        })
    )
  );
  const map = {};
  results.forEach((r) => {
    if (r.status === 'fulfilled' && r.value) {
      map[r.value.year] = r.value.max_hit_speed;
    }
  });
  return map; // { 2024: "111.6", 2025: "118.0", 2026: "116.3" }
}

// Resolve MLB player ID from name
async function resolveMlbId(firstName, lastName) {
  const name = `${firstName} ${lastName}`;
  const res = await fetch(
    `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}&sportIds=1`
  );
  const data = await res.json();
  const people = data.people || [];
  const exact = people.find((p) => p.fullName?.toLowerCase() === name.toLowerCase());
  const match = exact || people[0];
  return match?.id ? String(match.id) : null;
}

/* ── Percentile circle config ────────────────────────────────────────── */
// statCol: column name in statcast_search CSV for raw value
// pctCol:  column name in percentile-rankings CSV for percentile (0-100)
// invert:  true when lower stat value = better (K%, whiff%)
const PCT_STATS = [
  { pctCol: 'exit_velocity', statCol: 'launch_speed',           label: 'Exit Velocity', unit: ' mph', fmt: 'num1' },
  { pctCol: 'max_ev',        statCol: 'max_hit_speed',          label: 'Max EV',        unit: ' mph', fmt: 'num1' },
  { pctCol: 'brl_percent',   statCol: 'barrels_per_bbe_percent',label: 'Barrel%',       unit: '%',   fmt: 'num1' },
  { pctCol: 'hard_hit_percent', statCol: 'hardhit_percent',     label: 'Hard Hit%',     unit: '%',   fmt: 'num1' },
  { pctCol: 'xba',           statCol: 'xba',                    label: 'xBA',           unit: '',    fmt: 'avg' },
  { pctCol: 'xslg',          statCol: 'xslg',                   label: 'xSLG',          unit: '',    fmt: 'avg' },
  { pctCol: 'xwoba',         statCol: 'xwoba',                  label: 'xwOBA',         unit: '',    fmt: 'avg' },
  { pctCol: 'k_percent',     statCol: 'k_percent',              label: 'K%',            unit: '%',   fmt: 'num1' },
  { pctCol: 'bb_percent',    statCol: 'bb_percent',             label: 'BB%',           unit: '%',   fmt: 'num1' },
  { pctCol: 'whiff_percent', statCol: 'swing_miss_percent',     label: 'Whiff%',        unit: '%',   fmt: 'num1' },
  { pctCol: 'chase_percent', statCol: '_chase_pct',             label: 'Chase%',        unit: '%',   fmt: 'num1' },
  { pctCol: 'sprint_speed',  statCol: '_sprint_speed',          label: 'Sprint Speed',  unit: ' ft/s', fmt: 'num1' },
];

function pctColor(pct) {
  if (pct >= 90) return '#e05c1a';
  if (pct >= 60) return '#5299d3';
  if (pct >= 40) return '#888';
  if (pct >= 20) return '#3a6fa8';
  return '#1c3f6e';
}

function fmtVal(val, fmt) {
  if (val == null || val === '' || val === undefined) return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return String(val);
  if (fmt === 'avg') return n < 1 ? n.toFixed(3).replace(/^0\./, '.') : n.toFixed(3);
  if (fmt === 'pct') return n.toFixed(1) + '%';
  if (fmt === 'num1') return Number.isInteger(n) ? String(n) : n.toFixed(1);
  if (fmt === 'int') return String(Math.round(n));
  return String(n);
}

/* ── Percentile Circle ───────────────────────────────────────────────── */
function PctCircle({ label, rawVal, pct, fmt, unit, invert }) {
  const displayPct = typeof pct === 'number' ? (invert ? 100 - pct : pct) : null;
  const color = displayPct != null ? pctColor(displayPct) : '#555';
  const r = 30;
  const circ = 2 * Math.PI * r;
  const dashOffset = displayPct != null ? circ * (1 - displayPct / 100) : circ;

  const valStr = rawVal != null && rawVal !== '' && !isNaN(parseFloat(rawVal))
    ? fmtVal(rawVal, fmt) + (unit || '')
    : '—';

  return (
    <div className="sc-pct-cell">
      <svg width="76" height="76" viewBox="0 0 76 76" className="sc-pct-svg">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
        {displayPct != null && (
          <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={circ} strokeDashoffset={dashOffset}
            strokeLinecap="round" transform="rotate(-90 38 38)" />
        )}
        <text x="38" y="38" textAnchor="middle" dominantBaseline="central"
          fill="#fff" fontSize="13" fontWeight="800">
          {displayPct != null ? displayPct : '—'}
        </text>
      </svg>
      <div className="sc-pct-val">{valStr}</div>
      <div className="sc-pct-label">{label}</div>
    </div>
  );
}

/* ── Stat Table ──────────────────────────────────────────────────────── */
function StatTable({ title, subtitle, cols, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="sc-section">
      <div className="sc-section-title">
        {title}
        {subtitle && <span className="sc-section-sub"> — {subtitle}</span>}
      </div>
      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={`sc-th ${c.hl ? 'sc-th-hl' : ''} ${c.left ? 'sc-th-left' : ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="sc-tr">
                {cols.map((c) => (
                  <td key={c.key} className={`sc-td ${c.hl ? 'sc-td-hl' : ''} ${c.left ? 'sc-td-left' : ''}`}>
                    {fmtVal(row[c.key], c.fmt)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────── */
export default function StatcastPage() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const [bio, setBio]           = useState(null);
  const [mlbId, setMlbId]       = useState(null);
  const [percs, setPercs]       = useState(null);   // percentile row
  const [yearRows, setYearRows] = useState([]);     // Statcast stats by year
  const [bbRow, setBbRow]       = useState(null);   // batted ball current year
  const [sprintRow, setSprintRow] = useState(null); // sprint speed current year
  const [chaseRow, setChaseRow]   = useState(null); // chase% current year
  const [maxEvMap, setMaxEvMap]   = useState({});   // { year: max_hit_speed }
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const year = new Date().getFullYear();

  useEffect(() => {
    setLoading(true);
    setError(null);

    getPlayerBio('mlb', playerId).then(async (bioData) => {
      setBio(bioData);
      const athlete = bioData?.athlete || {};

      // 1. Resolve MLB ID (try ESPN links first, then name search)
      let id = null;
      for (const l of athlete.links || []) {
        const href = l.href || l.url || '';
        const m = href.match(/mlb\.com\/player\/[^/]+-(\d+)/) ||
                  href.match(/baseballsavant\.mlb\.com\/savant-player\/[^/]+-(\d+)/);
        if (m) { id = m[1]; break; }
      }
      if (!id) {
        id = await resolveMlbId(athlete.firstName || '', athlete.lastName || '').catch(() => null);
      }

      if (!id) {
        setError('Could not resolve MLB player ID. Statcast data unavailable.');
        setLoading(false);
        return;
      }
      setMlbId(id);

      // 2. Fetch in parallel
      const [percRes, yearRes, bbRes, sprintRes, chaseRes] = await Promise.allSettled([
        fetchPercentiles(id, year),
        fetchStatcastYears(id),
        fetchBattedBall(id, year),
        fetchSprintSpeed(id, year),
        fetchChasePct(id, year),
      ]);

      if (percRes.status   === 'fulfilled') setPercs(percRes.value);
      if (sprintRes.status === 'fulfilled') setSprintRow(sprintRes.value);
      if (chaseRes.status  === 'fulfilled') setChaseRow(chaseRes.value);
      if (bbRes.status     === 'fulfilled') setBbRow(bbRes.value);

      // Year-by-year rows — sort ascending after loading
      let rows = yearRes.status === 'fulfilled' ? (yearRes.value || []) : [];
      rows = [...rows].sort((a, b) => parseInt(a.year) - parseInt(b.year));
      setYearRows(rows);

      // Fetch max EV for each year we have data for
      if (rows.length > 0) {
        const years = rows.map((r) => parseInt(r.year));
        fetchStatcastLeaderboard(id, years).then(setMaxEvMap).catch(() => {});
      }

      const allFailed = [percRes, yearRes, bbRes, sprintRes, chaseRes].every((r) => r.status === 'rejected');
      if (allFailed) setError('Could not load Statcast data from Baseball Savant.');

      setLoading(false);
    }).catch(() => {
      setError('Failed to load player information.');
      setLoading(false);
    });
  }, [playerId]);

  const athlete        = bio?.athlete || {};
  const teamColorRaw   = athlete.team?.color ? `#${athlete.team.color}` : null;
  const teamAltColorRaw = athlete.team?.alternateColor ? `#${athlete.team.alternateColor}` : null;
  // Adapt color so very dark team colors are visible on the dark background
  const teamColor = adaptColorForDarkBg(teamColorRaw, teamAltColorRaw);
  const teamLogo  = athlete.team?.logos?.find((l) => l.rel?.includes('dark'))?.href
                  || athlete.team?.logos?.[0]?.href || athlete.team?.logo;
  const slug      = athlete.displayName?.toLowerCase().replace(/\s+/g, '-') || 'player';
  const savantUrl = mlbId
    ? `https://baseballsavant.mlb.com/savant-player/${slug}-${mlbId}?stats=statcast-r-hitting-mlb`
    : 'https://baseballsavant.mlb.com';

  // Build the most-recent year's raw stat row for circle values
  const currentYearRow = {
    ...(yearRows.find((r) => String(r.year) === String(year)) || yearRows[yearRows.length - 1] || {}),
    max_hit_speed:      maxEvMap[year] ?? null,
    _sprint_speed:      sprintRow?.sprint_speed ?? null,
    _chase_pct:         chaseRow?.oz_swing_percent ?? null,
  };

  // Merge max_hit_speed into year rows
  const enrichedRows = yearRows.map((r) => ({
    ...r,
    max_hit_speed: maxEvMap[parseInt(r.year)] ?? null,
  }));

  // Statcast stats table columns
  const statCols = [
    { key: 'year',                   label: 'Season',    left: true, fmt: 'int' },
    { key: 'pa',                     label: 'PA',        fmt: 'int' },
    { key: 'launch_speed',           label: 'EV',        hl: true,  fmt: 'num1' },
    { key: 'max_hit_speed',          label: 'Max EV',    fmt: 'num1' },
    { key: 'barrels_per_bbe_percent',label: 'Barrel%',   hl: true,  fmt: 'num1' },
    { key: 'barrels_per_pa_percent', label: 'Brl/PA%',   fmt: 'num1' },
    { key: 'hardhit_percent',        label: 'HardHit%',  hl: true,  fmt: 'num1' },
    { key: 'xba',                    label: 'xBA',       hl: true,  fmt: 'avg' },
    { key: 'xslg',                   label: 'xSLG',      hl: true,  fmt: 'avg' },
    { key: 'woba',                   label: 'wOBA',      fmt: 'avg' },
    { key: 'xwoba',                  label: 'xwOBA',     hl: true,  fmt: 'avg' },
    { key: 'k_percent',              label: 'K%',        fmt: 'num1' },
    { key: 'bb_percent',             label: 'BB%',       fmt: 'num1' },
  ];

  // Batted ball table — base on enrichedRows (all years) + current-year directional data
  const bbCols = [
    { key: 'year',           label: 'Season',    left: true, fmt: 'int' },
    { key: 'pitches',        label: 'Pitches',   fmt: 'int' },
    { key: 'bip',            label: 'BIP',       fmt: 'int' },
    { key: 'launch_angle',   label: 'LA',        hl: true,  fmt: 'num1' },
    { key: 'barrels_total',  label: 'Barrels',   fmt: 'int' },
    { key: 'barrels_per_bbe_percent', label: 'Barrel%', hl: true, fmt: 'num1' },
    { key: 'gb_pct',         label: 'GB%',       fmt: 'num1' },
    { key: 'fb_pct',         label: 'FB%',       fmt: 'num1' },
    { key: 'ld_pct',         label: 'LD%',       hl: true,  fmt: 'num1' },
    { key: 'pu_pct',         label: 'PU%',       fmt: 'num1' },
    { key: 'pull_pct',       label: 'Pull%',     fmt: 'num1' },
    { key: 'str_pct',        label: 'Straight%', fmt: 'num1' },
    { key: 'oppo_pct',       label: 'Oppo%',     fmt: 'num1' },
  ];

  const toPC = (v) => v != null && v !== '' ? (parseFloat(v) * 100).toFixed(1) : null;
  const bbRows = enrichedRows.map((r) => {
    const y = parseInt(r.year);
    // Directional breakdown only available for current year from leaderboard/batted-ball
    const bb = y === year && bbRow ? bbRow : null;
    return {
      ...r,
      gb_pct:   bb ? toPC(bb.gb_rate)       : null,
      fb_pct:   bb ? toPC(bb.fb_rate)       : null,
      ld_pct:   bb ? toPC(bb.ld_rate)       : null,
      pu_pct:   bb ? toPC(bb.pu_rate)       : null,
      pull_pct: bb ? toPC(bb.pull_rate)     : null,
      str_pct:  bb ? toPC(bb.straight_rate) : null,
      oppo_pct: bb ? toPC(bb.oppo_rate)     : null,
    };
  });

  const hasData = percs || yearRows.length > 0;

  return (
    <div className="sc-page" style={{ '--accent': teamColor, '--accent2': teamColor }}>
      <button className="tp-back" onClick={() => navigate(-1)}>← Back</button>

      {/* ── Header ───────────────────────────────────────────────────── */}
      {athlete.displayName && (
        <div className="sc-header" style={{ borderTop: `4px solid ${teamColor}` }}>
          <div className="sc-header-top">
            <div className="sc-header-identity">
              {athlete.headshot?.href && (
                <img src={athlete.headshot.href} alt="" className="sc-headshot" />
              )}
              <div>
                <div className="sc-player-name">
                  <span className="sc-firstname">{athlete.firstName} </span>
                  <span className="sc-lastname">{athlete.lastName}</span>
                </div>
                <div className="sc-meta-row">
                  {teamLogo && <img src={teamLogo} alt="" className="sc-team-logo" />}
                  <span className="sc-team-name" style={{ color: teamColor }}>
                    {athlete.team?.displayName}
                  </span>
                  {athlete.position?.abbreviation && (
                    <span className="sc-pos"> · {athlete.position.abbreviation}</span>
                  )}
                  {athlete.displayBatsThrows && (
                    <span className="sc-pos"> · Bats/Throws: {athlete.displayBatsThrows}</span>
                  )}
                </div>
              </div>
            </div>
            <a href={savantUrl} target="_blank" rel="noopener noreferrer" className="sc-savant-link">
              View on Baseball Savant ↗
            </a>
          </div>
          <div className="sc-powered-row">
            <span className="sc-powered-label">
              Statcast data powered by{' '}
              <a href="https://baseballsavant.mlb.com" target="_blank" rel="noopener noreferrer">
                Baseball Savant
              </a>
            </span>
          </div>
        </div>
      )}

      {loading && (
        <div className="sc-loading">
          <div className="auth-spinner" />
          <span>Loading Statcast data…</span>
        </div>
      )}

      {!loading && error && (
        <div className="sc-error-card">
          <div className="sc-error-msg">{error}</div>
          <a href={savantUrl} target="_blank" rel="noopener noreferrer" className="sc-savant-btn">
            View Full Page on Baseball Savant ↗
          </a>
        </div>
      )}

      {!loading && !error && hasData && (
        <>
          {/* ── MLB Percentile Rankings ───────────────────────────────── */}
          {percs && (
            <div className="sc-section">
              <div className="sc-section-title">
                MLB Percentile Rankings
                <span className="sc-section-sub"> — {year} Regular Season</span>
              </div>
              <div className="sc-pct-grid">
                {PCT_STATS.map((stat) => {
                  const pctRaw = percs[stat.pctCol];
                  const pct    = pctRaw != null && pctRaw !== '' ? parseFloat(pctRaw) : null;
                  const rawVal = stat.statCol ? currentYearRow[stat.statCol] : null;
                  // Sprint speed raw value from percentile row itself (not in statcast_search)
                  const displayRaw = stat.pctCol === 'sprint_speed'
                    ? null // Baseball Savant doesn't expose raw sprint speed in the leaderboard
                    : rawVal;
                  return (
                    <PctCircle
                      key={stat.pctCol}
                      label={stat.label}
                      rawVal={displayRaw}
                      pct={isNaN(pct) ? null : pct}
                      fmt={stat.fmt}
                      unit={stat.unit}
                      invert={!!stat.invert}
                    />
                  );
                })}
              </div>
              <div className="sc-pct-legend">
                {[
                  { color: '#e05c1a', label: '≥ 90  Elite' },
                  { color: '#5299d3', label: '60–89  Above Avg' },
                  { color: '#888',    label: '40–59  Average' },
                  { color: '#3a6fa8', label: '20–39  Below Avg' },
                  { color: '#1c3f6e', label: '< 20  Poor' },
                ].map(({ color, label }) => (
                  <div key={label} className="sc-legend-item">
                    <span className="sc-legend-dot" style={{ background: color }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Statcast Batting Stats by Year ────────────────────────── */}
          <StatTable
            title="Statcast Batting Statistics"
            cols={statCols}
            rows={enrichedRows}
          />

          {/* ── Batted Ball Profile ───────────────────────────────────── */}
          <StatTable
            title="Batted Ball Profile"
            subtitle={`${year} Regular Season`}
            cols={bbCols}
            rows={bbRows}
          />

          {/* ── Baseball Savant link ──────────────────────────────────── */}
          <a href={savantUrl} target="_blank" rel="noopener noreferrer"
            className="sc-savant-btn sc-savant-btn-full">
            View Full Interactive Page on Baseball Savant ↗
          </a>
        </>
      )}

      {!loading && !error && !hasData && (
        <div className="sc-error-card">
          <div className="sc-error-msg">
            No Statcast data found for {year}. This player may not have enough plate appearances,
            or the data may not yet be available.
          </div>
          <a href={savantUrl} target="_blank" rel="noopener noreferrer" className="sc-savant-btn">
            View on Baseball Savant ↗
          </a>
        </div>
      )}
    </div>
  );
}

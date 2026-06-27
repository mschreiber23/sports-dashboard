import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStandings, SPORTS, getTeamLogo, getTeamLogoFallback } from '../api/espn';

/* ── View configs ──────────────────────────────────── */
const VIEWS = {
  mlb: [
    { label: 'Division',   level: 3, defaultSort: 'PCT', defaultDir: 'desc' },
    { label: 'League',     level: 2, defaultSort: 'PCT', defaultDir: 'desc' },
    { label: 'Overall',    level: 1, defaultSort: 'PCT', defaultDir: 'desc' },
    { label: 'Wild Card',  level: 2, defaultSort: 'GBP', defaultDir: 'asc', wc: true },
  ],
  nba: [
    { label: 'Division',   level: 3, defaultSort: 'PCT', defaultDir: 'desc' },
    { label: 'Conference', level: 2, defaultSort: 'PCT', defaultDir: 'desc' },
    { label: 'League',     level: 1, defaultSort: 'PCT', defaultDir: 'desc' },
  ],
  nfl: [
    { label: 'Division',   level: 3, defaultSort: 'PCT', defaultDir: 'desc' },
    { label: 'Conference', level: 2, defaultSort: 'PCT', defaultDir: 'desc' },
    { label: 'Overall',    level: 1, defaultSort: 'PCT', defaultDir: 'desc' },
  ],
  nhl: [
    { label: 'Division',   level: 3, defaultSort: 'PTS', defaultDir: 'desc' },
    { label: 'Conference', level: 2, defaultSort: 'PTS', defaultDir: 'desc' },
    { label: 'Overall',    level: 1, defaultSort: 'PTS', defaultDir: 'desc' },
    { label: 'Wild Card',  level: 2, defaultSort: 'PTS', defaultDir: 'desc', wc: true },
  ],
};

/* ── Column configs ─────────────────────────────────── */
const COLS = {
  mlb: [
    { k:'W', label:'W', hl:true }, { k:'L', label:'L', rev:true }, { k:'PCT', label:'PCT', hl:true },
    { k:'GB', label:'GB', rev:true }, { k:'Home', label:'HOME' }, { k:'AWAY', label:'AWAY' },
    { k:'RS', label:'RS' }, { k:'RA', label:'RA', rev:true }, { k:'DIFF', label:'DIFF' },
    { k:'STRK', label:'STRK' }, { k:'Last Ten', label:'L10' },
  ],
  mlb_wc: [
    { k:'W', label:'W', hl:true }, { k:'L', label:'L', rev:true }, { k:'PCT', label:'PCT', hl:true },
    { k:'GBP', label:'WC GB', rev:true }, { k:'Home', label:'HOME' }, { k:'AWAY', label:'AWAY' },
    { k:'RS', label:'RS' }, { k:'RA', label:'RA', rev:true }, { k:'DIFF', label:'DIFF' },
    { k:'STRK', label:'STRK' }, { k:'Last Ten', label:'L10' },
  ],
  nba: [
    { k:'W', label:'W', hl:true }, { k:'L', label:'L', rev:true }, { k:'PCT', label:'PCT', hl:true },
    { k:'GB', label:'GB', rev:true }, { k:'Home', label:'HOME' }, { k:'Road', label:'AWAY' },
    { k:'vs. Div.', label:'DIV' }, { k:'vs. Conf.', label:'CONF' },
    { k:'PPG', label:'PPG' }, { k:'OPP PPG', label:'OPP', rev:true },
    { k:'DIFF', label:'DIFF' }, { k:'L10', label:'L10' }, { k:'STRK', label:'STRK' },
  ],
  nfl: [
    { k:'W', label:'W', hl:true }, { k:'L', label:'L', rev:true }, { k:'T', label:'T' },
    { k:'PCT', label:'PCT', hl:true }, { k:'Home', label:'HOME' }, { k:'Road', label:'AWAY' },
    { k:'vs. Div.', label:'DIV' }, { k:'vs. Conf.', label:'CONF' },
    { k:'PF', label:'PF' }, { k:'PA', label:'PA', rev:true }, { k:'DIFF', label:'DIFF' }, { k:'STRK', label:'STRK' },
  ],
  nhl: [
    { k:'GP', label:'GP', rev:true }, { k:'W', label:'W', hl:true }, { k:'L', label:'L', rev:true },
    { k:'OTL', label:'OTL', rev:true }, { k:'PTS', label:'PTS', hl:true }, { k:'ROW', label:'ROW' },
    { k:'HOME', label:'HOME' }, { k:'AWAY', label:'AWAY' },
    { k:'GF', label:'GF' }, { k:'GA', label:'GA', rev:true }, { k:'DIFF', label:'DIFF' },
    { k:'L10', label:'L10' }, { k:'STRK', label:'STRK' },
  ],
};

/* ── Sort helpers ───────────────────────────────────── */
function parseStatValue(v) {
  if (v == null || v === '—' || v === '-') return null;
  // PCT like .603
  const pct = parseFloat(v);
  if (!isNaN(pct)) return pct;
  // Record like "22-15" → use wins
  const rec = v.match(/^(\d+)-(\d+)/);
  if (rec) return parseInt(rec[1]) - parseInt(rec[2]);
  // Streak like "W3" or "L2"
  const strk = v.match(/^([WL])(\d+)/);
  if (strk) return strk[1] === 'W' ? parseInt(strk[2]) : -parseInt(strk[2]);
  return null;
}

function sortEntries(entries, sortKey, sortDir) {
  if (!sortKey) return entries;
  return [...entries].sort((a, b) => {
    const sa = getStatMap(a)[sortKey];
    const sb = getStatMap(b)[sortKey];
    const va = parseStatValue(sa);
    const vb = parseStatValue(sb);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return sortDir === 'desc' ? vb - va : va - vb;
  });
}

function getStatMap(entry) {
  const r = {};
  (entry.stats || []).forEach((s) => {
    const key = s.abbreviation || s.name;
    if (key) r[key] = s.displayValue;
    if (s.name) r[s.name] = s.displayValue;
  });
  return r;
}

/* ── Sortable Table ─────────────────────────────────── */
function StandingsTable({ entries, cols, sortKey, sortDir, onSort, sport }) {
  const sorted = sortEntries(entries, sortKey, sortDir);
  return (
    <div className="standings-table-wrap">
      <table className="standings-table">
        <thead>
          <tr>
            <th className="standings-th standings-th-team">TEAM</th>
            {cols.map((c) => {
              const isActive = sortKey === c.k;
              return (
                <th
                  key={c.k}
                  className={`standings-th standings-th-sortable ${c.hl ? 'standings-th-hl' : ''} ${isActive ? 'standings-th-sorted' : ''}`}
                  onClick={() => onSort(c.k, c.rev)}
                >
                  {c.label}
                  <span className="standings-sort-icon">
                    {isActive ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ' ↕'}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, i) => {
            const team = entry.team || {};
            const stats = getStatMap(entry);
            const logo = team.logos?.[0]?.href;
            const strk = stats['STRK'] || '';
            const isWStrk = strk.startsWith('W');
            const clinch = stats['CLINCH'];
            return (
              <tr key={team.id || i} className="standings-tr">
                <td className="standings-td standings-td-team">
                  <Link to={`/team/${sport}/${team.id}`} className="standings-team-link">
                    <img src={getTeamLogo({logo})} onError={(e)=>{if(e.target.src!==logo){e.target.onerror=null;e.target.src=logo;}}} alt="" className="standings-logo" />
                    <div className="standings-team-info">
                      <span className="standings-abbr">{team.abbreviation}</span>
                      {clinch && clinch !== '-' && <span className="standings-clinch">{clinch}</span>}
                    </div>
                  </Link>
                </td>
                {cols.map((c) => {
                  const val = stats[c.k] ?? '—';
                  const isStrk = c.k === 'STRK';
                  const isActive = sortKey === c.k;
                  return (
                    <td key={c.k} className={`standings-td ${c.hl ? 'standings-td-hl' : ''} ${isActive ? 'standings-td-sorted' : ''} ${isStrk && isWStrk ? 'standings-strk-w' : isStrk ? 'standings-strk-l' : ''}`}>
                      {val}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Group renderer ─────────────────────────────────── */
function StandingsGroup({ group, cols, sortKey, sortDir, onSort, wcSpots = 0, sport }) {
  const sorted = sortEntries(group.entries, sortKey, sortDir);
  return (
    <div className="standings-group">
      <div className="standings-group-header">{group.name}</div>
      <div className="standings-table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th className="standings-th standings-th-team">TEAM</th>
              {cols.map((c) => {
                const isActive = sortKey === c.k;
                return (
                  <th key={c.k} className={`standings-th standings-th-sortable ${c.hl ? 'standings-th-hl' : ''} ${isActive ? 'standings-th-sorted' : ''}`} onClick={() => onSort(c.k, c.rev)}>
                    {c.label}<span className="standings-sort-icon">{isActive ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ' ↕'}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, i) => {
              const team = entry.team || {};
              const stats = getStatMap(entry);
              const logo = team.logos?.[0]?.href;
              const strk = stats['STRK'] || '';
              const isWStrk = strk.startsWith('W');
              const clinch = stats['CLINCH'];
              const isWcCutoff = wcSpots > 0 && i === wcSpots - 1;
              const isOut = wcSpots > 0 && i >= wcSpots;
              return (
                <>
                  <tr key={team.id || i} className={`standings-tr ${isOut ? 'standings-tr-out' : ''}`}>
                    <td className="standings-td standings-td-team">
                      <Link to={`/team/${sport}/${team.id}`} className="standings-team-link">
                        <img src={getTeamLogo({logo})} onError={(e)=>{if(e.target.src!==logo){e.target.onerror=null;e.target.src=logo;}}} alt="" className="standings-logo" />
                        <div className="standings-team-info">
                          <span className="standings-abbr">{team.abbreviation}</span>
                          {clinch && clinch !== '-' && <span className="standings-clinch">{clinch}</span>}
                          {wcSpots > 0 && i < wcSpots && <span className="standings-wc-badge">WC</span>}
                        </div>
                      </Link>
                    </td>
                    {cols.map((c) => {
                      const val = stats[c.k] ?? '—';
                      const isStrk = c.k === 'STRK';
                      const isActive = sortKey === c.k;
                      return (
                        <td key={c.k} className={`standings-td ${c.hl ? 'standings-td-hl' : ''} ${isActive ? 'standings-td-sorted' : ''} ${isStrk && isWStrk ? 'standings-strk-w' : isStrk ? 'standings-strk-l' : ''}`}>
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                  {isWcCutoff && <tr key={`sep-${i}`} className="standings-wc-separator"><td colSpan={cols.length + 1} /></tr>}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Wild Card view builders ────────────────────────── */
function buildMlbWildCard(data, cols, sortKey, sortDir, onSort) {
  // level=3 data needed to find division leaders
  return null; // handled separately with two fetches
}

/* Format GBP: positive = "+X", zero/null = "—", negative = "-X" */
function formatGBP(val) {
  if (val == null || val === '—' || val === '-') return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (n === 0) return '—';
  return n > 0 ? `+${val}` : `${val}`;
}

function WildCardTable({ entries, cols, divLeaderIds, wcSpots, sortKey, sortDir, onSort }) {
  // Exclude division leaders entirely from WC view
  const wcTeams = entries.filter((e) => !divLeaderIds?.has(e.team?.id));

  // Sort by GBP descending (highest = safest in WC)
  const sorted = [...wcTeams].sort((a, b) => {
    const sa = getStatMap(a); const sb = getStatMap(b);
    const va = parseFloat(sa['GBP'] ?? sa['PTS'] ?? -999);
    const vb = parseFloat(sb['GBP'] ?? sb['PTS'] ?? -999);
    return vb - va;
  });

  // Calculate bubble GBP (3rd WC spot = cutline)
  const bubbleGBP = sorted.length >= wcSpots
    ? parseFloat(getStatMap(sorted[wcSpots - 1])['GBP'] ?? -999)
    : -999;

  // Mark WC positions and compute WC GB relative to bubble
  const markedRows = sorted.map((entry, i) => {
    const isWC = i < wcSpots;
    const isLast = i === wcSpots - 1;
    const teamGBP = parseFloat(getStatMap(entry)['GBP'] ?? -999);
    const wcGBdiff = bubbleGBP !== -999 && teamGBP !== -999 ? teamGBP - bubbleGBP : null;
    let wcGBDisplay = '—';
    if (wcGBdiff !== null) {
      if (Math.abs(wcGBdiff) < 0.05) wcGBDisplay = '—';
      else if (wcGBdiff > 0) wcGBDisplay = `+${wcGBdiff % 1 === 0 ? wcGBdiff.toFixed(0) : wcGBdiff.toFixed(1)}`;
      else wcGBDisplay = `${wcGBdiff % 1 === 0 ? wcGBdiff.toFixed(0) : wcGBdiff.toFixed(1)}`;
    }
    return { entry, isWC, isLast, wcGBDisplay };
  });

  return (
    <div className="standings-table-wrap">
      <table className="standings-table">
        <thead>
          <tr>
            <th className="standings-th standings-th-team">TEAM</th>
            {cols.map((c) => (
              <th key={c.k} className={`standings-th standings-th-sortable ${c.hl ? 'standings-th-hl' : ''} ${sortKey === c.k ? 'standings-th-sorted' : ''}`}
                onClick={() => onSort(c.k, c.rev)}>
                {c.label}<span className="standings-sort-icon">{sortKey === c.k ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ' ↕'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {markedRows.map(({ entry, isWC, isLast, wcGBDisplay }, i) => {
            const team = entry.team || {};
            const stats = getStatMap(entry);
            const logo = team.logos?.[0]?.href;
            const strk = stats['STRK'] || '';
            const isWStrk = strk.startsWith('W');
            const clinch = stats['CLINCH'];
            const isOut = !isWC;
            return (
              <>
                <tr key={team.id || i} className={`standings-tr ${isOut ? 'standings-tr-out' : ''}`}>
                  <td className="standings-td standings-td-team">
                    <img src={getTeamLogo({logo})} onError={(e)=>{if(e.target.src!==logo){e.target.onerror=null;e.target.src=logo;}}} alt="" className="standings-logo" />
                    <div className="standings-team-info">
                      <span className="standings-abbr">{team.abbreviation}</span>
                      {clinch && clinch !== '-' && <span className="standings-clinch">{clinch}</span>}
                      {isWC && <span className="standings-wc-badge">WC</span>}
                    </div>
                  </td>
                  {cols.map((c) => {
                    // Replace GBP column with computed WC GB
                    let val = c.k === 'GBP' ? wcGBDisplay : (stats[c.k] ?? '—');
                    const isStrk = c.k === 'STRK';
                    const isGBP = c.k === 'GBP';
                    return (
                      <td key={c.k} className={`standings-td ${c.hl ? 'standings-td-hl' : ''} ${isStrk && isWStrk ? 'standings-strk-w' : isStrk ? 'standings-strk-l' : ''} ${isGBP && isWC ? 'standings-wc-in' : ''}`}>
                        {val}
                      </td>
                    );
                  })}
                </tr>
                {isLast && <tr key={`sep-${i}`} className="standings-wc-separator"><td colSpan={cols.length + 1} /></tr>}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WildCardView({ sport, cols, sortKey, sortDir, onSort }) {
  const [divData, setDivData] = useState(null);
  const [leagueData, setLeagueData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      getStandings(sport, 3),
      getStandings(sport, 2),
    ]).then(([div, league]) => {
      setDivData(div.status === 'fulfilled' ? div.value : null);
      setLeagueData(league.status === 'fulfilled' ? league.value : null);
      setLoading(false);
    });
  }, [sport]);

  if (loading) return <div className="tp-loading">Loading…</div>;

  if (sport === 'mlb') {
    if (!leagueData) return <div className="tp-loading">No data.</div>;

    // Identify division leaders (top by PCT in each division)
    const divLeaderIds = new Set();
    const walkDiv = (node) => {
      const entries = node.standings?.entries || [];
      if (entries.length > 0) {
        const top = sortEntries(entries, 'PCT', 'desc')[0];
        if (top) divLeaderIds.add(top.team?.id);
      }
      (node.children || []).forEach(walkDiv);
    };
    if (divData) walkDiv(divData);

    // League groups (AL + NL)
    const groups = [];
    const walkLeague = (node) => {
      const entries = node.standings?.entries || [];
      if (entries.length > 0) groups.push({ name: node.name, entries });
      (node.children || []).forEach(walkLeague);
    };
    walkLeague(leagueData);

    const wcCols = COLS['mlb_wc'] || cols;

    return (
      <div className="standings-groups">
        {groups.map((g, i) => (
          <div key={i} className="standings-group">
            <div className="standings-group-header">{g.name}</div>
            <WildCardTable entries={g.entries} cols={wcCols} divLeaderIds={divLeaderIds} wcSpots={3} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </div>
        ))}
      </div>
    );
  }

  if (sport === 'nhl') {
    if (!divData) return <div className="tp-loading">No data.</div>;

    const confMap = {};
    const walkNHL = (node, conf = '', div = '') => {
      const name = node.name || '';
      if (name.includes('Conference')) conf = name;
      if (name.includes('Division')) div = name;
      const entries = node.standings?.entries || [];
      if (entries.length > 0) {
        if (!confMap[conf]) confMap[conf] = [];
        entries.forEach((e) => confMap[conf].push({ ...e, _div: div }));
      }
      (node.children || []).forEach((c) => walkNHL(c, conf, div));
    };
    walkNHL(divData);

    const nhlCols = cols;

    return (
      <div className="standings-groups">
        {Object.entries(confMap).map(([conf, teams]) => {
          const byDiv = {};
          teams.forEach((t) => {
            if (!byDiv[t._div]) byDiv[t._div] = [];
            byDiv[t._div].push(t);
          });

          const divQualifiers = new Set();
          const divGroups = Object.entries(byDiv).map(([div, dteams]) => {
            const sorted = sortEntries(dteams, 'PTS', 'desc');
            sorted.slice(0, 3).forEach((t) => divQualifiers.add(t.team?.id));
            return { div, top3: sorted.slice(0, 3) };
          });

          const wcPool = sortEntries(teams.filter((t) => !divQualifiers.has(t.team?.id)), 'PTS', 'desc');

          return (
            <div key={conf} className="standings-group">
              <div className="standings-group-header">{conf}</div>
              {divGroups.map(({ div, top3 }) => (
                <div key={div}>
                  <div className="standings-wc-section-label">{div}</div>
                  <StandingsGroup group={{ name: '', entries: top3 }} cols={nhlCols} sortKey={sortKey} sortDir={sortDir} onSort={onSort} sport={sport} />
                </div>
              ))}
              <div className="standings-wc-section-label">Wild Card</div>
              <StandingsGroup group={{ name: '', entries: wcPool }} cols={nhlCols} sortKey={sortKey} sortDir={sortDir} onSort={onSort} wcSpots={2} sport={sport} />
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}

/* ── Sport standings with sort state ────────────────── */
function SportStandings({ sport, view }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState(view.defaultSort);
  const [sortDir, setSortDir] = useState(view.defaultDir || 'desc');

  const cols = view.wc ? (COLS[`${sport}_wc`] || COLS[sport]) : (COLS[sport] || COLS.mlb);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setSortKey(view.defaultSort);
    setSortDir(view.defaultDir || 'desc');
    if (!view.wc) {
      getStandings(sport, view.level).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [sport, view.label]);

  const handleSort = (key, preferAsc = false) => {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir(preferAsc ? 'asc' : 'desc'); }
  };

  if (view.wc) {
    return <WildCardView sport={sport} cols={cols} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />;
  }

  if (loading) return (
    <div className="standings-skeleton">
      {[1,2,3].map((i) => <div key={i} className="skeleton-card" style={{ height: 180 }} />)}
    </div>
  );
  if (!data) return <div className="tp-loading">Standings unavailable.</div>;

  const groups = [];
  const walk = (node) => {
    const entries = node.standings?.entries || [];
    if (entries.length > 0) groups.push({ name: node.name, entries });
    (node.children || []).forEach(walk);
  };
  walk(data);

  if (!groups.length) return <div className="tp-loading">No data.</div>;

  return (
    <div className="standings-groups">
      {groups.map((g, i) => (
        <StandingsGroup key={i} group={g} cols={cols} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} sport={sport} />
      ))}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────── */
export default function StandingsPage() {
  const [activeSport, setActiveSport] = useState('mlb');
  const [activeViewIdx, setActiveViewIdx] = useState(0);

  const views = VIEWS[activeSport] || VIEWS.mlb;
  const activeView = views[activeViewIdx] || views[0];

  const handleSportChange = (sport) => {
    setActiveSport(sport);
    setActiveViewIdx(0);
  };

  return (
    <div className="page-content">
      <h1 className="page-title">Standings</h1>
      <div className="scores-sport-tabs">
        {Object.entries(SPORTS).map(([key, { label }]) => (
          <button key={key} className={`ts-tab ${activeSport === key ? 'ts-tab-active' : ''}`} onClick={() => handleSportChange(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="standings-view-tabs">
        {views.map((v, i) => (
          <button key={v.label} className={`standings-view-tab ${activeViewIdx === i ? 'standings-view-tab-active' : ''}`} onClick={() => setActiveViewIdx(i)}>
            {v.label}
          </button>
        ))}
      </div>
      <SportStandings sport={activeSport} view={activeView} />
    </div>
  );
}

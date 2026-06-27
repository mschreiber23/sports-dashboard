import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStatLeaders, getAthleteInfo, SPORTS } from '../api/espn';

/* ── Category config per sport ─────────────────────── */
const CATEGORIES = {
  mlb: [
    { key: 'homeRuns',    label: 'Home Runs' },
    { key: 'RBIs',        label: 'RBI' },
    { key: 'avg',         label: 'Batting Avg' },
    { key: 'ERA',         label: 'ERA' },
    { key: 'strikeouts',  label: 'Strikeouts' },
  ],
  nfl: [
    { key: 'passingYards',       label: 'Pass Yards' },
    { key: 'passingTouchdowns',  label: 'Pass TDs' },
    { key: 'rushingYards',       label: 'Rush Yards' },
    { key: 'rushingTouchdowns',  label: 'Rush TDs' },
    { key: 'receivingYards',     label: 'Rec Yards' },
    { key: 'receivingTouchdowns',label: 'Rec TDs' },
  ],
  nba: [
    { key: 'pointsPerGame',   label: 'Points Per Game' },
    { key: 'assistsPerGame',  label: 'Assists Per Game' },
    { key: 'reboundsPerGame', label: 'Rebounds Per Game' },
    { key: 'stealsPerGame',   label: 'Steals Per Game' },
    { key: 'blocksPerGame',   label: 'Blocks Per Game' },
  ],
  nhl: [
    { key: 'points',          label: 'Points' },
    { key: 'goals',           label: 'Goals' },
    { key: 'assists',         label: 'Assists' },
    { key: 'avgGoalsAgainst', label: 'GAA' },
    { key: 'savePct',         label: 'Save %' },
  ],
};

/* ── Helpers ───────────────────────────────────────── */
function extractAthleteId(ref) {
  const m = (ref || '').match(/\/athletes\/(\d+)/);
  return m ? m[1] : null;
}

function formatValue(value, key) {
  if (value == null) return '—';
  if (key === 'avg' || key === 'savePct' || key === 'ERA' || key === 'avgGoalsAgainst') {
    return typeof value === 'number' ? value.toFixed(3).replace(/^0\./, '.') : value;
  }
  if (key === 'pointsPerGame' || key === 'assistsPerGame' || key === 'reboundsPerGame' || key === 'stealsPerGame' || key === 'blocksPerGame') {
    return typeof value === 'number' ? value.toFixed(1) : value;
  }
  return typeof value === 'number' ? Math.round(value) : value;
}

/* ── Leader Row ────────────────────────────────────── */
function LeaderRow({ rank, leader, catKey, sport }) {
  const navigate = useNavigate();
  const canClick = !!leader.athleteId;

  return (
    <div
      className={`sl-row ${canClick ? 'sl-row-clickable' : ''}`}
      onClick={() => canClick && navigate(`/player/${sport}/${leader.athleteId}`)}
    >
      <span className="sl-rank">{rank}</span>
      <div className="sl-player">
        {leader.headshot && (
          <img src={leader.headshot} alt="" className="sl-avatar"
            onError={(e) => { e.target.style.display = 'none'; }} />
        )}
        <div className="sl-player-info">
          <span className="sl-name">{leader.name || '—'}</span>
          <span className="sl-team">{leader.team}</span>
        </div>
      </div>
      <span className="sl-value">{formatValue(leader.value, catKey)}</span>
    </div>
  );
}

/* ── Category List ─────────────────────────────────── */
function CategoryList({ leaders, catKey, sport, loading }) {
  if (loading) return (
    <div className="sl-list">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="sl-skeleton" />
      ))}
    </div>
  );

  return (
    <div className="sl-list">
      {leaders.map((l, i) => (
        <LeaderRow key={l.athleteId || i} rank={i + 1} leader={l} catKey={catKey} sport={sport} />
      ))}
    </div>
  );
}

/* ── Main Component ────────────────────────────────── */
export default function StatLeaders({ embedded = false }) {
  const [activeSport, setActiveSport] = useState('mlb');
  const [activeCategory, setActiveCategory] = useState(CATEGORIES['mlb'][0].key);
  const [expanded, setExpanded] = useState(embedded);

  // Per-sport cache: { [sport]: { [catKey]: leaders[] } }
  const [leaderCache, setLeaderCache] = useState({});
  const [loadingSport, setLoadingSport] = useState(false);
  const athleteCache = useRef({});

  const categories = CATEGORIES[activeSport] || [];

  // Reset category when sport changes
  useEffect(() => {
    const cats = CATEGORIES[activeSport] || [];
    if (cats.length) setActiveCategory(cats[0].key);
  }, [activeSport]);

  // Load leaders when sport changes (only if expanded)
  useEffect(() => {
    if (!expanded) return;
    if (leaderCache[activeSport]) return; // already loaded

    setLoadingSport(true);
    const wantedCats = (CATEGORIES[activeSport] || []).map((c) => c.key);

    getStatLeaders(activeSport)
      .then(async (data) => {
        const rawCats = data.categories || [];

        // Build a map of category → top 10 leaders (with athleteId + value)
        const catMap = {};
        const allAthleteIds = new Set();

        for (const cat of rawCats) {
          if (!wantedCats.includes(cat.name)) continue;
          const top10 = (cat.leaders || []).slice(0, 30).map((l) => {
            const athleteId = extractAthleteId(l.athlete?.$ref);
            if (athleteId) allAthleteIds.add(athleteId);
            return { athleteId, value: l.value };
          });
          catMap[cat.name] = top10;
        }

        // Batch-fetch athlete info for unique IDs not yet cached
        const toFetch = [...allAthleteIds].filter((id) => !athleteCache.current[id]);
        await Promise.allSettled(
          toFetch.map((id) =>
            getAthleteInfo(activeSport, id)
              .then((info) => { athleteCache.current[id] = info; })
              .catch(() => { athleteCache.current[id] = { id, displayName: '—', shortName: '—', team: '', headshot: '' }; })
          )
        );

        // Enrich leaders with athlete info
        const enriched = {};
        for (const [catKey, leaders] of Object.entries(catMap)) {
          enriched[catKey] = leaders.map((l) => {
            const info = athleteCache.current[l.athleteId] || {};
            return {
              athleteId: l.athleteId,
              value: l.value,
              name: info.shortName || info.displayName || '—',
              team: info.team || '',
              headshot: info.headshot || '',
              position: info.position || '',
            };
          });
        }

        setLeaderCache((prev) => ({ ...prev, [activeSport]: enriched }));
      })
      .catch(() => setLeaderCache((prev) => ({ ...prev, [activeSport]: {} })))
      .finally(() => setLoadingSport(false));
  }, [activeSport, expanded]);

  const sportData = leaderCache[activeSport];
  const currentLeaders = sportData?.[activeCategory] || [];
  const isLoading = loadingSport && !sportData;

  const inner = (
    <>
      <div className="ts-tabs">
        {Object.entries(SPORTS).map(([key, { label }]) => (
          <button key={key} className={`ts-tab ${activeSport === key ? 'ts-tab-active' : ''}`} onClick={() => setActiveSport(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="sl-cat-tabs">
        {categories.map((cat) => (
          <button key={cat.key} className={`sl-cat-tab ${activeCategory === cat.key ? 'sl-cat-tab-active' : ''}`} onClick={() => setActiveCategory(cat.key)}>
            {cat.label}
          </button>
        ))}
      </div>
      <CategoryList leaders={currentLeaders} catKey={activeCategory} sport={activeSport} loading={isLoading} />
    </>
  );

  if (embedded) return <div className="section">{inner}</div>;

  return (
    <section className="section">
      <button className="ts-header" onClick={() => setExpanded((v) => !v)}>
        <div className="ts-header-left">
          <h2 className="section-title" style={{ margin: 0 }}>Stat Leaders</h2>
        </div>
        <span className="ts-chevron">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && inner}
    </section>
  );
}

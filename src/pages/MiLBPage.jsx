import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMiLBSchedule, normalizeMiLBGame, MILB_LEVELS } from '../api/milb';
import { MiLBGameCard } from '../components/TeamRow';

function toDateStr(d) {
  return d.getFullYear().toString()
    + String(d.getMonth() + 1).padStart(2, '0')
    + String(d.getDate()).padStart(2, '0');
}

function formatDateLabel(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const todayMidnight = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const STATE_ORDER = { in: 0, post: 1, pre: 2 };

export default function MiLBPage() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(todayMidnight);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLevel, setActiveLevel] = useState('all');
  const pollRef = useRef(null);

  const isToday = toDateStr(selectedDate) === toDateStr(todayMidnight());
  const shiftDate = (n) => setSelectedDate(d => {
    const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd;
  });

  useEffect(() => {
    clearInterval(pollRef.current);
    setLoading(true);
    setGames([]);
    const isoDate = selectedDate.toISOString().slice(0, 10);

    const load = () => fetchMiLBSchedule(isoDate)
      .then(raw => setGames(raw.map(normalizeMiLBGame)))
      .catch(() => setGames([]))
      .finally(() => setLoading(false));

    load();
    if (isToday) pollRef.current = setInterval(load, 30000);
    return () => clearInterval(pollRef.current);
  }, [selectedDate]);

  // Group by sport level
  const levelIds = Object.keys(MILB_LEVELS).map(Number);
  const byLevel = {};
  for (const id of levelIds) byLevel[id] = [];
  for (const g of games) {
    const sid = g._sportId;
    if (byLevel[sid]) byLevel[sid].push(g);
  }
  // Sort each level: live first, then final, then pre
  for (const id of levelIds) {
    byLevel[id].sort((a, b) => {
      const sa = a.competitions?.[0]?.status?.type?.state || 'pre';
      const sb = b.competitions?.[0]?.status?.type?.state || 'pre';
      return (STATE_ORDER[sa] ?? 2) - (STATE_ORDER[sb] ?? 2);
    });
  }

  const levels = activeLevel === 'all'
    ? levelIds.filter(id => byLevel[id].length > 0)
    : [Number(activeLevel)];

  return (
    <div className="page-content">
      {/* Header */}
      <div className="scores-page-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          <span className="milb-page-title-badge">MiLB</span>
          Minor League Baseball
        </h1>
        <div className="sp-date-nav">
          <button className="sp-date-btn" onClick={() => shiftDate(-1)}>‹</button>
          <label className="sp-date-label">
            {formatDateLabel(selectedDate)}
            <input
              type="date"
              className="sp-date-input"
              value={selectedDate.toISOString().slice(0, 10)}
              onChange={e => setSelectedDate(new Date(e.target.value + 'T12:00:00'))}
            />
          </label>
          <button className="sp-date-btn" onClick={() => shiftDate(1)}>›</button>
          {!isToday && (
            <button className="sp-date-today" onClick={() => setSelectedDate(todayMidnight())}>↩</button>
          )}
        </div>
      </div>

      {/* Level filter tabs */}
      <div className="scores-sport-tabs" style={{ marginBottom: 4 }}>
        <button
          className={`ts-tab ${activeLevel === 'all' ? 'ts-tab-active' : ''}`}
          onClick={() => setActiveLevel('all')}>
          All
        </button>
        {levelIds.map(id => (
          <button
            key={id}
            className={`ts-tab ${activeLevel === String(id) ? 'ts-tab-active' : ''}`}
            onClick={() => setActiveLevel(String(id))}>
            {MILB_LEVELS[id]}
          </button>
        ))}
      </div>

      {loading && (
        <div className="teams-grid" style={{ marginTop: 12 }}>
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="mlbc-card" style={{ height: 90 }} />)}
        </div>
      )}

      {!loading && games.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">⚾</div>
          <p>No MiLB games on {formatDateLabel(selectedDate).toLowerCase()}.</p>
        </div>
      )}

      {!loading && games.length > 0 && levels.map(id => {
        const levelGames = byLevel[id];
        if (!levelGames.length) return null;
        return (
          <div key={id} className="milb-level-section">
            <div className="milb-level-section-header">
              <span className="milb-level-badge">{MILB_LEVELS[id]}</span>
              <span className="milb-level-section-name">
                {id === 11 ? 'Triple-A' : id === 12 ? 'Double-A' : id === 13 ? 'High-A' : 'Single-A'}
              </span>
              <span className="milb-level-section-count">{levelGames.length} game{levelGames.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="teams-grid">
              {levelGames.map(g => (
                <MiLBGameCard key={g.id} game={g} navigate={navigate} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

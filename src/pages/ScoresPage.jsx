import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTeamLogo, getTeamLogoFallback, getScoreboard, SPORTS } from '../api/espn';
import { useFavorites } from '../context/FavoritesContext';

function getScore(c) {
  const s = c?.score;
  if (s == null) return null;
  return typeof s === 'object' ? s.displayValue : String(s);
}

function teamLogo(team) { return team?.logo || team?.logos?.[0]?.href || null; }
function LogoImg({ team, className }) {
  const dark = getTeamLogo(team);
  const orig = getTeamLogoFallback(team);
  if (!dark && !orig) return null;
  return <img src={dark||orig} onError={(e)=>{if(orig&&e.target.src!==orig){e.target.onerror=null;e.target.src=orig;}}} alt="" className={className} />;
}

function ScoreCard({ game, sport, myTeamIds }) {
  const navigate = useNavigate();
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const status = comp?.status;
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';
  const isPre = state === 'pre';
  const shortDetail = status?.type?.shortDetail || '';
  const isMine = myTeamIds.some((id) => competitors.some((c) => c.team?.id === id));

  return (
    <button
      className={`scores-card ${isMine ? 'scores-card-mine' : ''} ${isLive ? 'scores-card-live' : ''}`}
      onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}
    >
      <div className="scores-card-status">
        {isLive && <span className="badge badge-live" style={{fontSize:10}}><span className="live-dot"/>{shortDetail}</span>}
        {isFinal && <span className="badge badge-final" style={{fontSize:10}}>Final</span>}
        {isPre && <span className="scores-time">{shortDetail}</span>}
      </div>
      {[away, home].filter(Boolean).map((c) => (
        <div key={c.team?.id} className={`scores-team-row ${c.winner ? 'scores-winner' : ''}`}>
          <div className="scores-team-left">
            <LogoImg team={c.team} className="scores-team-logo" />
            <div>
              <span className={`scores-team-name ${myTeamIds.includes(c.team?.id) ? 'scores-my-team' : ''}`}>
                {c.team?.abbreviation}
              </span>
              {c.records?.[0]?.summary && <span className="scores-record"> {c.records[0].summary}</span>}
            </div>
          </div>
          {(isLive || isFinal) && <span className="scores-score">{getScore(c) ?? '0'}</span>}
        </div>
      ))}
    </button>
  );
}

export default function ScoresPage() {
  const { favorites, sportOrder } = useFavorites();
  const [scoresBySport, setScoresBySport] = useState({});
  const [activeSport, setActiveSport] = useState(null);
  const [loading, setLoading] = useState(true);

  // Only match teams in the currently viewed sport to avoid cross-sport ID collisions
  const myTeamIds = favorites.teams
    .filter((t) => t.sport === activeSport)
    .map((t) => t.team.id);

  useEffect(() => {
    const d = new Date();
    const todayStr = d.getFullYear().toString()
      + String(d.getMonth() + 1).padStart(2, '0')
      + String(d.getDate()).padStart(2, '0');

    Promise.allSettled(
      Object.keys(SPORTS).map((s) =>
        getScoreboard(s, todayStr).then((games) => ({ sport: s, games }))
      )
    ).then((results) => {
      const data = {};
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value.games.length > 0) {
          data[r.value.sport] = r.value.games;
        }
      });
      setScoresBySport(data);
      const ordered = sportOrder.filter((s) => data[s]);
      const liveFirst = ordered.find((s) =>
        data[s]?.some((g) => g.competitions?.[0]?.status?.type?.state === 'in')
      );
      setActiveSport(liveFirst || ordered[0] || null);
      setLoading(false);
    });
  }, []);

  const availableSports = sportOrder.filter((s) => scoresBySport[s]);

  // Sort: my teams first, then live, then final, then pre
  const games = [...(scoresBySport[activeSport] || [])].sort((a, b) => {
    const stateOrder = { in: 0, post: 1, pre: 2 };
    const aMine = a.competitions?.[0]?.competitors?.some((c) => myTeamIds.includes(c.team?.id)) ? 0 : 1;
    const bMine = b.competitions?.[0]?.competitors?.some((c) => myTeamIds.includes(c.team?.id)) ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    const sa = a.competitions?.[0]?.status?.type?.state || 'pre';
    const sb = b.competitions?.[0]?.status?.type?.state || 'pre';
    return (stateOrder[sa] ?? 2) - (stateOrder[sb] ?? 2);
  });

  return (
    <div className="page-content">
      <h1 className="page-title">Today's Scores</h1>

      {loading && (
        <div className="scores-grid">
          {[1,2,3,4].map((i) => <div key={i} className="skeleton-card" style={{height:100}} />)}
        </div>
      )}

      {!loading && availableSports.length === 0 && (
        <div className="empty-state"><div className="empty-icon">🏟</div><p>No games today.</p></div>
      )}

      {!loading && availableSports.length > 0 && (
        <>
          <div className="scores-sport-tabs">
            {availableSports.map((sport) => {
              const liveCount = scoresBySport[sport]?.filter(
                (g) => g.competitions?.[0]?.status?.type?.state === 'in'
              ).length || 0;
              return (
                <button
                  key={sport}
                  className={`ts-tab ${activeSport === sport ? 'ts-tab-active' : ''}`}
                  onClick={() => setActiveSport(sport)}
                >
                  {SPORTS[sport].label}
                  {liveCount > 0 && <span className="ts-live-dot" />}
                </button>
              );
            })}
          </div>

          <div className="scores-grid">
            {games.map((game) => (
              <ScoreCard
                key={game.id}
                game={game}
                sport={activeSport}
                myTeamIds={myTeamIds}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

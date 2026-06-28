import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScoreboard, SPORTS } from '../api/espn';
import { useFavorites } from '../context/FavoritesContext';
import { MlbPreCard, MlbLiveCard, MlbFinalCard } from '../components/TeamRow';
import { adaptColorForDarkBg } from '../utils/colorUtils';

/* ── Fetch MLB live scores for score overlays (batch, no per-game feed) ── */
async function fetchMlbScoreMap(dateStr, espnGames) {
  try {
    const isoDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    const r = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${isoDate}&hydrate=linescore`);
    const data = await r.json();
    const mlbGames = data.dates?.[0]?.games || [];
    const norm = (s) => (s||'').toLowerCase().replace(/[^a-z]/g,'');
    const map = {};
    for (const eg of espnGames) {
      const comps = eg.competitions?.[0]?.competitors || [];
      const ea = comps.find(c=>c.homeAway==='away')?.team?.displayName;
      const eh = comps.find(c=>c.homeAway==='home')?.team?.displayName;
      const mg = mlbGames.find(g => norm(g.teams?.away?.team?.name)===norm(ea) && norm(g.teams?.home?.team?.name)===norm(eh));
      if (!mg?.linescore) continue;
      const ls = mg.linescore;
      const state = mg.status?.abstractGameState;
      map[eg.id] = {
        linescoreTotals: { away: ls.teams?.away, home: ls.teams?.home },
        inningDisplay: ls.currentInning
          ? `${ls.inningHalf === 'Bottom' ? 'BOT' : 'TOP'} ${ls.currentInning}` : '',
        raw: state === 'Live' ? {} : null, // truthy raw = live for inning display
        count: { balls: 0, strikes: 0, outs: ls.outs ?? 0 },
        onFirst: false, onSecond: false, onThird: false, outs: ls.outs ?? 0,
        matchup: {}, pitcherGameStats: {}, batterGameStats: {}, batSide: 'R',
        inningHalf: ls.inningHalf,
      };
    }
    return map;
  } catch { return {}; }
}

function toDateStr(d) {
  return d.getFullYear().toString()
    + String(d.getMonth()+1).padStart(2,'0')
    + String(d.getDate()).padStart(2,'0');
}

export default function ScoresPage() {
  const navigate = useNavigate();
  const { favorites, sportOrder } = useFavorites();

  const [activeSport, setActiveSport] = useState('mlb');
  const [rawGames, setRawGames] = useState([]);
  const [mlbScoreMap, setMlbScoreMap] = useState({});
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const todayStr = toDateStr(new Date());
  // myTeamIds always reflects current favorites — no stale closure
  const myTeamIds = favorites.teams.filter(t=>t.sport===activeSport).map(t=>t.team.id);

  const stateOrder = { in: 0, post: 1, pre: 2 };
  // Derived sort: instantly re-sorts whenever rawGames OR favorites change
  const games = useMemo(() => [...rawGames].sort((a,b) => {
    const compsA = a.competitions?.[0]?.competitors || [];
    const compsB = b.competitions?.[0]?.competitors || [];
    const aMine = compsA.some(c=>myTeamIds.includes(c.team?.id)) ? 0 : 1;
    const bMine = compsB.some(c=>myTeamIds.includes(c.team?.id)) ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    const sa = a.competitions?.[0]?.status?.type?.state || 'pre';
    const sb = b.competitions?.[0]?.status?.type?.state || 'pre';
    return (stateOrder[sa]??2)-(stateOrder[sb]??2);
  }), [rawGames, favorites.teams, activeSport]);

  useEffect(() => {
    clearInterval(pollRef.current);
    setLoading(true);
    setRawGames([]);

    const load = () => getScoreboard(activeSport, todayStr)
      .then(async (evts) => {
        setRawGames(evts); // sort derived reactively via useMemo
        if (activeSport === 'mlb') {
          const map = await fetchMlbScoreMap(todayStr, evts);
          setMlbScoreMap(map);
        }
      })
      .catch(()=>{});

    load().finally(()=>setLoading(false));
    pollRef.current = setInterval(load, 30000);
    return () => clearInterval(pollRef.current);
  }, [activeSport]);

  const availableSports = ['mlb','nba','nfl','nhl'].filter(s=>
    sportOrder.includes(s) || true
  );

  return (
    <div className="page-content">
      <h1 className="page-title">Scores</h1>

      {/* Sport selector */}
      <div className="scores-sport-tabs">
        {availableSports.map((sport) => (
          <button key={sport}
            className={`ts-tab ${activeSport===sport ? 'ts-tab-active' : ''}`}
            onClick={() => setActiveSport(sport)}>
            {SPORTS[sport]?.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="teams-grid" style={{marginTop:12}}>
          {[1,2,3,4,5,6].map(i=><div key={i} className="mlbc-card" style={{height:120}}/>)}
        </div>
      )}

      {!loading && games.length === 0 && (
        <div className="empty-state"><div className="empty-icon">🏟</div><p>No games today.</p></div>
      )}

      {!loading && games.length > 0 && (
        <div className="teams-grid" style={{marginTop:12}}>
          {games.map((game) => {
            const st = game.competitions?.[0]?.status?.type?.state;
            const competitors = game.competitions?.[0]?.competitors || [];
            // Find favorite team in this game and use their color for gradient
            const favTeam = favorites.teams.find(ft =>
              ft.sport === activeSport && competitors.some(c => c.team?.id === ft.team.id)
            );
            const rawC = favTeam?.team?.color ? `#${favTeam.team.color}` : null;
            const rawA = favTeam?.team?.alternateColor ? `#${favTeam.team.alternateColor}` : null;
            const accentColor = rawC ? adaptColorForDarkBg(rawC, rawA) : null;

            if (activeSport === 'mlb') {
              const mlbFeed = mlbScoreMap[game.id] || null;
              if (st === 'pre')  return <MlbPreCard  key={game.id} game={game} sport="mlb" navigate={navigate} accentColor={accentColor} />;
              if (st === 'post') return <MlbFinalCard key={game.id} game={game} sport="mlb" navigate={navigate} accentColor={accentColor} />;
              return <MlbLiveCard key={game.id} game={game} sport="mlb" navigate={navigate}   accentColor={accentColor} />;
            }
            return <ScoreCardSimple key={game.id} game={game} sport={activeSport} navigate={navigate} myTeamIds={myTeamIds} accentColor={accentColor} />;
          })}
        </div>
      )}
    </div>
  );
}

/* ── Simple card for non-MLB sports ── */
function ScoreCardSimple({ game, sport, navigate, myTeamIds, accentColor }) {
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find(c=>c.homeAway==='away')||competitors[0];
  const home = competitors.find(c=>c.homeAway==='home')||competitors[1];
  const status = comp?.status;
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';
  const shortDetail = status?.type?.shortDetail || '';
  const getScore = (c) => { const s=c?.score; return s==null?null:typeof s==='object'?s.displayValue:String(s); };
  const isMine = myTeamIds.some(id=>competitors.some(c=>c.team?.id===id));

  return (
    <div className={`mlbc-card${isMine ? ' mlbc-card-mine' : ''}`}
      style={{cursor:'pointer', ...(accentColor ? {background:`linear-gradient(135deg,color-mix(in srgb,${accentColor} 15%,var(--bg2)) 0%,var(--bg2) 55%)`} : {})}}
      onClick={()=>navigate(`/boxscore/${sport}/${game.id}`)}>
      <div className="mlbc-teams" style={{paddingTop:10}}>
        <div className="mlbc-rhe-header">
          {isLive
            ? <span className="mlbc-inning-live">{shortDetail}</span>
            : isFinal
            ? <span className="mlbc-final-label">FINAL</span>
            : <span className="mlbc-time">{shortDetail.includes(' - ') ? shortDetail.split(' - ').slice(1).join(' - ') : shortDetail}</span>
          }
          {(isLive||isFinal) && <span style={{width:40,textAlign:'right',fontSize:11,color:'var(--text2)'}}>PTS</span>}
        </div>
        {[away,home].filter(Boolean).map(c=>(
          <div key={c.team?.id} className="mlbc-team-row">
            <img src={c.team?.logos?.[0]?.href||c.team?.logo||''} alt="" className="mlbc-logo" onError={e=>e.target.style.display='none'} />
            <div className="mlbc-team-info">
              <span className="mlbc-name">{c.team?.shortDisplayName||c.team?.displayName}</span>
              <span className="mlbc-rec">{c.records?.[0]?.summary||''}</span>
            </div>
            {(isLive||isFinal) && <span className={`mlbc-stat${c.winner?' mlbc-winner':''}`} style={{width:40}}>{getScore(c)??'—'}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

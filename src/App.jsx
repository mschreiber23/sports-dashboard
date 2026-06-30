import { useState } from 'react';
import { HashRouter, Routes, Route, useLocation, useNavigate, matchPath, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FavoritesProvider, useFavorites } from './context/FavoritesContext';
import { BottomNav, TopNav } from './components/Nav';
import InstallBanner from './components/InstallBanner';
import MyTeams from './components/MyTeams';
import PlayerRoster from './components/PlayerRoster';
import TodaysScores from './components/TodaysScores';
import TeamPage from './pages/TeamPage';
import BoxScorePage from './pages/BoxScorePage';
import PlayerPage from './pages/PlayerPage';
import AuthPage from './pages/AuthPage';
import ScoresPage from './pages/ScoresPage';
import StandingsPage from './pages/StandingsPage';
import LeadersPage from './pages/LeadersPage';
import ProfilePage from './pages/ProfilePage';
import StatcastPage from './pages/StatcastPage';
import DFSPage from './pages/DFSPage';
import RankingsPage from './pages/RankingsPage';
import PlayersPage from './pages/PlayersPage';
import TeamsPage from './pages/TeamsPage';
import NhlDemoPage from './pages/NhlDemoPage';
import PlayerCardsPage from './pages/PlayerCardsPage';
import './index.css';

/* ── Home Dashboard ─────────────────────────────────── */
function Dashboard() {
  const [editMode, setEditMode] = useState(false);
  const { favorites } = useFavorites();
  const { user, signOut } = useAuth();
  const hasContent = favorites.teams.length > 0 || favorites.players.length > 0;

  return (
    <main className="main">
      <MyTeams editMode={editMode} setEditMode={setEditMode} />
      <PlayerRoster editMode={editMode} setEditMode={setEditMode} />
    </main>
  );
}

/* ── App shell with nav ─────────────────────────────── */
function AppShell({ userId }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isSubPage = ['/player/', '/boxscore/', '/team/'].some((p) => pathname.startsWith(p));
  const showBack = pathname !== '/';
  const showStickyTicker = !isSubPage;

  // Ticker visibility — persisted across sessions
  const [tickerVisible, setTickerVisible] = useState(() =>
    localStorage.getItem('tickerVisible') !== 'false'
  );
  const toggleTicker = () => {
    const next = !tickerVisible;
    setTickerVisible(next);
    localStorage.setItem('tickerVisible', String(next));
  };

  return (
    <FavoritesProvider userId={userId}>
      <div className="app">
        <div className="app-sticky-header">
          <TopNav />
          <InstallBanner />
          {showStickyTicker && (
            tickerVisible
              ? <TodaysScores compact onCollapse={toggleTicker} />
              : (
                <div className="ticker-collapsed-bar" onClick={toggleTicker}>
                  <span className="ticker-collapsed-label">Scores</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              )
          )}
        </div>
        {/* Back chevron — fixed top-left, all pages except home */}
        {showBack && (
          <button className="app-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}

        <div className="app-body">
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/scores"    element={<main className="main"><ScoresPage /></main>} />
            <Route path="/standings" element={<main className="main"><StandingsPage /></main>} />
            <Route path="/leaders"   element={<main className="main"><LeadersPage /></main>} />
            <Route path="/me"        element={<main className="main"><ProfilePage /></main>} />
            <Route path="/player/:sport/:playerId"          element={<main className="main"><PlayerPage /></main>} />
            <Route path="/statcast/mlb/:playerId"            element={<main className="main"><StatcastPage /></main>} />
            <Route path="/dfs"                               element={<main className="main"><DFSPage /></main>} />
            <Route path="/demo/nhl"                          element={<main className="main"><NhlDemoPage /></main>} />
            <Route path="/player-cards"                      element={<main className="main"><PlayerCardsPage /></main>} />
            <Route path="/rankings"                          element={<main className="main"><RankingsPage /></main>} />
            <Route path="/players"                           element={<main className="main"><PlayersPage /></main>} />
            <Route path="/teams"                             element={<main className="main"><TeamsPage /></main>} />
            <Route path="/boxscore/:sport/:gameId"           element={<main className="main"><BoxScorePage /></main>} />
            <Route path="/team/:sport/:teamId"               element={<main className="main"><TeamPage /></main>} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </FavoritesProvider>
  );
}

function AppInner() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-spinner" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <HashRouter>
      <AppShell userId={user.id} />
    </HashRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

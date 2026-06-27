import { useState } from 'react';
import { HashRouter, Routes, Route, useLocation, matchPath } from 'react-router-dom';
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
import './index.css';

/* ── Home Dashboard ─────────────────────────────────── */
function Dashboard() {
  const [editMode, setEditMode] = useState(false);
  const { favorites } = useFavorites();
  const { user, signOut } = useAuth();
  const hasContent = favorites.teams.length > 0 || favorites.players.length > 0;

  return (
    <main className="main">
      <TodaysScores />
      <MyTeams editMode={editMode} setEditMode={setEditMode} />
      <PlayerRoster editMode={editMode} setEditMode={setEditMode} />
      {hasContent && (
        <button
          className={`dashboard-edit-btn ${editMode ? 'dashboard-edit-btn-active' : ''}`}
          onClick={() => setEditMode((v) => !v)}
        >
          {editMode ? '✓ Done Editing' : '✎ Edit Dashboard'}
        </button>
      )}
      {/* Account + sign out at the bottom of the dashboard */}
      <div className="dashboard-account">
        {user?.email && <span className="dashboard-account-email">{user.email}</span>}
        <button className="dashboard-signout-btn" onClick={signOut}>Sign Out</button>
      </div>
    </main>
  );
}

/* ── App shell with nav ─────────────────────────────── */
function AppShell({ userId }) {
  const { pathname } = useLocation();
  const isSubPage = ['/player/', '/boxscore/', '/team/'].some((p) => pathname.startsWith(p));
  // Show compact sticky ticker on all pages except home and player/boxscore/team sub-pages
  const showStickyTicker = !isSubPage;

  return (
    <FavoritesProvider userId={userId}>
      <div className="app">
        {/* Nav + ticker wrapped together so they form one seamless sticky block */}
        <div className="app-sticky-header">
          <TopNav />
          <InstallBanner />
          {showStickyTicker && <TodaysScores compact />}
        </div>
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

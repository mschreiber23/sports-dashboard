import { HashRouter as BrowserRouter, Routes, Route } from 'react-router-dom';
import { FavoritesProvider } from './context/FavoritesContext';
import Header from './components/Header';
import MyTeams from './components/MyTeams';
import PlayerRoster from './components/PlayerRoster';
import TeamPage from './pages/TeamPage';
import './index.css';

function Dashboard() {
  return (
    <>
      <Header />
      <main className="main">
        <MyTeams />
        <PlayerRoster />
      </main>
      <footer className="footer">
        <p>Data provided by ESPN · Updates every 30 seconds</p>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <FavoritesProvider>
        <div className="app">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/team/:sport/:teamId" element={
              <>
                <Header />
                <main className="main">
                  <TeamPage />
                </main>
                <footer className="footer">
                  <p>Data provided by ESPN · Updates every 30 seconds</p>
                </footer>
              </>
            } />
          </Routes>
        </div>
      </FavoritesProvider>
    </BrowserRouter>
  );
}

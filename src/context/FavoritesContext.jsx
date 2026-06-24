import { createContext, useContext, useState, useEffect } from 'react';

const FavoritesContext = createContext(null);

const STORAGE_KEY = 'sports_dashboard_favorites_v2';

const DEFAULT_FAVORITES = {
  teams: [
    {
      sport: 'mlb',
      team: {
        id: '20',
        displayName: 'Washington Nationals',
        abbreviation: 'WSH',
        color: 'ab0003',
        alternateColor: '11225b',
        logo: 'https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png',
      },
    },
    {
      sport: 'nba',
      team: {
        id: '27',
        displayName: 'Washington Wizards',
        abbreviation: 'WSH',
        color: 'e31837',
        alternateColor: '002b5c',
        logo: 'https://a.espncdn.com/i/teamlogos/nba/500/wsh.png',
      },
    },
    {
      sport: 'nhl',
      team: {
        id: '23',
        displayName: 'Washington Capitals',
        abbreviation: 'WSH',
        color: 'd71830',
        alternateColor: '00214e',
        logo: 'https://a.espncdn.com/i/teamlogos/nhl/500/wsh.png',
      },
    },
    {
      sport: 'nfl',
      team: {
        id: '21',
        displayName: 'Philadelphia Eagles',
        abbreviation: 'PHI',
        color: '06424d',
        alternateColor: 'acc0c6',
        logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png',
      },
    },
  ],
  players: [
    {
      id: '4918256',
      displayName: 'James Wood',
      position: 'CF',
      headshot: 'https://a.espncdn.com/i/headshots/mlb/players/full/4918256.png',
      sport: 'mlb',
      teamId: '20',
      teamName: 'Washington Nationals',
    },
  ],
};

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_FAVORITES;
    } catch {
      return DEFAULT_FAVORITES;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const addTeam = (sport, team) =>
    setFavorites((f) => {
      if (f.teams.some((t) => t.team.id === team.id && t.sport === sport)) return f;
      return { ...f, teams: [...f.teams, { sport, team }] };
    });

  const removeTeam = (teamId, sport) =>
    setFavorites((f) => ({
      ...f,
      teams: f.teams.filter((t) => !(t.team.id === teamId && t.sport === sport)),
    }));

  const addPlayer = (player) =>
    setFavorites((f) => {
      if (f.players.some((p) => p.id === player.id)) return f;
      return { ...f, players: [...f.players, player] };
    });

  const removePlayer = (playerId) =>
    setFavorites((f) => ({
      ...f,
      players: f.players.filter((p) => p.id !== playerId),
    }));

  return (
    <FavoritesContext.Provider
      value={{ favorites, addTeam, removeTeam, addPlayer, removePlayer }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);

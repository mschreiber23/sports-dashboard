# Sports Dashboard

A live sports dashboard showing real-time scores and player stats powered by the ESPN API (no API key required).

## Features

- **Live Scores** — today's games with live score updates every 30 seconds. In-progress games show a pulsing live indicator.
- **My Team** — pick a favorite team; their games are highlighted at the top.
- **Player Stats** — add your favorite players and track their season stats.
- **Multi-sport** — supports NBA, NFL, MLB, and NHL.
- **Persistent favorites** — your team and players are saved in `localStorage`.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Customizing Defaults

The default team and players are set in `src/context/FavoritesContext.jsx`. Change the `DEFAULT_FAVORITES` object to set your own preferred team and players. Player IDs can be found in ESPN URLs (e.g. `espn.com/nba/player/_/id/1966/lebron-james`).

## Tech Stack

- **React** + **Vite**
- **ESPN unofficial API** — free, no key needed
- **localStorage** for persistence
- No backend required

## Deployment

Works out of the box on [Vercel](https://vercel.com) or [Netlify](https://netlify.com) — just connect your GitHub repo.

```bash
npm run build   # outputs to dist/
```

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── Shribely Logo Icon ──────────────────────────────── */
function ShribelyIcon({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0078d4" />
          <stop offset="100%" stopColor="#0092ff" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Circle background */}
      <circle cx="30" cy="30" r="30" fill="url(#sg)" />
      {/* Lightning bolt — speed + analytics */}
      <path d="M35 10L18 32h13L27 50L44 27H31z" fill="white" filter="url(#glow)" />
    </svg>
  );
}

/* ── Icons ───────────────────────────────────────────── */
function ScoresIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3aabff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="9" y1="21" x2="9" y2="9"/>
    </svg>
  );
}

function StandingsIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3aabff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}

function LeadersIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3aabff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

function MeIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3aabff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function DFSIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3aabff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
      <line x1="7" y1="10" x2="7" y2="13"/>
      <line x1="12" y1="7" x2="12" y2="13"/>
      <line x1="17" y1="9" x2="17" y2="13"/>
    </svg>
  );
}

function PlayersIcon({ active }) {
  // Search / magnifying glass icon
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3aabff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function HomeIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3aabff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/>
      <polyline points="9 21 9 12 15 12 15 21"/>
    </svg>
  );
}

function HamburgerIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3aabff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6"  x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

// Nav order: Home - Standings - Scores - Players - Leaders - More
function CardsIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3aabff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <line x1="2" y1="10" x2="22" y2="10"/>
    </svg>
  );
}

function MiLBIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3aabff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 3 C9 7 9 17 12 21"/>
      <path d="M12 3 C15 7 15 17 12 21"/>
      <path d="M3 12 L21 12"/>
    </svg>
  );
}

const MORE_ITEMS = [
  { path: '/milb',     label: 'MiLB',       Icon: MiLBIcon },
  { path: '/me',       label: 'My Profile', Icon: MeIcon },
  { path: '/leaders',  label: 'Leaders',    Icon: LeadersIcon },
  { path: '/rankings', label: 'Rankings',   Icon: LeadersIcon },
  { path: '/dfs',      label: 'ShribeIQ',   Icon: DFSIcon },
];

const NAV_ITEMS = [
  { path: '/',             label: 'Home',      Icon: HomeIcon },
  { path: '/standings',    label: 'Standings', Icon: StandingsIcon },
  { path: '/scores',       label: 'Scores',    Icon: ScoresIcon },
  { path: '/players',      label: 'Players',   Icon: PlayersIcon },
  { path: '/player-cards', label: 'Cards',     Icon: CardsIcon },
  { path: 'more',          label: 'More',      more: true },
];

/* ── More dropdown ───────────────────────────────────── */
function MoreDropdown({ onClose }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="more-overlay" onClick={onClose} />
      <div className="more-dropdown">
        {MORE_ITEMS.map(({ path, label, Icon }) => (
          <button key={path} className="more-dropdown-item" onClick={() => { navigate(path); onClose(); }}>
            <Icon active={false} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ── Bottom Nav (mobile) ─────────────────────────────── */
export function BottomNav() {
  const { pathname } = useLocation();
  const [showMore, setShowMore] = useState(false);
  const moreActive = MORE_ITEMS.some(i => pathname === i.path);

  return (
    <>
      {showMore && <MoreDropdown onClose={() => setShowMore(false)} />}
      <nav className="bottom-nav">
        {NAV_ITEMS.map((item) => {
          if (item.more) {
            const active = moreActive || showMore;
            return (
              <button key="more" className={`nav-item${active ? ' nav-item-active' : ''}`}
                onClick={() => setShowMore(v => !v)}>
                <HamburgerIcon active={active} />
                <span className="nav-label">More</span>
              </button>
            );
          }
          const { Icon } = item;
          const active = pathname === item.path;
          return (
            <Link key={item.path} to={item.path} className={`nav-item ${active ? 'nav-item-active' : ''}`}>
              <Icon active={active} />
              <span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

/* ── Top Nav (desktop) ───────────────────────────────── */
export function TopNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);
  const moreActive = MORE_ITEMS.some(i => pathname === i.path);

  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <Link to="/" className="top-nav-brand">
          <ShribelyIcon size={28} />
          <span>Shribely</span>
        </Link>
        <div className="top-nav-links">
          {NAV_ITEMS.filter((i) => !i.logo && !i.more && i.Icon).map((item) => {
            const { Icon } = item;
            const active = pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className={`top-nav-link ${active ? 'top-nav-link-active' : ''}`}>
                <Icon active={active} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {/* More button */}
          <div className="top-nav-more-wrap">
            <button
              className={`top-nav-link top-nav-more-btn ${moreActive || showMore ? 'top-nav-link-active' : ''}`}
              onClick={() => setShowMore(v => !v)}>
              <HamburgerIcon active={moreActive || showMore} />
              <span>More</span>
            </button>
            {showMore && (
              <>
                <div className="top-more-overlay" onClick={() => setShowMore(false)} />
                <div className="top-more-dropdown">
                  {MORE_ITEMS.map(({ path, label, Icon }) => (
                    <button key={path} className="top-more-item" onClick={() => { navigate(path); setShowMore(false); }}>
                      <Icon active={pathname === path} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

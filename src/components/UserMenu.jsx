import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const initial = user.email?.[0]?.toUpperCase() || '?';

  return (
    <div className="user-menu-wrap">
      <button className="user-avatar-btn" onClick={() => setOpen((v) => !v)}>
        {initial}
      </button>

      {open && (
        <div className="user-dropdown">
          <div className="user-dropdown-email">{user.email}</div>
          <button
            className="user-signout-btn"
            onClick={() => { setOpen(false); signOut(); }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  return (
    <div className="page-content">
      <h1 className="page-title">Profile</h1>
      <div className="profile-card">
        <div className="profile-avatar">{user?.email?.[0]?.toUpperCase()}</div>
        <div className="profile-email">{user?.email}</div>
        <button className="btn-primary profile-signout" onClick={signOut}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

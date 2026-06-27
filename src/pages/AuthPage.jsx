import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode]       = useState('login'); // 'login' | 'signup'
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]     = useState('');
  const [info, setInfo]       = useState('');
  const [busy, setBusy]       = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (mode === 'signup' && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password);
        setInfo('Account created! Check your email to confirm, then log in.');
        setMode('login');
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🏆</div>
        <h1 className="auth-title">Shribely</h1>
        <p className="auth-sub">Your teams. Your players. Your stats.</p>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'auth-tab-active' : ''}`}
            onClick={() => { setMode('login'); setError(''); setInfo(''); }}
          >
            Log In
          </button>
          <button
            className={`auth-tab ${mode === 'signup' ? 'auth-tab-active' : ''}`}
            onClick={() => { setMode('signup'); setError(''); setInfo(''); }}
          >
            Sign Up
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="search-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input
              className="search-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {mode === 'signup' && (
            <div className="auth-field">
              <label className="auth-label">Confirm Password</label>
              <input
                className="search-input"
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          )}

          {error && <div className="error-banner" style={{ marginTop: 0 }}>{error}</div>}
          {info  && <div className="auth-info">{info}</div>}

          <button className="btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create Account' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../lib/state/authStore';
import './AuthForms.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [screenName, setScreenName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'BETTOR' | 'BOOKIE'>('BETTOR');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showScreennameModal, setShowScreennameModal] = useState(false);
  const [modalScreenname, setModalScreenname] = useState('');
  const [loginToken, setLoginToken] = useState<string | null>(null);
  const [isSignup, setIsSignup] = useState(false);
  const navigate = useNavigate();
  const initAuth = useAuthStore((s) => s.init);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    // initialize auth state on mount
    initAuth();
  }, []);

  useEffect(() => {
    console.log('isSignup state:', isSignup);
  }, [isSignup]);

  const handleLogin = async () => {
    let inaugural = false;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.log('login response:', { data, error });
      if (error) {
        alert('Login error: ' + error.message);
        return;
      }

      // If no session is returned (e.g., email confirmation required), inform the user
      if (!data?.session) {
        alert('Login successful — please verify your email before signing in (check your inbox).');
        return;
      }

      // Extreme debug: log token and uid, then call backend to ensure custom users row exists
      try {
        const token = data?.session?.access_token;
        try {
          console.log('>>> LOGIN SUCCESS, token:', token);
          console.log('>>> LOGIN SUCCESS, uid:', data?.user?.id);
        } catch (e) {}

        try {
          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
          // If Bookmaker selected, validate role in our custom users table first
          if (selectedRole === 'BOOKIE') {
            try {
              const respRole = await fetch(`${apiBase}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
              const txt = await respRole.text();
              let parsed: any = null;
              try {
                parsed = JSON.parse(txt);
              } catch (_) {
                parsed = { user: null };
              }
              const userRow = parsed?.user ?? parsed;
              if (!userRow || userRow.role !== 'BOOKIE') {
                // Immediately sign out the Supabase session to prevent the app
                // from treating the user as authenticated (which can trigger
                // redirects). Keep the user on the login page and show an error.
                try {
                  await supabase.auth.signOut();
                } catch (signErr) {
                  console.warn('Failed to signOut after bookie validation failed', signErr);
                }
                setLoginError('Not authorized as a betGSIS bookmaker');
                return;
              }
            } catch (e) {
              console.warn('Failed to validate Bookmaker role', e);
              setLoginError('Failed to validate account role. Please try again.');
              return;
            }
          }

          console.log('>>> Calling backend /api/auth/create_user with UID:', data?.user?.id, 'Email:', email);
          const resp = await fetch(`${apiBase}/api/auth/create_user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email }),
          });
          let respJson: any = null;
          try {
            respJson = await resp.json();
          } catch (jsonErr) {
            try {
              const txt = await resp.text();
              respJson = { status: resp.status, text: txt };
            } catch (_) {
              respJson = { status: resp.status };
            }
          }
          console.log('>>> Backend /api/auth/create_user response:', respJson);
          console.log('>>> Was inaugural login:', respJson?.was_inaugural_login);
          // If this was the inaugural login, prompt the user for a screen name
          if (respJson && respJson.was_inaugural_login) {
            inaugural = true;
            setLoginToken(token ?? null);
            setShowScreennameModal(true);
          }
        } catch (e) {
          console.warn('create_user call failed in Login.tsx', e);
        }
      } catch (e) {
        // ignore logging errors
      }

      // refresh auth store and redirect
      // Also fetch user id directly from Supabase and store in app state
      try {
        const userRes = await supabase.auth.getUser();
        const supUser = (userRes as any)?.data?.user ?? (userRes as any)?.user;
        if (supUser && supUser.id) {
          setUser({ user_id: supUser.id, email: supUser.email });
        }
      } catch (e) {
        console.warn('supabase.auth.getUser failed', e);
      }

      await initAuth();
      // If this was not inaugural, navigate immediately; otherwise wait for user to submit modal
      if (!inaugural) {
        navigate('/home');
      }
    } catch (e: any) {
      alert('Login failed: ' + e.message);
    }
  };

  const submitModalScreenname = async () => {
    if (!modalScreenname || !loginToken) return;
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const resp = await fetch(`${apiBase}/api/auth/upsert-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginToken}` },
        body: JSON.stringify({ screenname: modalScreenname, screen_name: modalScreenname }),
      });
      try {
        const j = await resp.json();
        console.log('upsert-user response (modal):', j);
      } catch (_) {
        // ignore non-json
      }
  setShowScreennameModal(false);
      // refresh auth store and continue
      try {
        await initAuth();
      } catch (_) {}
  navigate('/home');
    } catch (e) {
      console.error('Failed to set screenname', e);
      alert('Failed to save screen name. Please try again.');
    }
  };

  const handleSignup = async () => {
    try {
      // Persist provided screen name so we can use it at first successful login (after email verification)
      try {
        if (screenName && screenName.trim()) {
          localStorage.setItem('pending_screenname', screenName.trim());
        }
      } catch (e) {
        console.warn('failed to persist pending screenname', e);
      }
      const { data, error } = await supabase.auth.signUp({ email, password });
      console.log('signup response:', { data, error });
      if (error) {
        alert('Sign up error: ' + error.message);
        return;
      }

      // If session is null, Supabase sent a verification email (magic link / confirm)
      if (!data?.session) {
        alert('Signed up — check your email to verify your account before signing in.');
        // Do not attempt to upsert user yet; wait until user completes verification and returns with a session
        setIsSignup(false);
        return;
      }

      // If a session exists (some setups auto-login), upsert user row immediately
      const sessionRes = await supabase.auth.getSession();
      const token = (sessionRes as any)?.data?.session?.access_token;
      if (token) {
        try {
          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
          // If we have a token (auto-logged in), call the upsert route with provided screenname
          await fetch(`${apiBase}/api/auth/upsert-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ screen_name: screenName, screenname: screenName }),
          });
        } catch (e) {
          console.error('upsert user failed', e);
        }
      }

      alert('Signed up and logged in.');
      setIsSignup(false);
    } catch (e: any) {
      alert('Sign up failed: ' + e.message);
    }
  };

  return (
    <div className="auth-page">
      {showScreennameModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: 'var(--card-bg, #07121a)', padding: 20, borderRadius: 8, width: 420, maxWidth: '90%', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', color: '#eaf6ea' }}>
            <h2 style={{ marginTop: 0 }}>Please enter screen name</h2>
            <p style={{ marginTop: 0, color: '#9aa6ad' }}>This will be your public screen name in the app.</p>
            <input autoFocus value={modalScreenname} onChange={(e) => setModalScreenname(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: 16, borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', marginTop: 8, background: 'transparent', color: '#eaf6ea' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => { setShowScreennameModal(false); }} className="auth-button" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#9aa6ad' }}>Cancel</button>
              <button onClick={() => submitModalScreenname()} className="auth-button">Save</button>
            </div>
          </div>
        </div>
      )}
      <div className="auth-card">
        {isSignup ? (
          (() => {
            console.log('Rendering signup form');
            return (
              <>
                <h1 className="auth-title">Create account</h1>

                <label className="auth-label">Screen name</label>
                <input className="auth-input" value={screenName} onChange={(e) => setScreenName(e.target.value)} />

                <label className="auth-label">Email</label>
                <input className="auth-input" value={email} onChange={(e) => setEmail(e.target.value)} />

                <label className="auth-label">Password</label>
                <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

                <button className="auth-button" onClick={() => { console.log('Signup submitted'); handleSignup(); }}>Create account</button>

                <div className="auth-footer">
                  <button type="button" className="auth-link" onClick={() => { console.log('Signin link clicked'); setIsSignup(false); }}>
                    Already have an account? Sign in here
                  </button>
                </div>
              </>
            );
          })()
        ) : (
          (() => {
            console.log('Rendering login form');
            return (
              <>
                    <h1 className="auth-title">Sign in</h1>
                    <div className="role-toggle">
                      <button
                        type="button"
                        onClick={() => setSelectedRole('BETTOR')}
                        className={`role-button ${selectedRole === 'BETTOR' ? 'active' : 'inactive'}`}
                        aria-pressed={selectedRole === 'BETTOR'}
                      >
                        Bettor
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRole('BOOKIE')}
                        className={`role-button ${selectedRole === 'BOOKIE' ? 'active' : 'inactive'}`}
                        aria-pressed={selectedRole === 'BOOKIE'}
                      >
                        Bookmaker
                      </button>
                    </div>

                <label className="auth-label">Email</label>
                <input className="auth-input" value={email} onChange={(e) => setEmail(e.target.value)} />

                <label className="auth-label">Password</label>
                <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

                <button className="auth-button" onClick={() => { console.log('Signin submitted'); handleLogin(); }}>Sign In</button>

                {loginError && (
                  <div style={{ color: '#f88', marginTop: 12, fontWeight: 600 }}>{loginError}</div>
                )}

                <div className="auth-footer">
                  <button type="button" className="auth-link" onClick={() => { console.log('Signup link clicked'); setIsSignup(true); }}>
                    Don't have an account? Sign up here
                  </button>
                </div>
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}


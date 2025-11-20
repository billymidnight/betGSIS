import React, { useState } from 'react';
import supabase from '../lib/supabaseClient';
import { useNavigate, Link } from 'react-router-dom';
import './AuthForms.css';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [screenName, setScreenName] = useState('');
  const navigate = useNavigate();

  const handleSignup = async () => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      console.log('signup response:', { data, error });
      if (error) {
        alert('Sign up error: ' + error.message);
        return;
      }

      // If Supabase returned a user object with id (auto-signed-in or immediate user info), upsert into backend users table.
      const returnedUser = (data as any)?.user || (data as any)?.user;
      if (returnedUser && returnedUser.id) {
        try {
          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
          await fetch(`${apiBase}/api/auth/upsert-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: returnedUser.id, email, password, screen_name: screenName || '' }),
          });
        } catch (e) {
          console.error('upsert user failed', e);
        }
      } else {
        // No immediate user id (email verification in place). Inform the user to verify email.
        alert('Signed up — check your email to verify your account before signing in.');
        navigate('/login');
        return;
      }

  alert('Signed up and logged in.');
  navigate('/home');
    } catch (e: any) {
      alert('Sign up failed: ' + e.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Create account</h1>

        <label className="auth-label">Screen name</label>
        <input className="auth-input" value={screenName} onChange={(e) => setScreenName(e.target.value)} />

        <label className="auth-label">Email</label>
        <input className="auth-input" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="auth-label">Password</label>
        <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

        <button className="auth-button" onClick={handleSignup}>Create account</button>

        <div className="auth-footer">
          <Link to="/login" className="auth-link">Have an account? Sign in</Link>
        </div>
      </div>
    </div>
  );
}

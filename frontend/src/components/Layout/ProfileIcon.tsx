import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/state/authStore';
import supabase from '../../lib/supabaseClient';

export default function ProfileIcon() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={{position: 'relative'}}>
      <button className="profile-button" onClick={() => setOpen((v) => !v)} style={{padding:'6px 10px', borderRadius:20, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.04)', minWidth:48, textAlign:'center'}}>
        <span style={{fontWeight:700, color:'#eaf6ea', fontSize: '0.95rem'}}>{user?.screen_name ? String(user.screen_name).substring(0, 24) : (user?.email ? user.email.split('@')[0] : 'User')}</span>
      </button>
      {open && (
        <div style={{position:'absolute', right:0, marginTop:8, background:'rgba(8,12,18,0.98)', padding:12, borderRadius:10, boxShadow:'0 14px 40px rgba(0,0,0,0.6)', border:'1px solid rgba(255,255,255,0.04)'}}>
          <div style={{fontWeight:700, color:'#eaf6ea', marginBottom:8}}>{user?.screen_name || user?.email || 'User'}</div>
          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            <Link to="/my-bets" onClick={() => setOpen(false)} style={{color:'#9aa6ad'}}>Bet Logger</Link>
            <button onClick={handleLogout} style={{background:'transparent', border:'none', color:'#f88'}}>Logout</button>
          </div>
        </div>
      )}
    </div>
  );
}

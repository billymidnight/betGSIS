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

  const displayName = user?.screen_name ? String(user.screen_name).substring(0, 24) : (user?.email ? user.email.split('@')[0] : 'User');
  const avatarUrl = user?.avatar_url;

  return (
    <div style={{position: 'relative'}}>
      <button className="profile-button" onClick={() => setOpen((v) => !v)} style={{padding:'4px 12px', borderRadius:24, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.04)', minWidth:48, textAlign:'center', display:'flex', alignItems:'center', gap: 10, cursor:'pointer'}}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={{width:38, height:38, borderRadius:'50%', objectFit:'cover', border:'2px solid #334155'}} />
        ) : (
          <span style={{width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#3b82f6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.95rem', fontWeight:700, color:'#fff'}}>{displayName[0].toUpperCase()}</span>
        )}
        <span style={{fontWeight:700, color:'#eaf6ea', fontSize: '1.05rem'}}>{displayName}</span>
      </button>
      {open && (
        <div style={{position:'absolute', right:0, marginTop:8, background:'rgba(8,12,18,0.98)', padding:12, borderRadius:10, boxShadow:'0 14px 40px rgba(0,0,0,0.6)', border:'1px solid rgba(255,255,255,0.04)', minWidth: 160, zIndex: 100}}>
          <div style={{fontWeight:700, color:'#eaf6ea', marginBottom:8}}>{user?.screen_name || user?.email || 'User'}</div>
          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            <Link to="/profile" onClick={() => setOpen(false)} style={{color:'#9aa6ad', textDecoration:'none'}}>Settings</Link>
            <Link to="/my-bets" onClick={() => setOpen(false)} style={{color:'#9aa6ad', textDecoration:'none'}}>Bet Logger</Link>
            <button onClick={handleLogout} style={{background:'transparent', border:'none', color:'#f88', textAlign:'left', cursor:'pointer', padding:0, fontSize:'inherit'}}>Logout</button>
          </div>
        </div>
      )}
    </div>
  );
}

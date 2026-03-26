import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../lib/state/authStore';
import { uploadAvatar, updateProfile, listAllUsers, adminUploadAvatar } from '../lib/api/api';
import './Profile.css';

interface UserRow {
  user_id: string;
  screenname?: string;
  email?: string;
  avatar_url?: string;
  role?: string;
}

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const init = useAuthStore((s) => s.init);
  const isBookie = user?.role === 'BOOKIE';

  // My settings
  const [screenname, setScreenname] = useState(user?.screen_name || user?.username || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Admin section
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [adminUploading, setAdminUploading] = useState<string | null>(null);
  const [adminMsg, setAdminMsg] = useState('');
  const adminFileRef = useRef<HTMLInputElement>(null);
  const [adminTarget, setAdminTarget] = useState<string | null>(null);

  useEffect(() => {
    if (isBookie) {
      setLoadingUsers(true);
      listAllUsers().then(setAllUsers).catch(() => {}).finally(() => setLoadingUsers(false));
    }
  }, [isBookie]);

  const handleSaveScreenname = async () => {
    if (!screenname.trim()) return;
    setSaving(true);
    setMsg('');
    try {
      await updateProfile(screenname.trim());
      await init();
      setMsg('Screen name updated!');
    } catch {
      setMsg('Failed to update screen name');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg('');
    try {
      const res = await uploadAvatar(file);
      await init();
      setMsg('Profile picture updated!');
    } catch {
      setMsg('Failed to upload profile picture');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleAdminAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !adminTarget) return;
    setAdminUploading(adminTarget);
    setAdminMsg('');
    try {
      await adminUploadAvatar(adminTarget, file);
      // Refresh user list
      const updated = await listAllUsers();
      setAllUsers(updated);
      setAdminMsg('Avatar updated!');
    } catch {
      setAdminMsg('Failed to upload avatar');
    } finally {
      setAdminUploading(null);
      setAdminTarget(null);
      if (adminFileRef.current) adminFileRef.current.value = '';
    }
  };

  const avatarSrc = user?.avatar_url;

  return (
    <div className="profile-page">
      <div className="profile-main">
        <div className="profile-header">
          <h1 className="profile-title">Settings</h1>
          <p className="profile-subtitle">Manage your account settings and preferences</p>
        </div>

        {/* ── My Profile ── */}
        <div className="profile-card">
          <h2 className="profile-card-title">My Profile</h2>
          <div className="profile-avatar-section">
            <div className="profile-avatar-wrap">
              {avatarSrc ? (
                <img src={avatarSrc} alt="avatar" className="profile-avatar-img" />
              ) : (
                <div className="profile-avatar-placeholder">
                  {(user?.screen_name || user?.email || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="profile-avatar-actions">
              <button className="profile-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading...' : avatarSrc ? 'Change Picture' : 'Upload Picture'}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={handleAvatarUpload} />
              <span className="profile-hint">JPG, PNG, WebP or GIF · Max 2MB</span>
            </div>
          </div>

          <div className="profile-field">
            <label className="profile-label">Screen Name</label>
            <div className="profile-input-row">
              <input
                className="profile-input"
                value={screenname}
                onChange={(e) => setScreenname(e.target.value)}
                maxLength={50}
                placeholder="Enter screen name"
              />
              <button className="profile-btn" onClick={handleSaveScreenname} disabled={saving || !screenname.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <div className="profile-field">
            <label className="profile-label">Email</label>
            <div className="profile-value">{user?.email || '—'}</div>
          </div>

          <div className="profile-field">
            <label className="profile-label">Role</label>
            <div className="profile-value">{user?.role || 'BETTOR'}</div>
          </div>

          {msg && <div className="profile-msg">{msg}</div>}
        </div>

        {/* ── Admin: Manage All Users ── */}
        {isBookie && (
          <div className="profile-card">
            <h2 className="profile-card-title">Manage All Users</h2>
            <p className="profile-subtitle" style={{ marginBottom: 16 }}>Upload profile pictures for any user on betGSIS</p>
            {adminMsg && <div className="profile-msg">{adminMsg}</div>}
            <input ref={adminFileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={handleAdminAvatarUpload} />
            {loadingUsers ? (
              <p className="profile-muted">Loading users...</p>
            ) : (
              <div className="profile-users-grid">
                {allUsers.map((u) => (
                  <div className="profile-user-card" key={u.user_id}>
                    <div className="profile-user-avatar-wrap">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="profile-user-avatar-img" />
                      ) : (
                        <div className="profile-user-avatar-placeholder">
                          {(u.screenname || u.email || '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="profile-user-info">
                      <div className="profile-user-name">{u.screenname || u.email || u.user_id.slice(0, 8)}</div>
                      <div className="profile-user-role">{u.role || 'BETTOR'}</div>
                    </div>
                    <button
                      className="profile-btn profile-btn-sm"
                      disabled={adminUploading === u.user_id}
                      onClick={() => {
                        setAdminTarget(u.user_id);
                        adminFileRef.current?.click();
                      }}
                    >
                      {adminUploading === u.user_id ? '...' : u.avatar_url ? 'Change' : 'Upload'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

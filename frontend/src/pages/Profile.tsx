import React from 'react';
import Card from '../components/Shared/Card';
import './Profile.css';

export default function Profile() {
  return (
    <div className="profile-page">
      <div className="profile-main">
        <div className="profile-header">
          <h1 className="profile-title">Profile</h1>
          <p className="profile-subtitle">Manage your account settings and preferences</p>
        </div>

        <Card title="User Settings" variant="default">
          <p>User profile and account settings interface coming soon.</p>
        </Card>
      </div>
    </div>
  );
}

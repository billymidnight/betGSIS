import React from 'react'
import './Dashboard.css'

export default function Home() {
  return (
    <div className="dashboard-main">
        <div className="dashboard-header">
          <div className="dashboard-title-section">
            <h1 className="dashboard-title">Home</h1>
            <p className="dashboard-subtitle">Underway</p>
          </div>
        </div>

        <section>
          <p style={{ color: '#9aa6ad' }}>Underway</p>
        </section>
      </div>
  )
}

import React, { useState, useEffect } from 'react'
import './Dashboard.css'
import api from '../lib/api/api'

export default function BookControl() {
  const [status, setStatus] = useState('')

  useEffect(() => {
    setStatus('Ready')
  }, [])

  return (
    <div className="dashboard-main">
      <h2>Manage Book</h2>
      <p>Assign games, toggle lines, and settle bets from this panel (book-only).</p>
      <div>Status: {status}</div>
    </div>
  )
}

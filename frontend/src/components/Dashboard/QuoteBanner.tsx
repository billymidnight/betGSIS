import React from 'react'
import './QuoteBanner.css'

export default function QuoteBanner() {
  return (
    <div className="quote-banner">
      <div className="quote-container">
        <h1 className="quote-text">
          Don't chase the odds.
          <br />
          Let the odds chase you.
        </h1>
        <p className="quote-author">— Boobalan</p>
      </div>
      <div className="quote-glow"></div>
    </div>
  )
}

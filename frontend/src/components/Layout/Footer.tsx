import React from 'react';
import './Footer.css';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <h4 className="footer-title">betGSIS</h4>
            <p className="footer-text">Professional sportsbook odds and pricing platform.</p>
          </div>

          <div className="footer-section">
            <h4 className="footer-title">Links</h4>
            <ul className="footer-links">
              <li>
                <a href="#portfolio">Portfolio</a>
              </li>
              <li>
                <a href="#geoguessr">GeoGuessr</a>
              </li>
              <li>
                <a href="#bets">Bets</a>
              </li>
            </ul>
          </div>

          <div className="footer-section">
            <h4 className="footer-title">Support</h4>
            <ul className="footer-links">
              <li>
                <a href="#docs">Documentation</a>
              </li>
              <li>
                <a href="#contact">Contact</a>
              </li>
              <li>
                <a href="#privacy">Privacy</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-divider" />

        <div className="footer-bottom">
          <p className="footer-copyright">
            © {currentYear} betGSIS. All rights reserved.
          </p>
          <div className="footer-stats">
            <span className="footer-stat">
              <span className="footer-stat-label">Status:</span>
              <span className="footer-stat-value alive">● Online</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

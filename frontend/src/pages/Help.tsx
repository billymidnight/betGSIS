import React, { useState } from 'react';
import './Help.css';

export default function Help() {
  const [tab, setTab] = useState<'basic' | 'terms'>('basic');

  return (
    <div className="help-page">
      <div className="help-header">
        <h1 className="help-title">Help</h1>
        <div className="help-tabs">
          <button className={`help-tab ${tab === 'basic' ? 'active' : ''}`} onClick={() => setTab('basic')}>Basic</button>
          <button className={`help-tab ${tab === 'terms' ? 'active' : ''}`} onClick={() => setTab('terms')}>Terms</button>
        </div>
      </div>

      <div className="help-content">
        {tab === 'basic' ? (
          <div className="help-section">
            <ul className="help-bullets">
              <li>All users must have betGSIS accounts to place bets on the platform.</li>
              <li>Currently only the GeoGuessr Odds Screen is active, with the rest of the platform under development.</li>
              <li>Users can select any offered market except those designated as ILLEGAL (see Terms tab), choose stake size, and place wagers.</li>
              <li>All bets can be viewed under "My Bets" or Profile → Bet Logger.</li>
              <li>Active bets can be settled and viewed on the "Bet Settler" page.</li>
              <li>Bets must be settled with integrity at the conclusion of each game, as the global GeoGuessr game counter is incremented. This counter is used to identify each game and its associated bets.</li>
              <li>Statistics such as PnL, bet history, and edge can be viewed on the Portfolio page.</li>
              <li>Kottayam prices will be released soon.</li>
            </ul>
          </div>
        ) : (
          <div className="help-section">
            <h3>ANTE</h3>
            <ul>
              <li>An Ante must always be placed on each game. This is non‑negotiable.</li>
              <li>Please note that Antes are the only vig‑free market offered.</li>
            </ul>

            <h3>ILLEGAL BETS</h3>
            <ul>
              <li>You may never bet your own unders.</li>
              <li>You may never bet anyone’s Moneyline except your own, unless it is a game you are not participating in and the lines have been repriced accordingly.</li>
              <li>You may never bet on another player’s Specials that require strong performance (i.e., you cannot wager on someone doing exceptionally well, since you could intentionally play poorly to distort their odds).</li>
              <li>Parlays are not currently supported.</li>
              <li>You may not place bets for any game other than the current global game counter shown on the navigation bar.</li>
            </ul>

            <h3>COUNTRIES AND CONTINENTS</h3>
            <ul>
              <li>All of Russia and all of Turkey count as Europe.</li>
              <li>European overseas colonies that are non‑sovereign count as their European parent nation and Europe as a continent. Examples include: British Virgin Islands (UK), Curaçao (Netherlands), Bermuda (UK), Martinique (France). This list is not exhaustive.</li>
              <li>The Island of Jersey counts as the UK.</li>
              <li>Monaco does not count as France, as it is a sovereign city‑state.</li>
              <li>The Faroe Islands and Greenland both being part of the Kingdom of Denmark will count as Denmark and Europe.</li>
              <li>All US overseas territories and minor outlying islands count as the US and North America.</li>
              <li>All Caribbean islands count as North America except European overseas colonies.</li>
              <li>Antarctica loses on all continents.</li>
            </ul>

            <h3>LOCKING</h3>
            <ul>
              <li>Any market or specific bet may be locked at any time at the discretion of betGSIS traders.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

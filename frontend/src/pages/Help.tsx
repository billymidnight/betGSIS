import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Help.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

interface SopranosReference {
  characters_by_gender: {
    Male: Array<{ name: string; married_s3: boolean; age_s3: number }>;
    Female: Array<{ name: string; married_s3: boolean; age_s3: number }>;
  };
  crews: Record<string, Array<{ name: string; s3_position: string | null }>>;
  bosses: Array<{ name: string; crew: string | null; s3_position: string }>;
  characters_by_age: Array<{ name: string; age_s3: number; gender: string }>;
}

export default function Help() {
  const [tab, setTab] = useState<'basic' | 'terms' | 'sopranos'>('basic');
  const [sopranosData, setSopranosData] = useState<SopranosReference | null>(null);

  useEffect(() => {
    if (tab === 'sopranos' && !sopranosData) {
      loadSopranosReference();
    }
  }, [tab]);

  const loadSopranosReference = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/trading/sopranos/reference`);
      if (response.data.success) {
        setSopranosData(response.data);
      }
    } catch (error) {
      console.error('Failed to load Sopranos reference:', error);
    }
  };

  return (
    <div className="help-page">
      <div className="help-header">
        <h1 className="help-title">Help</h1>
        <div className="help-tabs">
          <button className={`help-tab ${tab === 'basic' ? 'active' : ''}`} onClick={() => setTab('basic')}>Basic</button>
          <button className={`help-tab ${tab === 'terms' ? 'active' : ''}`} onClick={() => setTab('terms')}>Terms</button>
          <button className={`help-tab ${tab === 'sopranos' ? 'active' : ''}`} onClick={() => setTab('sopranos')}>Sopranos</button>
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
        ) : tab === 'sopranos' ? (
          <div className="help-section">
            <h2 style={{ color: '#fbbf24', marginBottom: '2rem' }}>Sopranos Trading Reference</h2>
            
            {!sopranosData ? (
              <p>Loading...</p>
            ) : (
              <>
                {/* Characters by Gender and Married Status */}
                <h3 style={{ color: '#f59e0b', marginTop: '2rem', marginBottom: '1rem' }}>All Characters</h3>
                <table className="sopranos-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Gender</th>
                      <th>Married (S3)</th>
                      <th>Age (S3)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(sopranosData.characters_by_gender).map(([gender, chars]) =>
                      chars.map((char, idx) => (
                        <tr key={`${gender}-${idx}`}>
                          <td>{char.name}</td>
                          <td>{gender}</td>
                          <td style={{ color: char.married_s3 ? '#10b981' : '#ef4444' }}>
                            {char.married_s3 ? '✓ Yes' : '✗ No'}
                          </td>
                          <td>{char.age_s3}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Characters by Crew */}
                <h3 style={{ color: '#f59e0b', marginTop: '2rem', marginBottom: '1rem' }}>Characters by Crew</h3>
                {Object.entries(sopranosData.crews).map(([crew, members]) => (
                  <div key={crew} style={{ marginBottom: '2rem' }}>
                    <h4 style={{ color: '#fbbf24', marginBottom: '0.5rem' }}>{crew}</h4>
                    <table className="sopranos-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Position (S3)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((member, idx) => (
                          <tr key={idx}>
                            <td>{member.name}</td>
                            <td>{member.s3_position || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                {/* Characters by Age */}
                <h3 style={{ color: '#f59e0b', marginTop: '2rem', marginBottom: '1rem' }}>Characters by Age</h3>
                <table className="sopranos-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Age (S3)</th>
                      <th>Gender</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sopranosData.characters_by_age.map((char, idx) => (
                      <tr key={idx}>
                        <td>{char.name}</td>
                        <td>{char.age_s3}</td>
                        <td>{char.gender}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Bosses Only */}
                <h3 style={{ color: '#f59e0b', marginTop: '2rem', marginBottom: '1rem' }}>Bosses Only</h3>
                <table className="sopranos-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Crew/Family</th>
                      <th>Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sopranosData.bosses.map((boss, idx) => (
                      <tr key={idx}>
                        <td>{boss.name}</td>
                        <td>{boss.crew || 'N/A'}</td>
                        <td>{boss.s3_position}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
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
              <li>You may never bet on another player’s Specials that require strong relative performance (i.e., you cannot wager on someone doing exceptionally well, since you could intentionally play poorly to distort their odds).</li>
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
              <li>World Cup Winners are: Brazil, Germany, Italy, Argentina, France, Uruguay, Spain, and England (United Kingdom).</li>
              <li>Countries in the Axis Coalition in World War II were Germany, Italy, Japan, Romania, Hungary and Croatia.</li>
              <li>Crippling College countries are USA, Canada, Singapore, India, AND United Kingdom</li>
              <li>Exhausted list of visited countries: France, Switzerland, the United Kingdom, Ireland, Turkey, the United Arab Emirates, New Zealand, Austria, Germany, Hungary, the United States, Canada, South Korea, Singapore, Malaysia, India, Indonesia, Japan, Czechia, Norway, Spain, Denmark, Belgium, Thailand, Sri Lanka, Qatar, and Greece.</li>
              <li>Exhaustive list of British Colonies: Nigeria, Botswana, Ghana, Kenya, Lesotho, South Africa, Uganda, India, Israel (under the British Mandate of Palestine), Bangladesh, Pakistan, Singapore, Malaysia, Qatar, Sri Lanka, the United Arab Emirates, Oman, Canada, the United States, Barbados, the Bahamas, Ireland, Malta (Crown Colony of Malta), Australia, and New Zealand. </li>
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

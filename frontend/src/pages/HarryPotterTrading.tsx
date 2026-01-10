import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import {
  fetchHarryPotterCharacters,
  fetchHarryPotterStats,
  fetchTradingLocks,
  drawHarryPotterCards,
  fetchHarryPotterGeneralMarkets,
  fetchHarryPotterCharacterMarkets,
  fetchHarryPotterHouseMarkets,
  fetchHarryPotterSpecialMarkets,
  settleHarryPotterBets,
  endHarryPotterSession
} from '../lib/api/api';
import './HarryPotterTrading.css';

// Get backend base URL for serving images (not the /api endpoint)
const getBackendBaseUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    // Remove /api suffix if present
    return apiUrl.replace(/\/api$/, '');
  }
  return 'http://localhost:4000';
};

const API_BASE = getBackendBaseUrl();

interface Character {
  character_id: number;
  name: string;
  img_filename: string;
  age: number;
  gender: string;
  was_lawyer: boolean;
  won_emmy: boolean;
  family: string | null;
  survived: boolean;
}

interface Market {
  market_id: string;
  name: string;
  description: string;
  odds_decimal: number;
  odds_american: number;
  probability: number;
}

interface Bet {
  market_id: string;
  market_name: string;
  stake: number;
  odds_decimal: number;
  odds_american: number;
}

interface BetResult {
  market_id: string;
  market_name: string;
  won: boolean;
  push: boolean;
  pnl: number;
}

interface CharacterMarket {
  character_id: number;
  character_name: string;
  drawn: Market;
  not_drawn: Market;
}

interface CrewMarket {
  crew_name: string;
  crew_size: number;
  drawn: Market;
  not_drawn: Market;
}

const Card: React.FC<{ character: Character | null; faceDown: boolean }> = ({ character, faceDown }) => {
  if (faceDown) {
    const faceDownImageUrl = `${API_BASE}/harrypotter/facedown.png`;
    return (
      <div className="card card-face-down">
        <img 
          src={faceDownImageUrl} 
          alt="Face Down Card" 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  if (!character) return null;

  const imageUrl = `${API_BASE}/harrypotter/${character.img_filename}`;
  console.log('Loading image:', imageUrl);

  return (
    <div className="card card-face-up">
      <div className="card-image">
        <img
          src={imageUrl}
          alt={character.name}
          onError={(e) => {
            console.error('Failed to load image:', imageUrl);
            (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="192"><rect width="256" height="192" fill="%23222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="20" fill="%23666">No Image</text></svg>';
          }}
          onLoad={() => console.log('Image loaded successfully:', imageUrl)}
        />
      </div>

      <div className="card-name">
        <h3>{character.name}</h3>
      </div>

      <div className="card-stats">
        <div className="card-stat-row">
          <div className="card-stat">
            <div className="card-stat-label">Gender</div>
            <div className="card-stat-value">{character.gender === 'M' ? 'Male' : 'Female'}</div>
          </div>
          <div className="card-stat">
            <div className="card-stat-label">Survived</div>
            <div className="card-stat-value">
              {character.survived ? '✓' : '✗'}
            </div>
          </div>
        </div>

        <div className="card-stat-row">
          <div className="card-stat">
            <div className="card-stat-label">House</div>
            <div className="card-stat-value" style={{ fontSize: '0.75rem' }}>
              {character.house || 'None'}
            </div>
          </div>
          <div className="card-stat">
            <div className="card-stat-label">Teacher</div>
            <div className="card-stat-value">
              {character.is_was_teacher ? '✓' : '✗'}
            </div>
          </div>
        </div>

        <div className="card-stat-row">
          <div className="card-stat">
            <div className="card-stat-label">Age</div>
            <div className="card-stat-value">{character.age}</div>
          </div>
          <div className="card-stat">
            <div className="card-stat-label"></div>
            <div className="card-stat-value"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function HarryPotterTrading() {
  const navigate = useNavigate();
  const [view, setView] = useState<'landing' | 'session'>('landing');
  const [showBankrollPopup, setShowBankrollPopup] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showNextDrawButton, setShowNextDrawButton] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  
  const [bankroll, setBankroll] = useState(0);
  const [balance, setBalance] = useState(0);
  const [betsPlaced, setBetsPlaced] = useState(0);
  const [amountWagered, setAmountWagered] = useState(0);
  const [sessionBetsPlaced, setSessionBetsPlaced] = useState(0);
  const [sessionAmountWagered, setSessionAmountWagered] = useState(0);
  
  const [cards, setCards] = useState<Character[]>([]);
  const [cardsRevealed, setCardsRevealed] = useState(false);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [characterMarkets, setCharacterMarkets] = useState<CharacterMarket[]>([]);
  const [crewMarkets, setCrewMarkets] = useState<CrewMarket[]>([]);
  const [specialMarkets, setSpecialMarkets] = useState<Market[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [betResults, setBetResults] = useState<BetResult[]>([]);
  const [roundNetPnl, setRoundNetPnl] = useState(0);
  const [betAmounts, setBetAmounts] = useState<{ [key: string]: string }>({});
  const [timer, setTimer] = useState(120);
  const [timerActive, setTimerActive] = useState(false);
  const [numCards, setNumCards] = useState(3);  // Track number of cards for current draw
  
  const [characters, setCharacters] = useState<Character[]>([]);
  const [stats, setStats] = useState({ sessions_played: 0, total_pnl: 0 });
  const [locks, setLocks] = useState({ master: false, sopranos: false, breaking_bad: false });

  useEffect(() => {
    loadCharacters();
    loadStats();
    fetchLocks();
  }, []);

  useEffect(() => {
    if (timerActive && timer > 0) {
      const interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
      return () => clearInterval(interval);
    } else if (timer === 0 && timerActive) {
      handleSubmit();
    }
  }, [timer, timerActive]);

  const loadCharacters = async () => {
    try {
      const response = await fetchHarryPotterCharacters();
      if (response.success) setCharacters(response.characters);
    } catch (error) {
      console.error('Failed to load characters:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetchHarryPotterStats();
      if (response.success) setStats(response);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const fetchLocks = async () => {
    try {
      const response = await fetchTradingLocks();
      if (response.success) {
        setLocks(response.locks);
      }
    } catch (error) {
      console.error('Failed to fetch locks:', error);
    }
  };

  const startSession = async (selectedBankroll: number) => {
    // Check if game is locked
    if (locks.master || locks.sopranos) {
      alert('🔒 betGSIS traders have locked this market');
      setShowBankrollPopup(false);
      return;
    }
    
    setBankroll(selectedBankroll);
    setBalance(selectedBankroll);
    setSessionBetsPlaced(0);
    setSessionAmountWagered(0);
    setShowBankrollPopup(false);
    setView('session');
    await startNewDraw();
  };

  const startNewDraw = async () => {
    try {
      const drawResponse = await drawHarryPotterCards(3);
      if (drawResponse.success) {
        setCards(drawResponse.draw);
        setCardsRevealed(false);
        // Capture num_cards from response
        const cardsCount = drawResponse.num_cards || 3;
        setNumCards(cardsCount);
        
        // Pass num_cards to all market endpoints
        const marketsResponse = await fetchHarryPotterGeneralMarkets(cardsCount);
        if (marketsResponse.success) setMarkets(marketsResponse.markets);

        const charMarketsResponse = await fetchHarryPotterCharacterMarkets(cardsCount);
        if (charMarketsResponse.success) setCharacterMarkets(charMarketsResponse.character_markets);

        const crewMarketsResponse = await fetchHarryPotterHouseMarkets(cardsCount);
        if (crewMarketsResponse.success) setCrewMarkets(crewMarketsResponse.crew_markets);

        const specialMarketsResponse = await fetchHarryPotterSpecialMarkets(cardsCount);
        if (specialMarketsResponse.success) setSpecialMarkets(specialMarketsResponse.special_markets);
      }

      setBets([]);
      setBetResults([]);
      setRoundNetPnl(0);
      setBetAmounts({});
      setShowNextDrawButton(false);
      setTimer(120);
      setTimerActive(true);
    } catch (error) {
      console.error('Failed to start new draw:', error);
    }
  };

  const placeAllBets = () => {
    const newBets: Bet[] = [];
    let totalWagered = 0;
    let invalidBets = false;

    // Collect all markets with amounts entered
    Object.keys(betAmounts).forEach(marketId => {
      const amount = parseFloat(betAmounts[marketId] || '0');
      if (amount > 0) {
        if (amount > balance) {
          invalidBets = true;
          return;
        }
        
        // Find the market from all market sources
        let market: Market | undefined;
        
        // Check character markets
        characterMarkets.forEach(cm => {
          if (cm.drawn.market_id === marketId) market = cm.drawn;
          if (cm.not_drawn.market_id === marketId) market = cm.not_drawn;
        });
        
        // Check crew markets
        crewMarkets.forEach(cm => {
          if (cm.drawn.market_id === marketId) market = cm.drawn;
          if (cm.not_drawn.market_id === marketId) market = cm.not_drawn;
        });
        
        // Check special markets
        specialMarkets.forEach(m => {
          if (m.market_id === marketId) market = m;
        });
        
        if (market) {
          newBets.push({
            market_id: marketId,
            market_name: market.text_on_screen || market.name,
            stake: amount,
            odds_decimal: market.odds_decimal,
            odds_american: market.odds_american
          });
          totalWagered += amount;
        }
      }
    });

    if (invalidBets) {
      alert('One or more bet amounts exceed your balance');
      return;
    }

    if (newBets.length === 0) {
      alert('Please enter bet amounts before submitting');
      return;
    }

    setBets(newBets);
    setBetsPlaced(newBets.length);
    setAmountWagered(totalWagered);
    
    // Accumulate session stats
    setSessionBetsPlaced(prev => prev + newBets.length);
    setSessionAmountWagered(prev => prev + totalWagered);
    
    // Auto-submit after placing all bets
    setTimeout(() => handleSubmit(newBets), 100);
  };

  const calculateExpectedPayout = (stake: number, oddsDecimal: number): number => {
    return stake * oddsDecimal;
  };

  const handleSubmit = async (submittedBets?: Bet[]) => {
    const betsToSettle = submittedBets || bets;
    if (betsToSettle.length === 0) return alert('Please place at least one bet');

    setTimerActive(false);
    setCardsRevealed(true);

    try {
      const response = await settleHarryPotterBets(cards, betsToSettle);

      if (response.success) {
        const { results, total_pnl } = response;
        
        // Store bet results for display on each market
        setBetResults(results.map((r: any) => ({
          market_id: r.market_id,
          market_name: r.market_name,
          won: r.won,
          push: r.push || false,
          pnl: r.pnl
        })));
        
        // Store round net P&L
        setRoundNetPnl(total_pnl);
        
        // Now calculate new balance including stake returns and winnings/losses
        const newBalance = balance + total_pnl;
        setBalance(newBalance);
        
        // Show next draw button or bust message
        if (newBalance > 0) {
          setShowNextDrawButton(true);
        } else {
          // Busted - pass true flag to endSession
          setTimeout(() => {
            endSession(true);
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Failed to settle bets:', error);
    }
  };

  const endSession = async (isBust: boolean = false) => {
    // Always use the exact P&L shown in the popup: balance - bankroll
    const finalPnl = balance - bankroll;
    
    try {
      // Insert bet record into bets table
      await endHarryPotterSession({
        num_bets: sessionBetsPlaced,
        net_pnl: finalPnl
      });
      
      setShowEndSessionModal(true);
    } catch (error) {
      console.error('Failed to record session:', error);
      alert('Session could not be recorded. Please ensure you are signed in.');
    }
  };

  const closeEndSessionModal = () => {
    setShowEndSessionModal(false);
    setView('landing');
    loadStats();
  };

  if (view === 'landing') {
    return (
      <div className="sopranos-container">
        <div className="sopranos-content">
          <div style={{ marginBottom: '2rem' }}>
            <a onClick={() => navigate('/trading')} className="back-button" style={{ cursor: 'pointer' }}>← Back to Trading</a>
            <h1 className="sopranos-title">Harry Potter Trading</h1>
            <p className="sopranos-subtitle">Trade character cards from the Emmy-winning series</p>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.sessions_played}</div>
              <div className="stat-label">Sessions Played</div>
            </div>
            <div className="stat-card">
              <div className={`stat-value ${stats.total_pnl >= 0 ? 'positive' : 'negative'}`}>${stats.total_pnl.toFixed(2)}</div>
              <div className="stat-label">Total P&L</div>
            </div>
          </div>

          <div className="actions-row">
            <button onClick={() => setShowBankrollPopup(true)} className="btn-primary">Start New Session</button>
            <button onClick={() => setShowRules(true)} className="btn-secondary">Rules & Info</button>
          </div>

          {!showRules && characters.length > 0 && (
            <div className="info-panel">
              <h2 className="info-title">Character Stats</h2>
              <div className="info-grid">
                <div className="info-item">Total Characters: <span className="info-value">{characters.length}</span></div>
                <div className="info-item">Male: <span className="info-value">{characters.filter(c => c.gender === 'M').length}</span></div>
                <div className="info-item">Female: <span className="info-value">{characters.filter(c => c.gender === 'F').length}</span></div>
                <div className="info-item">Lawyers: <span className="info-value">{characters.filter(c => c.was_lawyer).length}</span></div>
                <div className="info-item">Survivors: <span className="info-value">{characters.filter(c => c.survived).length}</span></div>
                <div className="info-item">Emmy Winners: <span className="info-value">{characters.filter(c => c.won_emmy).length}</span></div>
              </div>
            </div>
          )}

          {showRules && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h2 className="modal-title">How to Play</h2>
                <div className="rules-section">
                  <h3>Rules</h3>
                  <ul>
                    <li>Choose your starting bankroll: $25, $50, $100, or $200</li>
                    <li>Each draw shows 3 random characters face-down</li>
                    <li>You have 2 minutes to place bets on various markets</li>
                    <li>Cards are revealed after 2 minutes or when you click SUBMIT</li>
                    <li>Winning bets are paid out, losing bets are deducted</li>
                  </ul>
                </div>
                <div className="rules-section">
                  <h3>Example Cards</h3>
                  <div className="example-cards">
                    {characters.slice(0, 3).map(char => <Card key={char.character_id} character={char} faceDown={false} />)}
                  </div>
                </div>

                <div className="rules-section">
                  <h3>Stats</h3>
                  <div style={{ marginBottom: '1rem', display: 'flex', gap: '2rem', fontSize: '1.1rem', fontWeight: '600' }}>
                    <div>Men Count: {characters.filter(c => c.gender?.trim().toUpperCase() === 'M').length}</div>
                    <div>Women Count: {characters.filter(c => c.gender?.trim().toUpperCase() === 'F').length}</div>
                  </div>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: '#fbbf24' }}>All Characters</h4>
                  <div style={{ marginBottom: '1rem', display: 'flex', gap: '2rem', fontSize: '0.95rem', fontWeight: '600' }}>
                    <div>Survived: {characters.filter(c => c.survived).length}</div>
                    <div>Dead: {characters.filter(c => !c.survived).length}</div>
                    <div>Lawyers: {characters.filter(c => c.was_lawyer).length}</div>
                    <div>Emmy Winners: {characters.filter(c => c.won_emmy).length}</div>
                  </div>
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Lawyer</th>
                        <th>Emmy Winner</th>
                        <th>Survived</th>
                      </tr>
                    </thead>
                    <tbody>
                      {characters.sort((a, b) => a.name.localeCompare(b.name)).map(char => (
                        <tr key={char.character_id}>
                          <td>{char.name}</td>
                          <td style={{ textAlign: 'center' }}>{char.was_lawyer ? '✓' : '✗'}</td>
                          <td style={{ textAlign: 'center' }}>{char.won_emmy ? '✓' : '✗'}</td>
                          <td style={{ textAlign: 'center' }}>{char.survived ? '✓' : '✗'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: '#fbbf24' }}>DiMeo Crime Family</h4>
                  <p style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                    *Position is taken as of season 3. If a character is deceased by season 3, his/her last position before death is considered.
                  </p>

                  {['Soprano', 'Junior', 'Aprile', 'Barese', 'Altieri', 'Curto'].map(crewName => {
                    const crewMembers = characters.filter(c => c.crew?.toLowerCase() === crewName.toLowerCase());
                    if (crewMembers.length === 0) return null;
                    return (
                      <div key={crewName} style={{ marginBottom: '1rem' }}>
                        <h5 style={{ marginTop: '1rem', marginBottom: '0.5rem', color: '#d97706' }}>{crewName} Crew</h5>
                        <table className="stats-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Position</th>
                            </tr>
                          </thead>
                          <tbody>
                            {crewMembers.sort((a, b) => {
                              const positionOrder = ['boss', 'consigliere', 'underboss', 'captain', 'soldier', 'associate'];
                              const posA = positionOrder.indexOf(a.s3_position?.toLowerCase() || '');
                              const posB = positionOrder.indexOf(b.s3_position?.toLowerCase() || '');
                              if (posA !== posB) return (posA === -1 ? 999 : posA) - (posB === -1 ? 999 : posB);
                              return a.name.localeCompare(b.name);
                            }).map(char => (
                              <tr key={char.character_id}>
                                <td>{char.name}</td>
                                <td>{char.s3_position || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: '#fbbf24' }}>Lupertazzi Crime Family</h4>
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {characters.filter(c => c.crew?.toLowerCase() === 'lupertazzi').sort((a, b) => {
                        const positionOrder = ['boss', 'consigliere', 'underboss', 'captain', 'soldier', 'associate'];
                        const posA = positionOrder.indexOf(a.s3_position?.toLowerCase() || '');
                        const posB = positionOrder.indexOf(b.s3_position?.toLowerCase() || '');
                        if (posA !== posB) return (posA === -1 ? 999 : posA) - (posB === -1 ? 999 : posB);
                        return a.name.localeCompare(b.name);
                      }).map(char => (
                        <tr key={char.character_id}>
                          <td>{char.name}</td>
                          <td>{char.s3_position || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: '#fbbf24' }}>Age Table</h4>
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Age (S3)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {characters.sort((a, b) => (b.age_s3 || 0) - (a.age_s3 || 0)).map(char => (
                        <tr key={char.character_id}>
                          <td>{char.name}</td>
                          <td style={{ textAlign: 'center' }}>{char.age_s3}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button onClick={() => setShowRules(false)} className="btn-primary" style={{ width: '100%', marginTop: '2rem' }}>Close</button>
              </div>
            </div>
          )}

          {showBankrollPopup && (
            <div className="modal-overlay">
              <div className="modal-content" style={{ maxWidth: '500px' }}>
                <h2 className="modal-title" style={{ textAlign: 'center' }}>Select Bankroll</h2>
                <div className="bankroll-grid">
                  {[25, 50, 100, 200].map(amount => (
                    <button key={amount} onClick={() => startSession(amount)} className="bankroll-option">${amount}</button>
                  ))}
                </div>
                <button onClick={() => setShowBankrollPopup(false)} className="btn-secondary" style={{ width: '100%' }}>Cancel</button>
              </div>
            </div>
          )}

          {showEndSessionModal && (
            <div className="modal-overlay">
              <div className="modal-content" style={{ maxWidth: '500px' }}>
                <h2 className="modal-title" style={{ textAlign: 'center', marginBottom: '2rem' }}>
                  {balance === 0 ? '💸 Bankroll Busted!' : 'Session Ended'}
                </h2>
                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #374151' }}>
                    <span style={{ color: '#9ca3af' }}>Starting Bankroll:</span>
                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>${bankroll.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #374151' }}>
                    <span style={{ color: '#9ca3af' }}>Ending Balance:</span>
                    <span style={{ color: balance === 0 ? '#ef4444' : '#fbbf24', fontWeight: 'bold' }}>${balance.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #374151' }}>
                    <span style={{ color: '#9ca3af' }}>Total Bets:</span>
                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{sessionBetsPlaced}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #374151' }}>
                    <span style={{ color: '#9ca3af' }}>Total Wagered:</span>
                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>${sessionAmountWagered.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0', marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '1.125rem', fontWeight: 'bold' }}>Net P&L:</span>
                    <span style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 'bold',
                      color: (balance - bankroll) >= 0 ? '#10b981' : '#ef4444'
                    }}>
                      {(balance - bankroll) >= 0 ? '+' : ''}${(balance - bankroll).toFixed(2)}
                    </span>
                  </div>
                </div>
                <button onClick={closeEndSessionModal} className="btn-primary" style={{ width: '100%' }}>Back to Menu</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const balanceClass = balance >= bankroll ? 'balance' : balance >= bankroll * 0.5 ? 'balance low' : 'balance critical';
  const timerClass = timer <= 10 ? 'timer critical' : timer <= 30 ? 'timer warning' : 'timer normal';

  return (
    <div className="session-container">
      <div className="session-content">
        <div className="session-top-bar">
          <div className="session-stats">
            <div className="session-stat">
              <div className="session-stat-label">Balance</div>
              <div className={`session-stat-value ${balanceClass}`}>${balance.toFixed(2)}</div>
            </div>
            <div className="session-stat">
              <div className="session-stat-label">Starting</div>
              <div className="session-stat-value">${bankroll.toFixed(2)}</div>
            </div>
            <div className="session-stat">
              <div className="session-stat-label">P&L</div>
              <div className={`session-stat-value ${balance - bankroll >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                {balance - bankroll >= 0 ? '+' : ''}${(balance - bankroll).toFixed(2)}
              </div>
            </div>
            <div className="session-stat">
              <div className="session-stat-label">Bets Placed</div>
              <div className="session-stat-value" style={{ color: '#fbbf24' }}>{sessionBetsPlaced}</div>
            </div>
            <div className="session-stat">
              <div className="session-stat-label">Amount Wagered</div>
              <div className="session-stat-value" style={{ color: '#fbbf24' }}>${sessionAmountWagered.toFixed(2)}</div>
            </div>
          </div>
          <div className="session-controls">
            <div className={timerClass}>{Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}</div>
            <button onClick={endSession} className="btn-end-session">End Session</button>
          </div>
        </div>

        <div className="session-layout">
          <div className="cards-section">
            <div className="cards-panel">
              <h2 className="cards-panel-title">{cardsRevealed ? 'The Draw' : 'Place Your Bets'}</h2>
              {cardsRevealed && betResults.length > 0 && (
                <div className="round-net-pnl">
                  <span className="round-net-label">Round Net P&L:</span>
                  <span className={`round-net-value ${roundNetPnl >= 0 ? 'positive' : 'negative'}`}>
                    {roundNetPnl >= 0 ? '+' : ''}${roundNetPnl.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="cards-display">
                {cardsRevealed 
                  ? cards.map((card, idx) => <Card key={idx} character={card} faceDown={false} />)
                  : Array.from({ length: numCards }).map((_, idx) => <Card key={idx} character={null} faceDown={true} />)
                }
              </div>
              {cardsRevealed && (
                <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '1.3rem', fontWeight: '700', color: '#fbbf24' }}>
                  Combined Age: {cards.reduce((sum, card) => sum + (card?.age || 0), 0)}
                </div>
              )}
              {!cardsRevealed && (
                <div className="submit-container">
                  <button onClick={placeAllBets} disabled={Object.keys(betAmounts).filter(k => (betAmounts[k] || '') !== '').length === 0} className="btn-submit">
                    SUBMIT ({Object.keys(betAmounts).filter(k => parseFloat(betAmounts[k] || '0') > 0).length} bet{Object.keys(betAmounts).filter(k => parseFloat(betAmounts[k] || '0') > 0).length !== 1 ? 's' : ''})
                  </button>
                </div>
              )}
              {cardsRevealed && showNextDrawButton && (
                <div className="submit-container">
                  <button onClick={startNewDraw} className="btn-next-draw">
                    NEXT DRAW
                  </button>
                  <button onClick={endSession} className="btn-end-session-bottom">
                    END SESSION
                  </button>
                </div>
              )}
            </div>

            {/* Character Markets below cards - 2 columns */}
            <div className="character-markets-panel">
              <div className="character-markets-columns">
                {/* DRAWN Column */}
                <div className="character-market-column">
                  <h3 className="character-column-title">DRAWN</h3>
                  <div className="character-markets-list">
                    {characterMarkets.map(charMarket => {
                      const market = charMarket.drawn;
                      const betResult = betResults.find(r => r.market_id === market.market_id);
                      
                      return (
                        <div key={market.market_id} className="market-card">
                          <div className="market-header">
                            <div className="market-info">
                              <h4>{market.text_on_screen || market.name}</h4>
                              {!cardsRevealed && betAmounts[market.market_id] && parseFloat(betAmounts[market.market_id]) > 0 && (
                                <div className="expected-payout">
                                  Win: ${calculateExpectedPayout(parseFloat(betAmounts[market.market_id]), market.odds_decimal).toFixed(2)}
                                </div>
                              )}
                            </div>
                            {!cardsRevealed && (
                              <input
                                type="number"
                                value={betAmounts[market.market_id] || ''}
                                onChange={(e) => setBetAmounts({ ...betAmounts, [market.market_id]: e.target.value })}
                                placeholder="$"
                                className="market-bet-input-inline"
                                min="1"
                                max={balance}
                              />
                            )}
                            <div className={`market-odds ${market.odds_american >= 0 ? 'positive' : 'negative'}`}>
                              {market.odds_american >= 0 ? '+' : ''}{market.odds_american}
                            </div>
                          </div>
                          
                          {cardsRevealed && betResult && (
                            <div className={`bet-result ${betResult.push ? 'push' : betResult.won ? 'won' : 'lost'}`}>
                              <div className="bet-result-status">
                                {betResult.push ? 'PUSH' : betResult.won ? 'WON' : 'LOST'}
                              </div>
                              <div className="bet-result-pnl">
                                {betResult.pnl >= 0 ? '+' : ''}${betResult.pnl.toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* NOT DRAWN Column */}
                <div className="character-market-column">
                  <h3 className="character-column-title">NOT DRAWN</h3>
                  <div className="character-markets-list">
                    {characterMarkets.map(charMarket => {
                      const market = charMarket.not_drawn;
                      const betResult = betResults.find(r => r.market_id === market.market_id);
                      
                      return (
                        <div key={market.market_id} className="market-card">
                          <div className="market-header">
                            <div className="market-info">
                              <h4>{market.text_on_screen || market.name}</h4>
                              {!cardsRevealed && betAmounts[market.market_id] && parseFloat(betAmounts[market.market_id]) > 0 && (
                                <div className="expected-payout">
                                  Win: ${calculateExpectedPayout(parseFloat(betAmounts[market.market_id]), market.odds_decimal).toFixed(2)}
                                </div>
                              )}
                            </div>
                            {!cardsRevealed && (
                              <input
                                type="number"
                                value={betAmounts[market.market_id] || ''}
                                onChange={(e) => setBetAmounts({ ...betAmounts, [market.market_id]: e.target.value })}
                                placeholder="$"
                                className="market-bet-input-inline"
                                min="1"
                                max={balance}
                              />
                            )}
                            <div className={`market-odds ${market.odds_american >= 0 ? 'positive' : 'negative'}`}>
                              {market.odds_american >= 0 ? '+' : ''}{market.odds_american}
                            </div>
                          </div>
                          
                          {cardsRevealed && betResult && (
                            <div className={`bet-result ${betResult.push ? 'push' : betResult.won ? 'won' : 'lost'}`}>
                              <div className="bet-result-status">
                                {betResult.push ? 'PUSH' : betResult.won ? 'WON' : 'LOST'}
                              </div>
                              <div className="bet-result-pnl">
                                {betResult.pnl >= 0 ? '+' : ''}${betResult.pnl.toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* FAMILY DRAWN Column */}
                <div className="character-market-column">
                  <h3 className="character-column-title">FAMILY DRAWN</h3>
                  <div className="character-markets-list">
                    {crewMarkets.map(crewMarket => {
                      const market = crewMarket.drawn;
                      const betResult = betResults.find(r => r.market_id === market.market_id);
                      
                      return (
                        <div key={market.market_id} className="market-card">
                          <div className="market-header">
                            <div className="market-info">
                              <h4>{market.text_on_screen || market.name}</h4>
                              {!cardsRevealed && betAmounts[market.market_id] && parseFloat(betAmounts[market.market_id]) > 0 && (
                                <div className="expected-payout">
                                  Win: ${calculateExpectedPayout(parseFloat(betAmounts[market.market_id]), market.odds_decimal).toFixed(2)}
                                </div>
                              )}
                            </div>
                            {!cardsRevealed && (
                              <input
                                type="number"
                                value={betAmounts[market.market_id] || ''}
                                onChange={(e) => setBetAmounts({ ...betAmounts, [market.market_id]: e.target.value })}
                                placeholder="$"
                                className="market-bet-input-inline"
                                min="1"
                                max={balance}
                              />
                            )}
                            <div className={`market-odds ${market.odds_american >= 0 ? 'positive' : 'negative'}`}>
                              {market.odds_american >= 0 ? '+' : ''}{market.odds_american}
                            </div>
                          </div>
                          
                          {cardsRevealed && betResult && (
                            <div className={`bet-result ${betResult.push ? 'push' : betResult.won ? 'won' : 'lost'}`}>
                              <div className="bet-result-status">
                                {betResult.push ? 'PUSH' : betResult.won ? 'WON' : 'LOST'}
                              </div>
                              <div className="bet-result-pnl">
                                {betResult.pnl >= 0 ? '+' : ''}${betResult.pnl.toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* FAMILY NOT DRAWN Column */}
                <div className="character-market-column">
                  <h3 className="character-column-title">FAMILY NOT DRAWN</h3>
                  <div className="character-markets-list">
                    {crewMarkets.map(crewMarket => {
                      const market = crewMarket.not_drawn;
                      const betResult = betResults.find(r => r.market_id === market.market_id);
                      
                      return (
                        <div key={market.market_id} className="market-card">
                          <div className="market-header">
                            <div className="market-info">
                              <h4>{market.text_on_screen || market.name}</h4>
                              {!cardsRevealed && betAmounts[market.market_id] && parseFloat(betAmounts[market.market_id]) > 0 && (
                                <div className="expected-payout">
                                  Win: ${calculateExpectedPayout(parseFloat(betAmounts[market.market_id]), market.odds_decimal).toFixed(2)}
                                </div>
                              )}
                            </div>
                            {!cardsRevealed && (
                              <input
                                type="number"
                                value={betAmounts[market.market_id] || ''}
                                onChange={(e) => setBetAmounts({ ...betAmounts, [market.market_id]: e.target.value })}
                                placeholder="$"
                                className="market-bet-input-inline"
                                min="1"
                                max={balance}
                              />
                            )}
                            <div className={`market-odds ${market.odds_american >= 0 ? 'positive' : 'negative'}`}>
                              {market.odds_american >= 0 ? '+' : ''}{market.odds_american}
                            </div>
                          </div>
                          
                          {cardsRevealed && betResult && (
                            <div className={`bet-result ${betResult.push ? 'push' : betResult.won ? 'won' : 'lost'}`}>
                              <div className="bet-result-status">
                                {betResult.push ? 'PUSH' : betResult.won ? 'WON' : 'LOST'}
                              </div>
                              <div className="bet-result-pnl">
                                {betResult.pnl >= 0 ? '+' : ''}${betResult.pnl.toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Legacy hardcoded markets (keeping for now but hiding) */}
            <div className="markets-panel-bottom" style={{ display: 'none' }}>
              <h3 className="markets-title">More Markets</h3>
              <div className="markets-grid">
                {markets.slice(Math.ceil(markets.length / 2)).map(market => {
                const betResult = betResults.find(r => r.market_id === market.market_id);
                
                return (
                  <div key={market.market_id} className="market-card">
                    <div className="market-header">
                      <div className="market-info">
                        <h4>{market.name}</h4>
                        <div className="market-description">{market.description}</div>
                        {!cardsRevealed && betAmounts[market.market_id] && parseFloat(betAmounts[market.market_id]) > 0 && (
                          <div className="expected-payout">
                            Win: ${calculateExpectedPayout(parseFloat(betAmounts[market.market_id]), market.odds_decimal).toFixed(2)}
                          </div>
                        )}
                      </div>
                      {!cardsRevealed && (
                        <input
                          type="number"
                          value={betAmounts[market.market_id] || ''}
                          onChange={(e) => setBetAmounts({ ...betAmounts, [market.market_id]: e.target.value })}
                          placeholder="$"
                          className="market-bet-input-inline"
                          min="1"
                          max={balance}
                        />
                      )}
                      <div className={`market-odds ${market.odds_american >= 0 ? 'positive' : 'negative'}`}>
                        {market.odds_american >= 0 ? '+' : ''}{market.odds_american}
                      </div>
                    </div>
                    
                    {cardsRevealed && betResult && (
                      <div className={`bet-result ${betResult.push ? 'push' : betResult.won ? 'won' : 'lost'}`}>
                        <div className="bet-result-status">
                          {betResult.push ? 'PUSH' : betResult.won ? 'WON' : 'LOST'}
                        </div>
                        <div className="bet-result-pnl">
                          {betResult.pnl >= 0 ? '+' : ''}${betResult.pnl.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          {/* Special Markets panel on the right - from database */}
          <div className="markets-panel-right">
            <h3 className="markets-title">Special Markets</h3>
            <div className="markets-list">
              {specialMarkets.map(market => {
                const betResult = betResults.find(r => r.market_id === market.market_id);
                
                return (
                  <div key={market.market_id} className="market-card">
                    <div className="market-header">
                      <div className="market-info">
                        <h4>{market.text_on_screen || market.name}</h4>
                        {!cardsRevealed && betAmounts[market.market_id] && parseFloat(betAmounts[market.market_id]) > 0 && (
                          <div className="expected-payout">
                            Win: ${calculateExpectedPayout(parseFloat(betAmounts[market.market_id]), market.odds_decimal).toFixed(2)}
                          </div>
                        )}
                      </div>
                      {!cardsRevealed && (
                        <input
                          type="number"
                          value={betAmounts[market.market_id] || ''}
                          onChange={(e) => setBetAmounts({ ...betAmounts, [market.market_id]: e.target.value })}
                          placeholder="$"
                          className="market-bet-input-inline"
                          min="1"
                          max={balance}
                        />
                      )}
                      <div className={`market-odds ${market.odds_american >= 0 ? 'positive' : 'negative'}`}>
                        {market.odds_american >= 0 ? '+' : ''}{market.odds_american}
                      </div>
                    </div>
                    
                    {cardsRevealed && betResult && (
                      <div className={`bet-result ${betResult.push ? 'push' : betResult.won ? 'won' : 'lost'}`}>
                        <div className="bet-result-status">
                          {betResult.push ? 'PUSH' : betResult.won ? 'WON' : 'LOST'}
                        </div>
                        <div className="bet-result-pnl">
                          {betResult.pnl >= 0 ? '+' : ''}${betResult.pnl.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showEndSessionModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <h2 className="modal-title" style={{ textAlign: 'center', marginBottom: '2rem' }}>
              {balance === 0 ? '💸 Bankroll Busted!' : '✅ Session Concluded'}
            </h2>
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #374151' }}>
                <span style={{ color: '#9ca3af' }}>Starting Bankroll:</span>
                <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>${bankroll.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #374151' }}>
                <span style={{ color: '#9ca3af' }}>Ending Balance:</span>
                <span style={{ color: balance === 0 ? '#ef4444' : '#fbbf24', fontWeight: 'bold' }}>${balance.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #374151' }}>
                <span style={{ color: '#9ca3af' }}>Total Bets:</span>
                <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{sessionBetsPlaced}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #374151' }}>
                <span style={{ color: '#9ca3af' }}>Total Wagered:</span>
                <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>${sessionAmountWagered.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '1.125rem', fontWeight: 'bold' }}>Net P&L:</span>
                <span style={{ 
                  fontSize: '1.5rem', 
                  fontWeight: 'bold',
                  color: (balance - bankroll) >= 0 ? '#10b981' : '#ef4444'
                }}>
                  {(balance - bankroll) >= 0 ? '+' : ''}${(balance - bankroll).toFixed(2)}
                </span>
              </div>
            </div>
            <button onClick={closeEndSessionModal} className="btn-primary" style={{ width: '100%' }}>Back to Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}

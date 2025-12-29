#!/usr/bin/env python3
"""Helper script to update all market card JSX to new format with inline input"""

import re

filepath = r"c:\Users\pritesh\Documents\Project Hub\geo_book\frontend\src\pages\SopranosTrading.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to find old market card structure
old_pattern = r'''                      return \(
                        <div key={market\.market_id} className="market-card">
                          <div className="market-header">
                            <div className="market-info">
                              <h4>{market\.text_on_screen \|\| market\.name}</h4>
                            </div>
                            <div className={`market-odds \${market\.odds_american >= 0 \? 'positive' : 'negative'}`}>
                              {market\.odds_american >= 0 \? '\+' : ''}{market\.odds_american}
                            </div>
                          </div>
                          
                          {\!cardsRevealed && \!placedBet && \(
                            <div className="market-bet-form">
                              <input
                                type="number"
                                value={betAmounts\[market\.market_id\] \|\| ''}
                                onChange={\(e\) => setBetAmounts\({ \.\.\.betAmounts, \[market\.market_id\]: e\.target\.value }\)}
                                placeholder="Amount"
                                className="market-bet-input"
                                min="1"
                                max={balance}
                              />
                              <button onClick={\(\) => placeBet\(market\)} className="btn-place-bet">Place</button>
                            </div>
                          \)}
                          
                          {placedBet && \!cardsRevealed && \(
                            <div className="bet-placed-display">
                              <span className="bet-placed-label">Bet Placed:</span>
                              <span className="bet-placed-amount">\${placedBet\.stake\.toFixed\(2\)}</span>
                            </div>
                          \)}
                          
                          {cardsRevealed && betResult && \(
                            <div className={`bet-result \${betResult\.push \? 'push' : betResult\.won \? 'won' : 'lost'}`}>
                              <div className="bet-result-status">
                                {betResult\.push \? 'PUSH' : betResult\.won \? 'WON' : 'LOST'}
                              </div>
                              <div className="bet-result-pnl">
                                {betResult\.pnl >= 0 \? '\+' : ''}\${betResult\.pnl\.toFixed\(2\)}
                              </div>
                            </div>
                          \)}
                        </div>
                      \);'''

new_template = '''                      return (
                        <div key={market.market_id} className="market-card">
                          <div className="market-header">
                            <div className="market-info">
                              <h4>{market.text_on_screen || market.name}</h4>
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
                      );'''

# Replace all occurrences
content = re.sub(old_pattern, new_template, content, flags=re.DOTALL)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Market cards updated!")

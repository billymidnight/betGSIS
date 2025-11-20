import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Shared/Card';
import { Badge } from '../components/Shared/Badge';
import { Table } from '../components/Shared/Table';
import { fetchPnLSummary, fetchRecentBets, type PlacedBet } from '../lib/api/mockApi';
import { formatCurrency } from '../lib/format';
import './Dashboard.css';

export default function Dashboard() {
  const [pnl, setPnl] = useState({
    totalBets: 0,
    totalStaked: 0,
    totalWon: 0,
    netProfit: 0,
    winRate: 0,
  });
  const [recentBets, setRecentBets] = useState<PlacedBet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [pnlData, betsData] = await Promise.all([
          fetchPnLSummary(),
          fetchRecentBets(5),
        ]);
        setPnl(pnlData);
        setRecentBets(betsData);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const netProfitColor = pnl.netProfit >= 0 ? '#2ed573' : '#ff4757';

  return (
    <div className="dashboard-page">
      <div className="dashboard-main">
        <div className="dashboard-header">
          <div className="dashboard-title-section">
            <h1 className="dashboard-title">Dashboard</h1>
            <p className="dashboard-subtitle">Real-time betting analytics and performance metrics</p>
          </div>
          {/* Removed top-right Place Bets CTA per UX: use bets flow from Geoguessr/odds pages */}
        </div>

        {isLoading ? (
          <div className="dashboard-loading">
            <div className="spinner" />
            <p>Loading dashboard...</p>
          </div>
        ) : (
          <>
            <div className="dashboard-grid">
              <Card className="stat-card" variant="elevated">
                <div className="stat-value" style={{ color: '#2ed573', fontSize: '3.2rem', fontWeight: 700 }}>
                  {pnl.totalBets}
                </div>
                <div className="stat-label" style={{ fontSize: '1.3rem' }}>Total Bets Placed</div>
              </Card>

              <Card className="stat-card" variant="elevated">
                <div className="stat-value" style={{ fontSize: '3.2rem', fontWeight: 700 }}>${pnl.totalStaked.toFixed(2)}</div>
                <div className="stat-label" style={{ fontSize: '1.3rem' }}>Total Staked</div>
              </Card>

              <Card className="stat-card" variant="elevated">
                <div className="stat-value" style={{ fontSize: '3.2rem', fontWeight: 700 }}>${pnl.totalWon.toFixed(2)}</div>
                <div className="stat-label" style={{ fontSize: '1.3rem' }}>Total Won</div>
              </Card>

              <Card className="stat-card stat-card--highlight" variant="elevated">
                <div className="stat-value" style={{ color: netProfitColor, fontSize: '3.2rem', fontWeight: 700 }}>
                  {pnl.netProfit >= 0 ? '+' : ''}{formatCurrency(pnl.netProfit)}
                </div>
                <div className="stat-label" style={{ fontSize: '1.3rem' }}>Net P&L</div>
              </Card>

              <Card className="stat-card" variant="elevated">
                <div className="stat-value" style={{ fontSize: '3.2rem', fontWeight: 700 }}>{pnl.winRate.toFixed(1)}%</div>
                <div className="stat-label" style={{ fontSize: '1.3rem' }}>Win Rate</div>
              </Card>
            </div>

            <Card title={<span style={{fontSize: '2rem', fontWeight: 600}}>Recent Bets</span>} variant="default" className="recent-bets-card">
              {recentBets.length === 0 ? (
                <div className="empty-state">
                  <p style={{fontSize: '1.5rem', fontWeight: 500}}>No bets placed yet.</p>
                  <Link to="/geoguessr" className="empty-state-link" style={{fontSize: '1.3rem', fontWeight: 500}}>
                    Start placing bets &rarr;
                  </Link>
                </div>
              ) : (
                <div className="bets-list">
                  {recentBets.map((bet) => (
                    <div key={bet.id} className="bet-item">
                      <div className="bet-info">
                        <div className="bet-id">{bet.id}</div>
                        <div className="bet-stakes">
                          <span className="bet-stake-label">Stake:</span>
                          <span className="bet-stake-value">${bet.stake.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="bet-payout">
                        <div className="bet-payout-label">Potential Payout</div>
                        <div className="bet-payout-value">${bet.potentialPayout.toFixed(2)}</div>
                      </div>
                      <Badge variant={bet.status === 'pending' ? 'info' : 'success'} size="sm">
                        {bet.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="dashboard-actions">
              <Card variant="interactive" className="action-card">
                <h3 className="action-title" style={{fontSize: '1.7rem', fontWeight: 600}}>Upload Data</h3>
                <p className="action-description" style={{fontSize: '1.2rem'}}>Import player statistics from CSV</p>
                <Link to="/geoguessr" className="action-link" style={{fontSize: '1.2rem', fontWeight: 500}}>
                  Upload CSV &rarr;
                </Link>
              </Card>

              <Card variant="interactive" className="action-card">
                <h3 className="action-title" style={{fontSize: '1.7rem', fontWeight: 600}}>View Analytics</h3>
                <p className="action-description" style={{fontSize: '1.2rem'}}>Detailed betting analytics and trends</p>
                <Link to="/my-bets" className="action-link" style={{fontSize: '1.2rem', fontWeight: 500}}>
                  View My Bets &rarr;
                </Link>
              </Card>

              <Card variant="interactive" className="action-card">
                <h3 className="action-title" style={{fontSize: '1.7rem', fontWeight: 600}}>Manage Profile</h3>
                <p className="action-description" style={{fontSize: '1.2rem'}}>Update your account settings</p>
                <Link to="/profile" className="action-link" style={{fontSize: '1.2rem', fontWeight: 500}}>
                  Go to Profile &rarr;
                </Link>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

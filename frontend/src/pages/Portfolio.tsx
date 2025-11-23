import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../lib/state/authStore'
import Card from '../components/Shared/Card'
import { Table } from '../components/Shared/Table'
import { Badge } from '../components/Shared/Badge'
import { formatCurrency, formatPercent } from '../lib/format'
import './Dashboard.css'
import './Portfolio.css'

type Summary = {
  total_bets: number
  total_won: number
  net_pnl: number
  total_wagered: number
  total_winnings: number
  roi: number | null
  active_wager_risk?: number
  pnl_today?: number
}

type MarketEntry = {
  market: string
  bets: number
  wins: number
  win_rate: number
  pnl: number
}

type TimePoint = {
  ts: string
  cum_pnl: number
}

export default function Portfolio() {
  const token = useAuthStore((s) => s.accessToken)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [range, setRange] = useState<'7d' | '30d' | 'ytd' | 'all'>('all')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [markets, setMarkets] = useState<MarketEntry[]>([])
  const [ts, setTs] = useState<TimePoint[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    fetchData()
  }, [token, range, isAuthenticated])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
      const resp = await fetch(`${apiBase}/portfolio?range=${range}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const txt = await resp.text()
        throw new Error(`Server error: ${resp.status} ${txt}`)
      }
      const j = await resp.json()
      setSummary(j.summary ?? null)
      setMarkets(j.markets ?? [])
      setTs(j.time_series ?? [])
    } catch (e: any) {
      console.error('Failed to fetch portfolio', e)
      setError(e.message || 'Failed to load portfolio')
    } finally {
      setLoading(false)
    }
  }

  const fmt = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))

  const trendColor = (v: number | null | undefined) => {
    if (v == null) return '#999'
    return v >= 0 ? '#2ed573' : '#ff4757'
  }

  // Small SVG sparkline for cumulative pnl
  const Sparkline = ({ points }: { points: TimePoint[] }) => {
    if (!points || points.length === 0) return <div style={{ color: '#999' }}>No timeseries</div>
    // map to coordinates
    const values = points.map((p) => p.cum_pnl)
    const xs = points.map((p) => new Date(p.ts).getTime())
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...values)
    const maxY = Math.max(...values)
    const w = 600
    const h = 140
    const pad = 8
    const scaleX = (x: number) => (maxX === minX ? w / 2 : pad + ((x - minX) / (maxX - minX)) * (w - pad * 2))
    const scaleY = (y: number) => (maxY === minY ? h / 2 : h - pad - ((y - minY) / (maxY - minY)) * (h - pad * 2))
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(xs[i])} ${scaleY(values[i])}`).join(' ')
    const last = values[values.length - 1]
    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ maxWidth: w }}>
        <defs>
          <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={trendColor(last)} stopOpacity="0.2" />
            <stop offset="100%" stopColor={trendColor(last)} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke={trendColor(last)} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        {/* area under curve */}
        <path d={`${path} L ${scaleX(xs[xs.length - 1])} ${h - pad} L ${scaleX(xs[0])} ${h - pad} Z`} fill="url(#grad)" opacity={0.9} />
        {/* x-axis */}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="rgba(255,255,255,0.06)" />
        {/* y-axis label (left) */}
        <text x={6} y={14} fill="var(--color-text-muted)" fontSize={11}>Net P&amp;L</text>
        {/* x-axis label */}
        <text x={w - 60} y={h - 4} fill="var(--color-text-muted)" fontSize={11}>Date</text>
      </svg>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="portfolio-page">
        <div className="dashboard-main">
          <h2>Portfolio</h2>
          <div style={{ color: '#999' }}>Please sign in to view your portfolio.</div>
        </div>
      </div>
    )
  }

  // Table columns for market breakdown
  const columns = [
    { key: 'market' as const, header: 'Market', align: 'left' },
    { key: 'bets' as const, header: 'Bets', align: 'right' },
    { key: 'wins' as const, header: 'Wins', align: 'right' },
    {
      key: 'win_rate' as const,
      header: 'Win Rate',
      align: 'right',
      render: (v: any) => `${(v * 100).toFixed(1)}%`,
    },
    {
      key: 'pnl' as const,
      header: 'P&L',
      align: 'right',
      render: (v: any) => (
        <span style={{ color: trendColor(v) }}>{v >= 0 ? '+' : ''}{formatCurrency(v)}</span>
      ),
    },
  ]

  return (
    <div className="portfolio-page">
      <div className="portfolio-main">
        <div className="portfolio-header">
          <div>
            <h1 className="portfolio-title">Portfolio</h1>
            <p className="dashboard-subtitle">Performance summary and market breakdown</p>
          </div>
        </div>

        {error && <div style={{ color: '#f88' }}>{error}</div>}

        <div className="summary-grid">
          <Card className="stat-card stat-card--highlight" variant="elevated">
            <div className={`stat-value ${summary && (summary.pnl_today ?? 0) >= 0 ? 'positive' : 'negative'}`}>
              {summary ? ((summary.pnl_today ?? 0) >= 0 ? '+' : '') + formatCurrency(summary?.pnl_today ?? 0) : '—'}
            </div>
            <div className="stat-label">Today's P&L</div>
          </Card>

          <Card className="stat-card" variant="elevated">
            <div className="stat-value" style={{ color: '#9aa6ad' }}>{summary ? summary.total_bets : '—'}</div>
            <div className="stat-label">Total Bets</div>
          </Card>

          <Card className="stat-card" variant="elevated">
            <div className="stat-value">{summary ? formatCurrency(summary.total_wagered) : '—'}</div>
            <div className="stat-label">Total Wagered</div>
          </Card>

          <Card className="stat-card" variant="elevated">
            <div className="stat-value">{summary ? formatCurrency(summary.active_wager_risk ?? 0) : '—'}</div>
            <div className="stat-label">Active Wager Risk</div>
          </Card>

          <Card className="stat-card" variant="elevated">
            <div className="stat-value">{summary ? formatCurrency(summary.total_winnings) : '—'}</div>
            <div className="stat-label">Total Winnings</div>
          </Card>

          <Card className="stat-card stat-card--highlight" variant="elevated">
            <div className={`stat-value ${summary && summary.net_pnl >= 0 ? 'positive' : 'negative'}`}>
              {summary ? (summary.net_pnl >= 0 ? '+' : '') + formatCurrency(summary.net_pnl) : '—'}
            </div>
            <div className="stat-label">Net P&L</div>
          </Card>

          <Card className="stat-card" variant="elevated">
            <div className="stat-value">{summary && summary.roi != null ? (summary.roi * 100).toFixed(2) + '%' : '—'}</div>
            <div className="stat-label">ROI</div>
          </Card>
        </div>

        <Card title={<span style={{fontSize: '1.4rem', fontWeight: 600}}>Performance Over Time</span>} className="graph-card" variant="default">
          <div className="graph-top">
            <div style={{ fontSize: '0.95rem', color: 'var(--color-text-muted)' }}>Cumulative Net P&L</div>
            <div className="range-controls">
              <button className={`range-btn ${range === '7d' ? 'active' : ''}`} onClick={() => setRange('7d')}>7d</button>
              <button className={`range-btn ${range === '30d' ? 'active' : ''}`} onClick={() => setRange('30d')}>30d</button>
              <button className={`range-btn ${range === 'ytd' ? 'active' : ''}`} onClick={() => setRange('ytd')}>YTD</button>
              <button className={`range-btn ${range === 'all' ? 'active' : ''}`} onClick={() => setRange('all')}>ALL</button>
            </div>
          </div>
          <div style={{ width: '100%', overflow: 'hidden' }}>
            <Sparkline points={ts} />
          </div>
        </Card>

        <Card title={<span style={{fontSize: '1.4rem', fontWeight: 600}}>Market Breakdown</span>} className="market-card" variant="default">
          <Table data={markets} columns={columns as any} rowKey={'market'} isEmpty={markets.length === 0} />
        </Card>

      </div>
    </div>
  )
}

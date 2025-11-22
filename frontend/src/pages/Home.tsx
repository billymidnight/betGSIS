import React, { useEffect, useState } from 'react'
import './Home.css'
import { fetchMyBets } from '../lib/api/api'
import { americanToDecimal, formatCurrency } from '../lib/format'

export default function Home() {
  const [todaysBets, setTodaysBets] = useState<number | null>(null)
  const [pnl24h, setPnl24h] = useState<number | null>(null)
  const [slides, setSlides] = useState<string[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    // fetch user bets and compute metrics
    const doFetch = async () => {
      try {
        const bets = await fetchMyBets()
        if (!bets || !Array.isArray(bets)) {
          setTodaysBets(0)
          setPnl24h(0)
          return
        }

        const now = new Date()
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const last24 = Date.now() - 24 * 3600 * 1000

        let todays = 0
        let pnl24 = 0

        for (const b of bets) {
          const placed = b.placed_at ? new Date(b.placed_at) : null
          if (placed) {
            // count today's bets (local date match)
            if (placed >= startOfToday) todays += 1
            // compute pnl for settled bets in last 24h
            const placedTs = placed.getTime()
            const status = (b.result || '').toString().toLowerCase()
            if (placedTs >= last24 && status) {
              if (status === 'win') {
                // determine decimal odds
                let dec: number | null = null
                if (b.odds_decimal || b.odds_decimal === 0) dec = Number(b.odds_decimal)
                else if (b.decimal_odds || b.odds_decimal) dec = Number(b.decimal_odds || b.odds_decimal)
                else if (b.odds_american || b.odds) {
                  const raw = String(b.odds_american ?? b.odds ?? '')
                  const num = parseInt(raw.replace('+', ''), 10)
                  if (!Number.isNaN(num)) dec = americanToDecimal(num)
                }
                const stake = Number(b.bet_size ?? b.stake ?? 0) || 0
                if (dec && !Number.isNaN(dec)) pnl24 += stake * (Number(dec) - 1.0)
              } else if (status === 'loss') {
                const stake = Number(b.bet_size ?? b.stake ?? 0) || 0
                pnl24 += -stake
              }
            }
          }
        }

        setTodaysBets(todays)
        setPnl24h(Number(pnl24))
      } catch (e) {
        setTodaysBets(0)
        setPnl24h(0)
      }
    }
    doFetch()
  }, [])

  useEffect(() => {
    // attempt to load a slideshow manifest; fallback to attempt slide1..slide6
    const load = async () => {
      try {
        const resp = await fetch('/assets/slideshow/manifest.json')
        if (resp.ok) {
          const j = await resp.json()
          if (Array.isArray(j) && j.length > 0) {
            setSlides(j.map((p: string) => `/assets/slideshow/${p}`))
            return
          }
        }
      } catch (e) {
        // ignore and fallback
      }

      // fallback: try common filenames slide1..slide6 with common extensions
      const candidates: string[] = []
      const names = ['slide1','slide2','slide3','slide4','slide5','slide6']
      const exts = ['.jpg','.png','.jpeg','.webp']
      const ok: string[] = []
      for (const n of names) {
        for (const e of exts) {
          const p = `/assets/slideshow/${n}${e}`
          // quick existence check by loading image
          try {
            // eslint-disable-next-line no-await-in-loop
            const img = await new Promise<HTMLImageElement>((res, rej) => {
              const im = new Image()
              im.onload = () => res(im)
              im.onerror = () => rej(new Error('not found'))
              im.src = p
            })
            if (img) {
              ok.push(p)
              break
            }
          } catch {
            // not found
          }
        }
      }
      setSlides(ok)
    }
    load()
  }, [])

  // slideshow rotation
  useEffect(() => {
    if (!slides || slides.length === 0) return
    const iv = setInterval(() => setIdx((i) => (i + 1) % slides.length), 4000)
    return () => clearInterval(iv)
  }, [slides])

  return (
    <div className="home-page">
      <div className="dashboard-header">
        <div className="dashboard-title-section">
          <h1 className="dashboard-title">Home</h1>
        </div>
      </div>
      <div className="home-top">
        <div className="home-metric">
          <div className="home-metric-label">Today's Bets</div>
          <div className="home-metric-value">{todaysBets == null ? '—' : todaysBets}</div>
        </div>
        <div className="home-metric">
          <div className="home-metric-label">P&L Last 24 Hours</div>
          <div className={`home-metric-value ${pnl24h != null && pnl24h >= 0 ? 'positive' : 'negative'}`}>
            {pnl24h == null ? '—' : (pnl24h >= 0 ? '+' : '-') + formatCurrency(Math.abs(pnl24h))}
          </div>
        </div>
      </div>

      <div className="home-body">
        {slides && slides.length > 0 ? (
          <div className="slideshow">
            <img src={slides[idx]} alt={`slide-${idx}`} className="slideshow-img" />
          </div>
        ) : (
          <div className="slideshow-empty">No slideshow images found in <code>/assets/slideshow/</code></div>
        )}
      </div>

      <div className="home-quote">"Always bet GSIS to make the final and lose" – Boobalan</div>
    </div>
  )
}

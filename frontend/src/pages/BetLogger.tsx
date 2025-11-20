import React, { useEffect, useState } from 'react'
import { fetchRecentBets as fetchMockRecent } from '../lib/api/mockApi'
import './Bets.css'

export default function BetLogger() {
  const [bets, setBets] = useState<any[]>([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const b = await fetchMockRecent(50)
        if (mounted) setBets(b)
      } catch (e) {
        console.error(e)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="bets-page">
      <div className="bets-main">
        <h2>Bet Logger (Book)</h2>
        <div className="bets-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Selections</th>
                <th>Stake</th>
                <th>Potential</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bets.map((b) => (
                <tr key={b.id}>
                  <td>{b.id}</td>
                  <td>{b.selections?.map((s:any)=>s.playerName).join(', ')}</td>
                  <td>{b.stake}</td>
                  <td>{b.potentialPayout}</td>
                  <td>{b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

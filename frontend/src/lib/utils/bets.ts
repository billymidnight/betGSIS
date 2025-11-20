// Small utilities to parse outcome strings and format timestamps for Bets UI

export function parseOutcome(outcome: string) {
  // Returns { playerName, countryName, marketType, marketDisplay }
  if (!outcome || typeof outcome !== 'string') return { playerName: null, countryName: null, marketType: 'special', marketDisplay: outcome };

  // Examples formats we expect:
  // "Player: Over 15500 Points"
  // "Player: First Round - Over 2400 Points"
  // "Country: To Appear - YES"

  // Try Country / To Appear first
  const toAppearMatch = outcome.match(/^(.+):\s*To Appear\s*-\s*(YES|NO)$/i);
  if (toAppearMatch) {
    return { playerName: null, countryName: toAppearMatch[1].trim(), marketType: 'country-props', marketDisplay: `To Appear - ${toAppearMatch[2].toUpperCase()}` };
  }

  // First/Last round
  const firstLastMatch = outcome.match(/^(.+):\s*(First Round|Last Round)\s*-\s*(Over|Under)\s*(\d+)?\s*Points$/i);
  if (firstLastMatch) {
    const name = firstLastMatch[1].trim();
    const round = firstLastMatch[2];
    const side = firstLastMatch[3];
    const pts = firstLastMatch[4] || '';
    return { playerName: name, countryName: null, marketType: 'first-last', marketDisplay: `${round} - ${side} ${pts} Points` };
  }

  // Totals default
  const totalsMatch = outcome.match(/^(.+):\s*(Over|Under)\s*(\d+)?\s*Points$/i);
  if (totalsMatch) {
    const name = totalsMatch[1].trim();
    const side = totalsMatch[2];
    const pts = totalsMatch[3] || '';
    return { playerName: name, countryName: null, marketType: 'totals', marketDisplay: `${side} ${pts} Points` };
  }

  // Fallback: return the raw outcome as a specials market
  return { playerName: null, countryName: null, marketType: 'special', marketDisplay: outcome };
}

export function formatTimestampUTC(ts: string | number | null) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    // ISO + nicer spacing and explicit UTC label
    return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
  } catch (e) {
    return String(ts);
  }
}

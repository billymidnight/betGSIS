"""
GS Poker Bot — Heads-up AI opponent for Good Shepherd Poker.

Pure math bot — no external API needed. With only 16 cards, the bot computes
EXACT equity against all possible opponent hole cards on every decision.

Strategy layers:
  1. Equity calculation: iterate all possible opponent hands × remaining boards
  2. Pot odds: compare equity to pot odds for call decisions
  3. Bet sizing: scale with hand strength
  4. Randomization: mix in occasional bluffs and slowplays to avoid predictability
"""

import random
from itertools import combinations
from gs_poker_engine import evaluate_hand, compare_hands

# Bot user ID — a fixed UUID that represents the bot
BOT_USER_ID = '00000000-0000-0000-0000-0000000000b0'
BOT_SCREENNAME = 'GS Bot'


def compute_equity(my_hole: list[dict], community: list[dict], all_cards: list[dict]) -> float:
    """
    Compute exact equity (win probability) for my_hole against ALL possible opponent hands.

    Iterates every possible opponent hole (from remaining cards) and every possible board
    runout, returning exact win percentage.
    """
    used_ids = {c['character_id'] for c in my_hole + community}
    remaining = [c for c in all_cards if c['character_id'] not in used_ids]

    if len(remaining) < 2:
        return 0.5

    community_needed = 2 - len(community)
    wins = 0
    losses = 0
    ties = 0
    total = 0

    # All possible opponent hole cards
    for opp_hole in combinations(remaining, 2):
        opp_ids = {c['character_id'] for c in opp_hole}
        board_pool = [c for c in remaining if c['character_id'] not in opp_ids]

        if community_needed == 0:
            # All community cards known — just evaluate
            my_hand = evaluate_hand(list(my_hole) + list(community))
            opp_hand = evaluate_hand(list(opp_hole) + list(community))
            cmp = compare_hands(my_hand, opp_hand)
            if cmp > 0:
                wins += 1
            elif cmp < 0:
                losses += 1
            else:
                ties += 1
            total += 1
        else:
            # Iterate all possible remaining board cards
            for board_cards in combinations(board_pool, community_needed):
                full_community = list(community) + list(board_cards)
                my_hand = evaluate_hand(list(my_hole) + full_community)
                opp_hand = evaluate_hand(list(opp_hole) + full_community)
                cmp = compare_hands(my_hand, opp_hand)
                if cmp > 0:
                    wins += 1
                elif cmp < 0:
                    losses += 1
                else:
                    ties += 1
                total += 1

    if total == 0:
        return 0.5
    return (wins + ties * 0.5) / total


def _read_opponent_aggression(state: dict, bot_seat_num: int) -> dict:
    """
    Analyze opponent's betting actions this hand to gauge aggression.
    Returns dict with:
      - raises: number of raises/bets by opponent this hand
      - calls: number of calls
      - checks: number of checks
      - aggression: float 0-1 (higher = more aggressive)
      - big_bet: bool — did opponent make a bet > 50% pot?
      - overbets: bool — did opponent bet > pot?
    """
    actions = state.get('actions', [])
    pot = state.get('pot', 1)
    street = state.get('street', '')
    raises = 0
    calls = 0
    checks = 0
    big_bet = False
    overbet = False

    for a in actions:
        if a.get('seat') == bot_seat_num:
            continue  # skip bot's own actions
        t = a.get('type', '')
        amt = a.get('amount', 0)
        if t in ('raise', 'all_in'):
            raises += 1
            if pot > 0 and amt > pot * 0.5:
                big_bet = True
            if pot > 0 and amt > pot:
                overbet = True
        elif t == 'call':
            calls += 1
        elif t == 'check':
            checks += 1

    total_actions = raises + calls + checks
    aggression = raises / total_actions if total_actions > 0 else 0.3

    return {
        'raises': raises,
        'calls': calls,
        'checks': checks,
        'aggression': aggression,
        'big_bet': big_bet,
        'overbet': overbet,
    }


def bot_decide(state: dict, all_cards: list[dict]) -> dict:
    """
    Given the current game state, decide the bot's action.

    Returns: {'action_type': str, 'amount': int|None}

    Strategy:
    - Compute exact equity against all possible opponent hands
    - Read opponent's betting actions (aggression, bet sizing) to adjust ranges
    - Use pot odds + equity for mathematically sound decisions
    - Bluff and slowplay with controlled randomization
    """
    seats = state.get('seats', {})
    bot_seat = None
    for sn, sd in seats.items():
        if sd.get('user_id') == BOT_USER_ID:
            bot_seat = sn
            break

    if bot_seat is None:
        return {'action_type': 'check', 'amount': None}

    sd = seats[bot_seat]
    my_stack = sd['stack']
    my_street_bet = sd.get('current_street_bet', 0)
    current_bet = state.get('current_bet', 0)
    pot = state.get('pot', 0)
    bb = state.get('big_blind', 2)
    to_call = current_bet - my_street_bet
    street = state.get('street', 'preflop')

    # Build my hole cards
    card_map = {c['character_id']: c for c in all_cards}
    my_hole = [card_map[cid] for cid in sd.get('hole_cards', []) if cid in card_map]

    # Build community cards
    community_revealed = state.get('community_revealed', 0)
    community_ids = state.get('community', [])[:community_revealed]
    community = [card_map[cid] for cid in community_ids if cid in card_map]

    # Compute exact equity
    equity = compute_equity(my_hole, community, all_cards)

    # Read opponent's actions to adjust play
    opp = _read_opponent_aggression(state, int(bot_seat))

    # Adjust equity threshold based on opponent aggression:
    # If opponent is betting big/often, they likely have a strong hand — tighten up
    # If opponent is passive (checking/calling), they're likely weak — be more aggressive
    aggro_adj = 0.0
    if opp['overbet']:
        aggro_adj = 0.12  # opponent overbetting → they're strong or bluffing, need stronger hand to continue
    elif opp['big_bet']:
        aggro_adj = 0.07
    elif opp['aggression'] > 0.6:
        aggro_adj = 0.05
    elif opp['aggression'] < 0.2 and opp['checks'] > 0:
        aggro_adj = -0.08  # opponent passive → we can bluff/value bet more

    # Pot odds: what fraction of pot do we need to win to justify calling?
    pot_after_call = pot + to_call
    pot_odds = to_call / pot_after_call if pot_after_call > 0 and to_call > 0 else 0

    # Randomization seed for this decision
    r = random.random()

    # ── PREFLOP STRATEGY ──
    if street == 'preflop':
        if to_call <= 0:
            # No bet facing us (we're BB or everyone limped)
            if equity > 0.65:
                # Strong hand — raise
                raise_size = min(bb * random.choice([3, 4, 5]), my_stack + my_street_bet)
                return {'action_type': 'raise', 'amount': raise_size}
            elif equity > 0.45:
                # Medium — check or small raise
                if r < 0.3:
                    raise_size = min(bb * 3, my_stack + my_street_bet)
                    return {'action_type': 'raise', 'amount': raise_size}
                return {'action_type': 'check', 'amount': None}
            else:
                # Weak — check
                return {'action_type': 'check', 'amount': None}
        else:
            # Facing a raise
            if equity > 0.70:
                # Strong — re-raise
                reraise = min(current_bet * random.choice([2, 3]), my_stack + my_street_bet)
                if reraise > current_bet:
                    return {'action_type': 'raise', 'amount': reraise}
                return {'action_type': 'call', 'amount': None}
            elif equity > 0.45 or (equity > pot_odds + 0.05):
                # Decent odds — call
                if to_call <= my_stack:
                    return {'action_type': 'call', 'amount': None}
                return {'action_type': 'all_in', 'amount': None}
            else:
                # Weak — fold (but bluff-call occasionally)
                if r < 0.12:
                    return {'action_type': 'call', 'amount': None}
                return {'action_type': 'fold', 'amount': None}

    # ── POST-FLOP STRATEGY (adjusted by opponent reads) ──
    # Thresholds shift up when opponent is aggressive (need stronger hand)
    # Thresholds shift down when opponent is passive (can bluff more)
    strong_th = 0.72 + aggro_adj
    medium_th = 0.55 + aggro_adj
    weak_th = 0.35 + aggro_adj
    bluff_rate = max(0.03, 0.15 - opp['aggression'] * 0.2)  # bluff less vs aggressive opponents

    if to_call <= 0:
        # We can check or bet
        if equity > strong_th:
            # Strong — bet for value (size up vs passive, down vs aggressive)
            bet_frac = random.choice([0.5, 0.6, 0.75]) if opp['aggression'] < 0.5 else random.choice([0.35, 0.45, 0.55])
            bet_size = max(bb, int(pot * bet_frac))
            bet_total = min(bet_size + my_street_bet, my_stack + my_street_bet)
            if bet_total > my_street_bet:
                return {'action_type': 'raise', 'amount': bet_total}
            return {'action_type': 'check', 'amount': None}
        elif equity > medium_th:
            # Medium — bet sometimes (more vs passive opponents)
            bet_prob = 0.55 if opp['aggression'] < 0.3 else 0.3
            if r < bet_prob:
                bet_size = max(bb, int(pot * 0.4))
                bet_total = min(bet_size + my_street_bet, my_stack + my_street_bet)
                if bet_total > my_street_bet:
                    return {'action_type': 'raise', 'amount': bet_total}
            return {'action_type': 'check', 'amount': None}
        elif equity > weak_th:
            # Weak-medium — mostly check, bluff occasionally
            if r < bluff_rate:
                bet_size = max(bb, int(pot * 0.5))
                bet_total = min(bet_size + my_street_bet, my_stack + my_street_bet)
                if bet_total > my_street_bet:
                    return {'action_type': 'raise', 'amount': bet_total}
            return {'action_type': 'check', 'amount': None}
        else:
            # Very weak — check (rare bluff, especially vs passive)
            if r < bluff_rate * 0.5:
                bet_size = max(bb, int(pot * 0.6))
                bet_total = min(bet_size + my_street_bet, my_stack + my_street_bet)
                if bet_total > my_street_bet:
                    return {'action_type': 'raise', 'amount': bet_total}
            return {'action_type': 'check', 'amount': None}
    else:
        # Facing a bet — call, raise, or fold
        # Adjust: vs aggressive opponent who bets big, they're polarized (strong or bluff)
        # → need stronger hand to continue, but also consider they could be bluffing
        hero_call_rate = 0.06 if opp['aggression'] < 0.5 else 0.12  # hero call more vs aggro

        if equity > strong_th:
            # Strong — raise (but slowplay more vs aggressive opponents who might barrel)
            raise_prob = 0.4 if opp['aggression'] > 0.5 else 0.65
            if r < raise_prob:
                reraise = min(int(current_bet * random.choice([2, 2.5])), my_stack + my_street_bet)
                if reraise > current_bet:
                    return {'action_type': 'raise', 'amount': reraise}
            # Slow play — just call
            if to_call <= my_stack:
                return {'action_type': 'call', 'amount': None}
            return {'action_type': 'all_in', 'amount': None}
        elif equity > pot_odds + 0.08 + aggro_adj * 0.5:
            # Positive EV call (need more equity vs aggressive opponents)
            if to_call <= my_stack:
                return {'action_type': 'call', 'amount': None}
            if equity > 0.45:
                return {'action_type': 'all_in', 'amount': None}
            return {'action_type': 'fold', 'amount': None}
        elif equity > pot_odds:
            # Marginal — call sometimes (less vs aggressive)
            call_prob = 0.35 if opp['aggression'] > 0.5 else 0.55
            if r < call_prob:
                if to_call <= my_stack:
                    return {'action_type': 'call', 'amount': None}
            return {'action_type': 'fold', 'amount': None}
        else:
            # Bad odds — fold (hero call rate based on opponent tendencies)
            if r < hero_call_rate and equity > 0.28:
                if to_call <= my_stack:
                    return {'action_type': 'call', 'amount': None}
            return {'action_type': 'fold', 'amount': None}

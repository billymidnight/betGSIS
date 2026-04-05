"""
GS Poker Engine — Pure-logic module for Good Shepherd Poker.
No Flask, no DB. Just card evaluation, hand comparison, and game-flow helpers.

16-card deck from goodshepherd_trading table.
Hand = 4 cards (2 hole + 2 community).
Rankings (low→high):
  1 High Card, 2 Pair, 3 Trips, 4 Boat (two-pair), 5 Quads,
  6 Flush, 7 Straight, 8 The 404
"""

import random
from collections import Counter


# ---------------------------------------------------------------------------
# Deck
# ---------------------------------------------------------------------------

def shuffle_deck(characters: list[dict]) -> list[dict]:
    """Shuffle and return the 16-card deck."""
    deck = list(characters)
    random.shuffle(deck)
    return deck


# ---------------------------------------------------------------------------
# Hand evaluation
# ---------------------------------------------------------------------------

def evaluate_hand(cards: list[dict]) -> tuple[int, list]:
    """
    Evaluate a 4-card hand.

    Returns (rank, tiebreaker_list).
      rank: 1=high card, 2=pair, 3=trips, 4=boat(two-pair), 5=quads,
            6=flush, 7=straight, 8=the404
      tiebreaker_list: heights sorted descending (details vary per rank).

    Card dict must have: sport, house, height (numeric), was_404, year_joined.
    """
    heights = sorted([float(c['height']) for c in cards], reverse=True)

    # --- The 404 (all four was_404 == True) ---
    if all(c.get('was_404') for c in cards):
        return (8, heights)

    # --- Straight (4 consecutive year_joined, no wrap) ---
    years = sorted(int(c['year_joined']) for c in cards)
    is_straight = (len(set(years)) == 4 and years[-1] - years[0] == 3)
    if is_straight:
        # tiebreaker: max year first, then heights desc
        return (7, [years[-1]] + heights)

    # --- Flush (all 4 same house) ---
    houses = [c.get('house') for c in cards]
    if len(set(houses)) == 1:
        return (6, heights)

    # --- Sport-based groupings (pair / trips / quads / boat) ---
    sports = [c.get('sport') for c in cards]
    sport_counts = Counter(sports)
    counts_sorted = sorted(sport_counts.values(), reverse=True)

    if counts_sorted[0] == 4:
        # Quads
        return (5, heights)

    if counts_sorted == [2, 2]:
        # Boat (two-pair)
        return (4, heights)

    if counts_sorted[0] == 3:
        # Trips
        return (3, heights)

    if counts_sorted[0] == 2:
        # One Pair — put paired-card heights first, then kickers
        paired_sport = [s for s, c in sport_counts.items() if c == 2][0]
        pair_heights = sorted(
            [float(c['height']) for c in cards if c.get('sport') == paired_sport],
            reverse=True,
        )
        kicker_heights = sorted(
            [float(c['height']) for c in cards if c.get('sport') != paired_sport],
            reverse=True,
        )
        return (2, pair_heights + kicker_heights)

    # --- High Card ---
    return (1, heights)


# ---------------------------------------------------------------------------
# Comparison helpers
# ---------------------------------------------------------------------------

def compare_hands(hand_a: tuple, hand_b: tuple) -> int:
    """
    Compare two evaluated hands (rank, tiebreaker_list).
    Returns  1 if a wins, -1 if b wins, 0 if tie.
    """
    if hand_a[0] != hand_b[0]:
        return 1 if hand_a[0] > hand_b[0] else -1
    # Same rank — compare tiebreakers element by element
    for va, vb in zip(hand_a[1], hand_b[1]):
        if va != vb:
            return 1 if va > vb else -1
    return 0


def rank_name(rank: int) -> str:
    """Human-readable name for a rank number."""
    names = {
        1: 'High Card',
        2: 'One Pair',
        3: 'Trips',
        4: 'Boat',
        5: 'Quads',
        6: 'Flush',
        7: 'Straight',
        8: 'The 404',
    }
    return names.get(rank, 'Unknown')


def determine_winner(players_hands: list[tuple[int, tuple]]) -> list[int]:
    """
    Given list of (seat, hand_eval), return list of winning seat numbers.
    Can be multiple seats for a chop (tie).
    """
    if not players_hands:
        return []
    # Find the best hand
    best = players_hands[0]
    for ph in players_hands[1:]:
        if compare_hands(ph[1], best[1]) > 0:
            best = ph
    # Collect all seats that tie with the best
    winners = [seat for seat, hand in players_hands if compare_hands(hand, best[1]) == 0]
    return winners


# ---------------------------------------------------------------------------
# Game-flow helpers
# ---------------------------------------------------------------------------

def get_next_actor(seats: list[dict], current_seat: int, dealer_seat: int) -> int | None:
    """
    Get the next seat to act after current_seat.

    seats: list of dicts with keys:
        seat_number, status ('active'|'folded'|'all_in'), current_street_bet, has_acted
    Only seats with status == 'active' can act.

    Returns seat_number of next actor, or None if no one left to act.
    We iterate clockwise from current_seat+1, wrapping around.
    A player who has not yet acted, or who has acted but owes more chips, can act.
    """
    active = [s for s in seats if s['status'] == 'active']
    if not active:
        return None

    seat_numbers = sorted(s['seat_number'] for s in seats if s['status'] in ('active', 'all_in'))
    active_numbers = sorted(s['seat_number'] for s in active)
    if not active_numbers:
        return None

    # All seat numbers in the game (including folded) for positional reference
    all_seat_numbers = sorted(s['seat_number'] for s in seats)
    n_all = len(all_seat_numbers)
    if n_all == 0:
        return None

    # Current bet on the street
    max_bet = max(s['current_street_bet'] for s in seats)

    # Find position of current_seat in the full ring, then scan clockwise
    if current_seat in all_seat_numbers:
        start_idx = all_seat_numbers.index(current_seat)
    else:
        start_idx = 0

    for i in range(1, n_all + 1):
        candidate = all_seat_numbers[(start_idx + i) % n_all]
        if candidate not in active_numbers:
            continue
        cand_data = next(s for s in seats if s['seat_number'] == candidate)
        # Needs to act if: hasn't acted yet, or owes chips
        if not cand_data['has_acted'] or cand_data['current_street_bet'] < max_bet:
            return candidate

    return None


def calculate_pot(actions: list[dict]) -> int:
    """Calculate total pot from action list."""
    return sum(a.get('amount', 0) for a in actions)

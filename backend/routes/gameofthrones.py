"""
Game of Thrones trading game routes — clone of the Harry Potter
trading game, retargeted at the GoT character / house / king columns.
Mirrors all pricing math (vig, combinatorial odds), settle logic,
chop logic, and bets-table integration exactly.
"""
from flask import Blueprint, jsonify, request
from database.supabase_client import get_supabase_client
from utils.chop import build_session_bet_rows  # type: ignore
import random
from typing import List, Dict
import math
from itertools import combinations

gameofthrones_bp = Blueprint('gameofthrones', __name__, url_prefix='/api/trading/gameofthrones')

# Constants
VIG_MARGIN = 0.03  # 3% vig
SPECIALS_VIG_MARGIN = 0.045  # 4.5% vig for special markets

# Get supabase client
supabase = get_supabase_client()


def get_gameofthrones_settings() -> Dict:
    """Fetch settings from gameofthrones_settings table"""
    try:
        response = supabase.table('gameofthrones_settings').select('setting, value').execute()
        settings_rows = response.data or []
        settings = {}
        for row in settings_rows:
            settings[row['setting']] = row['value']
        return settings
    except Exception:
        # Fallback to defaults if table doesn't exist or query fails
        return {
            'card_count': '3',
            'time': '120',
            'card_nature': 'static'
        }


def decimal_to_american(decimal_odds: float) -> int:
    """Convert decimal odds to American odds with bookie-favorable rounding
    
    Rounding rules (always in bookie's favor):
    - Between ±300 and ±1000: round to nearest 10
    - Between ±1000 and ±10000: round to nearest 100
    - Positive odds: floor (round down)
    - Negative odds: ceiling abs value (round up in absolute value, more negative)
    """
    if decimal_odds >= 2.0:
        american = int((decimal_odds - 1) * 100)
    else:
        american = int(-100 / (decimal_odds - 1))
    
    abs_odds = abs(american)
    
    # Apply rounding based on magnitude
    if 300 <= abs_odds < 1000:
        # Round to nearest 10
        if american > 0:
            # Positive: floor to nearest 10
            american = (american // 10) * 10
        else:
            # Negative: ceiling abs value to nearest 10 (more negative)
            american = -((abs(american) + 9) // 10) * 10
    elif 1000 <= abs_odds < 10000:
        # Round to nearest 100
        if american > 0:
            # Positive: floor to nearest 100
            american = (american // 100) * 100
        else:
            # Negative: ceiling abs value to nearest 100 (more negative)
            american = -((abs(american) + 99) // 100) * 100
    
    return american


def apply_vig(probability: float, margin: float = VIG_MARGIN) -> float:
    """Apply vigorish with asymmetric margin - more vig on underdogs, base margin on favorites"""
    distance_from_evens = abs(probability - 0.5)
    
    if probability < 0.5:
        # Underdog: add extra margin
        extra_margin = distance_from_evens * 0.4
        adjusted_margin = margin + extra_margin
    else:
        # Favorite: keep base margin
        adjusted_margin = margin
    
    # Ensure margin stays reasonable (between 1% and 8%)
    adjusted_margin = max(0.01, min(0.08, adjusted_margin))
    
    # Apply vig
    vigged_prob = probability / (1.0 - adjusted_margin)
    vigged_prob = min(vigged_prob, 0.9999)
    
    # Convert to decimal odds
    decimal_odds = 1.0 / vigged_prob if vigged_prob > 0 else 100.0
    return decimal_odds


@gameofthrones_bp.route('/characters', methods=['GET'])
def get_characters():
    """Get all Game of Thrones characters"""
    try:
        response = supabase.table('gameofthrones_trading').select('*').execute()
        return jsonify({
            'success': True,
            'characters': response.data
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@gameofthrones_bp.route('/draw', methods=['POST'])
def create_draw():
    """Create a new draw of random characters based on settings"""
    try:
        # Fetch settings
        settings = get_gameofthrones_settings()
        card_nature = settings.get('card_nature', 'static')
        card_count_setting = int(settings.get('card_count', '3'))
        
        # Determine number of cards to draw
        if card_nature == 'random':
            num_cards = random.choice([2, 3, 4])
        else:
            num_cards = card_count_setting
        
        # Get all characters
        response = supabase.table('gameofthrones_trading').select('*').execute()
        characters = response.data
        
        if len(characters) < num_cards:
            return jsonify({
                'success': False,
                'error': 'Not enough characters in database'
            }), 400

        # Shuffle the deck explicitly (was random.sample) so we can print
        # the top of the shuffle to the Flask terminal — operator sanity
        # check on what's about to be dealt this round.
        from utils.deck_debug import print_top_of_deck
        deck = list(characters)
        random.shuffle(deck)
        print_top_of_deck(deck, 'GAME OF THRONES')
        drawn = deck[:num_cards]

        return jsonify({
            'success': True,
            'draw': drawn,
            'num_cards': num_cards,
            'draw_id': f"draw_{random.randint(100000, 999999)}"
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@gameofthrones_bp.route('/markets', methods=['POST'])
def get_markets():
    """Get general markets (placeholder for now - Game of Thrones uses character markets)"""
    try:
        return jsonify({
            'success': True,
            'markets': []  # Empty for now - Game of Thrones focuses on character markets
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@gameofthrones_bp.route('/character-markets', methods=['POST'])
def get_character_markets():
    """Get character drawn/not drawn markets with dynamic odds"""
    try:
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all characters
        response = supabase.table('gameofthrones_trading').select('*').execute()
        all_characters = response.data
        n = len(all_characters)
        
        # Sample 4 random characters for markets
        sampled_characters = random.sample(all_characters, min(4, n))
        
        character_markets = []
        
        for char in sampled_characters:
            char_id = char['character_id']
            char_name = char['name']
            
            # Probability of being drawn
            prob_drawn = num_cards / n
            prob_not_drawn = 1.0 - prob_drawn
            
            # Apply vig
            odds_drawn = apply_vig(prob_drawn)
            odds_not_drawn = apply_vig(prob_not_drawn)
            
            character_markets.append({
                'character_id': char_id,
                'character_name': char_name,
                'drawn': {
                    'market_id': f'char_{char_id}_drawn',
                    'market_type': 'character_drawn',
                    'text_on_screen': f'{char_name} - Drawn',
                    'odds_decimal': round(odds_drawn, 2),
                    'odds_american': decimal_to_american(odds_drawn),
                    'probability': round(prob_drawn * 100, 1)
                },
                'not_drawn': {
                    'market_id': f'char_{char_id}_not_drawn',
                    'market_type': 'character_not_drawn',
                    'text_on_screen': f'{char_name} - Not Drawn',
                    'odds_decimal': round(odds_not_drawn, 2),
                    'odds_american': decimal_to_american(odds_not_drawn),
                    'probability': round(prob_not_drawn * 100, 1)
                }
            })
        
        return jsonify({
            'success': True,
            'character_markets': character_markets
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@gameofthrones_bp.route('/house-markets', methods=['POST'])
def get_house_markets():
    """Get house drawn/not drawn markets for a WEIGHTED-RANDOM SAMPLE of 3
    houses (weights = roster size, so Stark/Lannister surface more often
    than Baelish/Frey). Houses with zero members are excluded entirely."""
    try:
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        sample_size = int(request.json.get('sample_size', 3)) if request.json else 3

        response = supabase.table('gameofthrones_trading').select('*').execute()
        characters = response.data
        n = len(characters)

        # GoT great houses + Baelish (a "house of one"). Houses with no
        # members get filtered out before sampling.
        all_houses = ['Stark', 'Lannister', 'Targaryen', 'Baratheon', 'Tyrell',
                      'Martell', 'Bolton', 'Frey', 'Arryn', 'Baelish', 'Greyjoy']

        # Roster sizes → weights. Houses with zero members are dropped.
        house_sizes = {h: sum(1 for c in characters if c.get('house') == h) for h in all_houses}
        eligible = [(h, sz) for h, sz in house_sizes.items() if sz > 0]

        # Weighted sampling WITHOUT replacement (roulette wheel — pick one
        # by weight, remove from pool, renormalise, repeat). Larger
        # families are picked more often but never twice in the same round.
        sampled_houses: List[str] = []
        remaining = list(eligible)
        k = min(sample_size, len(remaining))
        for _ in range(k):
            total_weight = sum(w for _, w in remaining)
            if total_weight <= 0:
                break
            r = random.uniform(0, total_weight)
            cum = 0.0
            for i, (house_name, w) in enumerate(remaining):
                cum += w
                if cum >= r:
                    sampled_houses.append(house_name)
                    remaining.pop(i)
                    break

        house_markets = []
        for house in sampled_houses:
            num_in_house = house_sizes[house]
            num_not_in_house = n - num_in_house
            
            # Probability at least one member of this house is drawn
            # P(at least one) = 1 - P(none)
            # P(none) = C(num_not_in_house, num_cards) / C(n, num_cards)
            
            if num_not_in_house >= num_cards:
                prob_none = math.comb(num_not_in_house, num_cards) / math.comb(n, num_cards)
                prob_drawn = 1.0 - prob_none
            else:
                prob_drawn = 1.0
            
            prob_not_drawn = 1.0 - prob_drawn
            
            # Apply vig
            odds_drawn = apply_vig(prob_drawn)
            odds_not_drawn = apply_vig(prob_not_drawn)
            
            house_slug = house.lower().replace(' ', '_')
            
            house_markets.append({
                'house_name': house,
                'house_size': num_in_house,
                'drawn': {
                    'market_id': f"house_{house_slug}_drawn",
                    'name': f"{house} Drawn",
                    'text_on_screen': f"{house} Drawn",
                    'odds_decimal': round(odds_drawn, 2),
                    'odds_american': decimal_to_american(odds_drawn),
                    'probability': round(prob_drawn * 100, 1)
                },
                'not_drawn': {
                    'market_id': f"house_{house_slug}_not_drawn",
                    'name': f"{house} Not Drawn",
                    'text_on_screen': f"{house} Not Drawn",
                    'odds_decimal': round(odds_not_drawn, 2),
                    'odds_american': decimal_to_american(odds_not_drawn),
                    'probability': round(prob_not_drawn * 100, 1)
                }
            })
        
        return jsonify({
            'success': True,
            'crew_markets': house_markets
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@gameofthrones_bp.route('/special-markets', methods=['POST'])
def get_special_markets():
    """Special markets for Game of Thrones — the final 10 the operator chose:
      Gender    : More Men / More Women / Over 1.5 Men / Over 1.5 Women / All Men / All Women
      Kings     : No Kings / At Least One King
      Bastards  : No Bastards / At Least One Bastard

    "Over 1.5" means ≥ 2 (standard sportsbook idiom).
    """
    try:
        num_cards = request.json.get('num_cards', 3) if request.json else 3

        response = supabase.table('gameofthrones_trading').select('*').execute()
        characters = response.data
        n = len(characters)

        special_markets = []

        # ── Counts ──
        num_men       = sum(1 for c in characters if str(c.get('gender', '')).strip().upper() == 'M')
        num_women     = n - num_men
        num_kings     = sum(1 for c in characters if c.get('king') == True)
        num_bastards  = sum(1 for c in characters if c.get('bastard') == True)

        # ── Helpers ──
        def _add(market_id: str, name: str, description: str, prob: float):
            odds = apply_vig(prob, margin=SPECIALS_VIG_MARGIN)
            special_markets.append({
                'market_id':    market_id,
                'name':         name,
                'description':  description,
                'odds_decimal': round(odds, 2),
                'odds_american': decimal_to_american(odds),
                'probability':  round(prob * 100, 1),
            })

        def _comb(a: int, b: int) -> int:
            """Safe nCr — zero when invalid."""
            if a < 0 or b < 0 or b > a:
                return 0
            return math.comb(a, b)

        total_combos = math.comb(n, num_cards) if n >= num_cards else 0

        def _prob_exact_men(k: int) -> float:
            """P(exactly k men among num_cards picks)."""
            if total_combos == 0:
                return 0.0
            return (_comb(num_men, k) * _comb(num_women, num_cards - k)) / total_combos

        def _prob_atleast_men(k: int) -> float:
            return sum(_prob_exact_men(j) for j in range(k, num_cards + 1))

        def _prob_atleast_women(k: int) -> float:
            # By symmetry with the gender split.
            return sum(_prob_exact_men(num_cards - j) for j in range(k, num_cards + 1))

        # ── Gender (6) ──
        prob_more_men   = sum(_prob_exact_men(k) for k in range(num_cards // 2 + 1, num_cards + 1))
        prob_more_women = sum(_prob_exact_men(num_cards - k) for k in range(num_cards // 2 + 1, num_cards + 1))
        prob_over_1_5_men   = _prob_atleast_men(2)
        prob_over_1_5_women = _prob_atleast_women(2)
        prob_all_men   = _prob_exact_men(num_cards)
        prob_all_women = _prob_exact_men(0)

        _add('gender_more_men',     'More Men Than Women',  f'More men than women among {num_cards} characters', prob_more_men)
        _add('gender_more_women',   'More Women Than Men',  f'More women than men among {num_cards} characters', prob_more_women)
        _add('over_1_5_men',        'Over 1.5 Men',         f'At least 2 of the {num_cards} characters are men',   prob_over_1_5_men)
        _add('over_1_5_women',      'Over 1.5 Women',       f'At least 2 of the {num_cards} characters are women', prob_over_1_5_women)
        _add('men_all',             'All Men',              f'All {num_cards} characters are men',                 prob_all_men)
        _add('women_all',           'All Women',            f'All {num_cards} characters are women',               prob_all_women)

        # ── Kings (2) ──
        prob_no_kings        = (_comb(n - num_kings, num_cards) / total_combos) if total_combos else 0.0
        prob_atleast_1_king  = 1.0 - prob_no_kings
        _add('king_none',          'No Kings',          f'None of {num_cards} characters were ever a king',        prob_no_kings)
        _add('king_atleast_1',     'At Least One King', f'At least 1 of {num_cards} characters was ever a king',   prob_atleast_1_king)

        # ── Bastards (2) ──
        prob_no_bastards          = (_comb(n - num_bastards, num_cards) / total_combos) if total_combos else 0.0
        prob_atleast_1_bastard    = 1.0 - prob_no_bastards
        _add('bastard_none',       'No Bastards',          f'None of {num_cards} characters are bastards',       prob_no_bastards)
        _add('bastard_atleast_1',  'At Least One Bastard', f'At least 1 of {num_cards} characters is a bastard', prob_atleast_1_bastard)

        return jsonify({'success': True, 'special_markets': special_markets}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@gameofthrones_bp.route('/settle', methods=['POST'])
def settle_draw():
    """Settle bets for a draw - COPIED EXACTLY FROM BREAKING BAD"""
    try:
        data = request.json
        drawn_characters = data.get('drawn_characters', [])
        bets = data.get('bets', [])
        
        if not drawn_characters or not bets:
            return jsonify({
                'success': False,
                'error': 'Missing drawn_characters or bets'
            }), 400
        
        results = []
        total_pnl = 0
        
        for bet in bets:
            market_id = bet['market_id']
            stake = float(bet['stake'])
            odds_decimal = float(bet['odds_decimal'])
            
            won = False
            
            # Check character markets (drawn/not_drawn)
            if market_id.startswith('char_') and '_drawn' in market_id:
                # Extract character_id from market_id like "char_1_drawn" or "char_1_not_drawn"
                parts = market_id.split('_')
                char_id = int(parts[1])
                
                drawn_ids = [char['character_id'] for char in drawn_characters]
                
                if market_id.endswith('_not_drawn'):
                    # Won if character was NOT drawn
                    won = char_id not in drawn_ids
                else:
                    # Won if character was drawn
                    won = char_id in drawn_ids
            
            # Check house markets (drawn/not_drawn)
            elif market_id.startswith('house_') and '_drawn' in market_id:
                # Extract house name from market_id like "house_gryffindor_drawn"
                # Remove 'house_' prefix and '_drawn' or '_not_drawn' suffix
                if market_id.endswith('_not_drawn'):
                    house_slug = market_id.replace('house_', '').replace('_not_drawn', '')
                else:
                    house_slug = market_id.replace('house_', '').replace('_drawn', '')
                
                # Match house by slug (handle spaces in house names)
                house_matched = False
                for char in drawn_characters:
                    char_house = char.get('house', '')
                    if char_house and char_house.replace(' ', '_').lower() == house_slug:
                        house_matched = True
                        break
                
                if market_id.endswith('_not_drawn'):
                    # Won if NO member of this house was drawn
                    won = not house_matched
                else:
                    # Won if at least one member of this house was drawn
                    won = house_matched
            
            # ── Gender specials ──
            # men_all                     -> all picks are men
            # women_all                   -> all picks are women
            # over_1_5_men / _women       -> >= 2 of that gender (sportsbook "Over 1.5" idiom)
            # gender_more_men / more_women -> strict majority of that gender
            elif market_id in ('men_all', 'women_all',
                               'over_1_5_men', 'over_1_5_women',
                               'gender_more_men', 'gender_more_women'):
                num_drawn   = len(drawn_characters)
                men_count   = sum(1 for c in drawn_characters if str(c.get('gender', '')).strip().upper() == 'M')
                women_count = num_drawn - men_count
                if market_id == 'men_all':
                    won = (men_count == num_drawn and num_drawn > 0)
                elif market_id == 'women_all':
                    won = (women_count == num_drawn and num_drawn > 0)
                elif market_id == 'over_1_5_men':
                    won = men_count >= 2
                elif market_id == 'over_1_5_women':
                    won = women_count >= 2
                elif market_id == 'gender_more_men':
                    won = men_count > women_count
                elif market_id == 'gender_more_women':
                    won = women_count > men_count

            # ── King markets (king_none, king_atleast_1) ──
            elif market_id.startswith('king_'):
                count = '_'.join(market_id.split('_')[1:])
                king_count = sum(1 for c in drawn_characters if c.get('king') == True)
                if count == 'none':
                    won = king_count == 0
                elif count == 'atleast_1':
                    won = king_count >= 1

            # ── Bastard markets (bastard_none, bastard_atleast_1) ──
            elif market_id.startswith('bastard_'):
                count = '_'.join(market_id.split('_')[1:])
                bastard_count = sum(1 for c in drawn_characters if c.get('bastard') == True)
                if count == 'none':
                    won = bastard_count == 0
                elif count == 'atleast_1':
                    won = bastard_count >= 1
            
            push = False
            payout = 0
            if won:
                payout = stake * odds_decimal
                pnl = payout - stake
            else:
                pnl = -stake
            
            total_pnl += pnl
            
            results.append({
                'market_id': market_id,
                'market_name': bet.get('market_name', market_id),
                'stake': stake,
                'odds_decimal': odds_decimal,
                'odds_american': bet.get('odds_american', 0),
                'won': won,
                'push': push,
                'payout': round(payout, 2),
                'pnl': round(pnl, 2)
            })
        
        return jsonify({
            'success': True,
            'results': results,
            'total_pnl': round(total_pnl, 2)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@gameofthrones_bp.route('/stats', methods=['GET'])
def get_stats():
    """Get statistics for a user"""
    try:
        # Get user_id from headers
        from flask import request
        user_id = request.headers.get('X-User-Id')
        
        if not user_id:
            return jsonify({
                'success': False,
                'error': 'No user ID provided'
            }), 401
        
        # Query bets table for game_id=14 (Game of Thrones)
        response = supabase.table('bets').select('*').eq('user_id', user_id).eq('game_id', 14).execute()
        bets = response.data or []
        
        if not bets:
            return jsonify({
                'success': True,
                'stats': {
                    'total_sessions': 0,
                    'total_bets': 0,
                    'net_pnl': 0.0,
                    'win_rate': 0.0
                }
            }), 200
        
        total_sessions = len(bets)
        total_bets = sum(bet.get('num_bets', 0) for bet in bets)
        net_pnl = sum(bet.get('net_pnl', 0.0) for bet in bets)
        
        # Win rate is percentage of sessions with positive P&L
        winning_sessions = sum(1 for bet in bets if bet.get('net_pnl', 0.0) > 0)
        win_rate = (winning_sessions / total_sessions * 100) if total_sessions > 0 else 0.0
        
        return jsonify({
            'success': True,
            'stats': {
                'total_sessions': total_sessions,
                'total_bets': total_bets,
                'net_pnl': round(net_pnl, 2),
                'win_rate': round(win_rate, 1)
            }
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@gameofthrones_bp.route('/end-session', methods=['POST'])
def end_session():
    """Record session bet in bets table when user ends session"""
    try:
        # Extract user_id from JWT token in Authorization header
        from api.routes import _get_user_from_header
        user_id = _get_user_from_header(request)

        if not user_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

        data = request.json or {}
        num_bets = data.get('num_bets', 0)
        net_pnl = float(data.get('net_pnl', 0))
        player_chops = data.get('player_chops') or []
        house_chops = data.get('house_chops') or []
        player_screenname = data.get('player_screenname')

        if not player_screenname:
            try:
                urow = supabase.table('users').select('screenname').eq('user_id', user_id).limit(1).execute()
                if urow.data:
                    player_screenname = urow.data[0].get('screenname') or ''
            except Exception:
                player_screenname = ''

        rows = build_session_bet_rows(
            player_user_id=user_id,
            player_screenname=player_screenname,
            player_market='Trading',
            outcome=f'Game of Thrones Session {num_bets} Bets',
            game_id=14,
            net_pnl=net_pnl,
            player_chops=player_chops,
            house_chops=house_chops,
        )

        supabase.table('bets').insert(rows).execute()

        return jsonify({
            'success': True,
            'message': 'Session recorded',
            'rows_inserted': len(rows),
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

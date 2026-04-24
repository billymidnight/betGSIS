"""
Harry Potter trading game routes
"""
from flask import Blueprint, jsonify, request
from database.supabase_client import get_supabase_client
from utils.chop import build_session_bet_rows  # type: ignore
import random
from typing import List, Dict
import math
from itertools import combinations

harrypotter_bp = Blueprint('harrypotter', __name__, url_prefix='/api/trading/harrypotter')

# Constants
VIG_MARGIN = 0.03  # 3% vig
SPECIALS_VIG_MARGIN = 0.045  # 4.5% vig for special markets

# Get supabase client
supabase = get_supabase_client()


def get_harrypotter_settings() -> Dict:
    """Fetch settings from harrypotter_settings table"""
    try:
        response = supabase.table('harrypotter_settings').select('setting, value').execute()
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


@harrypotter_bp.route('/characters', methods=['GET'])
def get_characters():
    """Get all Harry Potter characters"""
    try:
        response = supabase.table('harrypotter_trading').select('*').execute()
        return jsonify({
            'success': True,
            'characters': response.data
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@harrypotter_bp.route('/draw', methods=['POST'])
def create_draw():
    """Create a new draw of random characters based on settings"""
    try:
        # Fetch settings
        settings = get_harrypotter_settings()
        card_nature = settings.get('card_nature', 'static')
        card_count_setting = int(settings.get('card_count', '3'))
        
        # Determine number of cards to draw
        if card_nature == 'random':
            num_cards = random.choice([2, 3, 4])
        else:
            num_cards = card_count_setting
        
        # Get all characters
        response = supabase.table('harrypotter_trading').select('*').execute()
        characters = response.data
        
        if len(characters) < num_cards:
            return jsonify({
                'success': False,
                'error': 'Not enough characters in database'
            }), 400
        
        # Draw random characters
        drawn = random.sample(characters, num_cards)
        
        return jsonify({
            'success': True,
            'draw': drawn,
            'num_cards': num_cards,
            'draw_id': f"draw_{random.randint(100000, 999999)}"
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@harrypotter_bp.route('/markets', methods=['POST'])
def get_markets():
    """Get general markets (placeholder for now - Harry Potter uses character markets)"""
    try:
        return jsonify({
            'success': True,
            'markets': []  # Empty for now - Harry Potter focuses on character markets
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@harrypotter_bp.route('/character-markets', methods=['POST'])
def get_character_markets():
    """Get character drawn/not drawn markets with dynamic odds"""
    try:
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all characters
        response = supabase.table('harrypotter_trading').select('*').execute()
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


@harrypotter_bp.route('/house-markets', methods=['POST'])
def get_house_markets():
    """Get house drawn/not drawn markets with combinatorial odds"""
    try:
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all characters
        response = supabase.table('harrypotter_trading').select('*').execute()
        characters = response.data
        n = len(characters)
        
        houses = ['Gryffindor', 'Slytherin', 'Hufflepuff', 'Ravenclaw']
        house_markets = []
        
        for house in houses:
            # Count house members
            house_members = [c for c in characters if c.get('house') == house]
            num_in_house = len(house_members)
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


@harrypotter_bp.route('/special-markets', methods=['POST'])
def get_special_markets():
    """Get special markets with combinatorial probability calculations"""
    try:
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all characters
        response = supabase.table('harrypotter_trading').select('*').execute()
        characters = response.data
        n = len(characters)
        
        special_markets = []
        
        # Count totals
        num_men = sum(1 for char in characters if str(char.get('gender', '')).strip().upper() == 'M')
        num_women = n - num_men
        num_teachers = sum(1 for char in characters if char.get('is_was_teacher') == True)
        num_non_teachers = n - num_teachers
        num_survivors = sum(1 for char in characters if char.get('survived') == True)
        num_non_survivors = n - num_survivors
        num_weasleys = sum(1 for char in characters if char.get('is_weasley') == True)
        num_potters = sum(1 for char in characters if char.get('is_potter') == True)
        
        # Gender Markets
        # All Men
        prob_all_men = math.comb(num_men, num_cards) / math.comb(n, num_cards) if num_men >= num_cards else 0.0
        odds_all_men = apply_vig(prob_all_men, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'men_all',
            'name': 'All Men',
            'description': f'All {num_cards} characters are men',
            'odds_decimal': round(odds_all_men, 2),
            'odds_american': decimal_to_american(odds_all_men),
            'probability': round(prob_all_men * 100, 1)
        })
        
        # At Least One Woman
        if num_men >= num_cards:
            prob_all_men_calc = math.comb(num_men, num_cards) / math.comb(n, num_cards)
            prob_atleast_one_woman = 1.0 - prob_all_men_calc
        else:
            prob_atleast_one_woman = 1.0
        odds_atleast_one_woman = apply_vig(prob_atleast_one_woman, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'women_atleast_1',
            'name': 'At Least One Woman',
            'description': f'At least 1 of {num_cards} characters is a woman',
            'odds_decimal': round(odds_atleast_one_woman, 2),
            'odds_american': decimal_to_american(odds_atleast_one_woman),
            'probability': round(prob_atleast_one_woman * 100, 1)
        })
        
        # More Men Than Women
        prob_more_men = 0.0
        for num_men_drawn in range((num_cards // 2) + 1, num_cards + 1):
            num_women_drawn = num_cards - num_men_drawn
            if num_men_drawn <= num_men and num_women_drawn <= num_women:
                prob_more_men += (math.comb(num_men, num_men_drawn) * math.comb(num_women, num_women_drawn)) / math.comb(n, num_cards)
        odds_more_men = apply_vig(prob_more_men, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'gender_more_men',
            'name': 'More Men Than Women',
            'description': f'More men than women among {num_cards} characters',
            'odds_decimal': round(odds_more_men, 2),
            'odds_american': decimal_to_american(odds_more_men),
            'probability': round(prob_more_men * 100, 1)
        })
        
        # More Women Than Men
        prob_more_women = 0.0
        for num_women_drawn in range((num_cards // 2) + 1, num_cards + 1):
            num_men_drawn = num_cards - num_women_drawn
            if num_women_drawn <= num_women and num_men_drawn <= num_men:
                prob_more_women += (math.comb(num_women, num_women_drawn) * math.comb(num_men, num_men_drawn)) / math.comb(n, num_cards)
        odds_more_women = apply_vig(prob_more_women, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'gender_more_women',
            'name': 'More Women Than Men',
            'description': f'More women than men among {num_cards} characters',
            'odds_decimal': round(odds_more_women, 2),
            'odds_american': decimal_to_american(odds_more_women),
            'probability': round(prob_more_women * 100, 1)
        })
        
        # Teacher Markets
        # No Teachers
        prob_no_teachers = math.comb(num_non_teachers, num_cards) / math.comb(n, num_cards) if num_non_teachers >= num_cards else 0.0
        odds_no_teachers = apply_vig(prob_no_teachers, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'teacher_none',
            'name': 'No Teachers',
            'description': f'None of {num_cards} characters are teachers',
            'odds_decimal': round(odds_no_teachers, 2),
            'odds_american': decimal_to_american(odds_no_teachers),
            'probability': round(prob_no_teachers * 100, 1)
        })
        
        # At Least One Teacher
        if num_non_teachers >= num_cards:
            prob_no_teachers_calc = math.comb(num_non_teachers, num_cards) / math.comb(n, num_cards)
            prob_atleast_one_teacher = 1.0 - prob_no_teachers_calc
        else:
            prob_atleast_one_teacher = 1.0
        odds_atleast_one_teacher = apply_vig(prob_atleast_one_teacher, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'teacher_atleast_1',
            'name': 'At Least One Teacher',
            'description': f'At least 1 of {num_cards} characters is a teacher',
            'odds_decimal': round(odds_atleast_one_teacher, 2),
            'odds_american': decimal_to_american(odds_atleast_one_teacher),
            'probability': round(prob_atleast_one_teacher * 100, 1)
        })
        
        # Survivor Markets
        # No Survivors
        prob_no_survivors = math.comb(num_non_survivors, num_cards) / math.comb(n, num_cards) if num_non_survivors >= num_cards else 0.0
        odds_no_survivors = apply_vig(prob_no_survivors, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'survivor_none',
            'name': 'No Survivors',
            'description': f'None of {num_cards} characters survived',
            'odds_decimal': round(odds_no_survivors, 2),
            'odds_american': decimal_to_american(odds_no_survivors),
            'probability': round(prob_no_survivors * 100, 1)
        })
        
        # At Least One Survivor
        if num_non_survivors >= num_cards:
            prob_no_survivors_calc = math.comb(num_non_survivors, num_cards) / math.comb(n, num_cards)
            prob_atleast_one_survivor = 1.0 - prob_no_survivors_calc
        else:
            prob_atleast_one_survivor = 1.0
        odds_atleast_one_survivor = apply_vig(prob_atleast_one_survivor, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'survivor_atleast_1',
            'name': 'At Least One Survivor',
            'description': f'At least 1 of {num_cards} characters survived',
            'odds_decimal': round(odds_atleast_one_survivor, 2),
            'odds_american': decimal_to_american(odds_atleast_one_survivor),
            'probability': round(prob_atleast_one_survivor * 100, 1)
        })
        
        # Weasley Market
        # At Least One Weasley
        num_non_weasleys = n - num_weasleys
        if num_non_weasleys >= num_cards:
            prob_no_weasleys = math.comb(num_non_weasleys, num_cards) / math.comb(n, num_cards)
            prob_atleast_one_weasley = 1.0 - prob_no_weasleys
        else:
            prob_atleast_one_weasley = 1.0
        odds_atleast_one_weasley = apply_vig(prob_atleast_one_weasley, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'weasley_atleast_1',
            'name': 'At Least One Weasley',
            'description': f'At least 1 of {num_cards} characters is a Weasley',
            'odds_decimal': round(odds_atleast_one_weasley, 2),
            'odds_american': decimal_to_american(odds_atleast_one_weasley),
            'probability': round(prob_atleast_one_weasley * 100, 1)
        })
        
        # Potter Market
        # At Least One Potter
        num_non_potters = n - num_potters
        if num_non_potters >= num_cards:
            prob_no_potters = math.comb(num_non_potters, num_cards) / math.comb(n, num_cards)
            prob_atleast_one_potter = 1.0 - prob_no_potters
        else:
            prob_atleast_one_potter = 1.0
        odds_atleast_one_potter = apply_vig(prob_atleast_one_potter, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'potter_atleast_1',
            'name': 'At Least One Potter',
            'description': f'At least 1 of {num_cards} characters is a Potter',
            'odds_decimal': round(odds_atleast_one_potter, 2),
            'odds_american': decimal_to_american(odds_atleast_one_potter),
            'probability': round(prob_atleast_one_potter * 100, 1)
        })
        
        return jsonify({
            'success': True,
            'special_markets': special_markets
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@harrypotter_bp.route('/settle', methods=['POST'])
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
            
            # Check special markets
            elif market_id.startswith('men_'):
                # men_all
                parts = market_id.split('_')
                count = parts[1]  # all
                
                men_count = sum(1 for char in drawn_characters if str(char.get('gender', '')).strip().upper() == 'M')
                num_cards_drawn = len(drawn_characters)
                
                if count == 'all':
                    won = men_count == num_cards_drawn
            
            elif market_id.startswith('women_'):
                # women_atleast_1
                parts = market_id.split('_')
                # Join remaining parts for count (handles atleast_1 which has underscore)
                count = '_'.join(parts[1:])  # atleast_1
                
                women_count = sum(1 for char in drawn_characters if str(char.get('gender', '')).strip().upper() == 'F')
                
                if count == 'atleast_1':
                    won = women_count >= 1
            
            elif market_id.startswith('gender_'):
                # gender_more_men, gender_more_women
                parts = market_id.split('_')
                comparison = '_'.join(parts[1:])  # more_men or more_women
                
                men_count = sum(1 for char in drawn_characters if str(char.get('gender', '')).strip().upper() == 'M')
                women_count = sum(1 for char in drawn_characters if str(char.get('gender', '')).strip().upper() == 'F')
                
                if comparison == 'more_men':
                    won = men_count > women_count
                elif comparison == 'more_women':
                    won = women_count > men_count
            
            elif market_id.startswith('teacher_'):
                # teacher_none, teacher_atleast_1
                parts = market_id.split('_')
                # Join remaining parts for count
                count = '_'.join(parts[1:])  # none or atleast_1
                
                teacher_count = sum(1 for char in drawn_characters if char.get('is_was_teacher') == True)
                
                if count == 'none':
                    won = teacher_count == 0
                elif count == 'atleast_1':
                    won = teacher_count >= 1
            
            elif market_id.startswith('survivor_'):
                # survivor_none, survivor_atleast_1
                parts = market_id.split('_')
                # Join remaining parts for count
                count = '_'.join(parts[1:])  # none or atleast_1
                
                survivor_count = sum(1 for char in drawn_characters if char.get('survived') == True)
                
                if count == 'none':
                    won = survivor_count == 0
                elif count == 'atleast_1':
                    won = survivor_count >= 1
            
            elif market_id.startswith('weasley_'):
                # weasley_atleast_1
                parts = market_id.split('_')
                count = '_'.join(parts[1:])  # atleast_1
                
                weasley_count = sum(1 for char in drawn_characters if char.get('is_weasley') == True)
                
                if count == 'atleast_1':
                    won = weasley_count >= 1
            
            elif market_id.startswith('potter_'):
                # potter_atleast_1
                parts = market_id.split('_')
                count = '_'.join(parts[1:])  # atleast_1
                
                potter_count = sum(1 for char in drawn_characters if char.get('is_potter') == True)
                
                if count == 'atleast_1':
                    won = potter_count >= 1
            
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


@harrypotter_bp.route('/stats', methods=['GET'])
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
        
        # Query bets table for game_id=12 (Harry Potter)
        response = supabase.table('bets').select('*').eq('user_id', user_id).eq('game_id', 12).execute()
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


@harrypotter_bp.route('/end-session', methods=['POST'])
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
            outcome=f'Harry Potter Session {num_bets} Bets',
            game_id=12,
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

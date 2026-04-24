from flask import Blueprint, jsonify, request
from database.supabase_client import supabase
from utils.chop import build_session_bet_rows  # type: ignore
import random
import math
from itertools import combinations

goodshepherd_bp = Blueprint('goodshepherd', __name__, url_prefix='/api/trading/goodshepherd')

# Constants
VIG_MARGIN = 0.03  # 3% base margin
SPECIALS_VIG_MARGIN = 0.045  # 4.5% margin for specials

def get_settings():
    """Fetch settings from goodshepherd_settings table"""
    try:
        response = supabase.table('goodshepherd_settings').select('*').execute()
        settings = {}
        for row in response.data:
            settings[row['setting']] = row['value']
        return settings
    except Exception as e:
        print(f"Error fetching settings: {e}")
        return {'card_nature': 'static', 'card_count': '3'}

def decimal_to_american(decimal_odds):
    """Convert decimal odds to American format"""
    if decimal_odds >= 2.0:
        return int((decimal_odds - 1) * 100)
    else:
        return int(-100 / (decimal_odds - 1))

def american_to_decimal(american_odds):
    """Convert American odds to decimal format"""
    if isinstance(american_odds, str):
        american_odds = int(american_odds.replace('+', ''))
    
    if american_odds > 0:
        return 1 + (american_odds / 100)
    else:
        return 1 + (100 / abs(american_odds))

def apply_vig(true_prob, is_special=False):
    """
    Apply vig using asymmetric margin.
    More margin on underdogs, base margin on favorites.
    """
    margin = SPECIALS_VIG_MARGIN if is_special else VIG_MARGIN
    
    if true_prob >= 0.5:
        # Favorite: apply base margin
        book_prob = true_prob + (margin / 2)
    else:
        # Underdog: apply more margin
        book_prob = true_prob + margin
    
    book_prob = min(book_prob, 0.99)
    book_prob = max(book_prob, 0.01)
    
    return 1.0 / book_prob

@goodshepherd_bp.route('/characters', methods=['GET'])
def get_characters():
    """Get all Good Shepherd students"""
    try:
        response = supabase.table('goodshepherd_trading').select('*').execute()
        characters = response.data
        
        return jsonify({
            'success': True,
            'characters': characters
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@goodshepherd_bp.route('/draw', methods=['POST'])
def create_draw():
    """Draw random students for a new round"""
    try:
        settings = get_settings()
        num_cards = int(settings.get('card_count', 3))
        
        # Get all students
        response = supabase.table('goodshepherd_trading').select('*').execute()
        all_students = response.data
        
        if len(all_students) < num_cards:
            return jsonify({
                'success': False,
                'error': f'Not enough students. Need {num_cards}, have {len(all_students)}'
            }), 400
        
        # Random draw
        drawn_students = random.sample(all_students, num_cards)
        
        return jsonify({
            'success': True,
            'draw': drawn_students,
            'num_cards': num_cards
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@goodshepherd_bp.route('/markets', methods=['POST'])
def get_markets():
    """Get general markets - placeholder"""
    return jsonify({
        'success': True,
        'markets': []
    }), 200

@goodshepherd_bp.route('/character-markets', methods=['POST'])
def get_character_markets():
    """Get character markets for 4 randomly sampled students with drawn/not_drawn odds"""
    try:
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all students
        response = supabase.table('goodshepherd_trading').select('*').execute()
        all_students = response.data
        
        if len(all_students) < 4:
            return jsonify({'success': False, 'error': 'Not enough students'}), 500
        
        # Sample 4 random students for this round
        sampled_students = random.sample(all_students, 4)
        
        n = len(all_students)  # Total number of students
        
        character_markets = []
        
        for student in sampled_students:
            student_id = student['character_id']
            student_name = student['name']
            
            # Probability of being drawn: num_cards / n
            prob_drawn = num_cards / n
            
            # Probability of NOT being drawn: (n - num_cards) / n
            prob_not_drawn = (n - num_cards) / n
            
            # Apply vig and get odds
            odds_drawn = apply_vig(prob_drawn)
            odds_not_drawn = apply_vig(prob_not_drawn)
            
            character_markets.append({
                'character_id': student_id,
                'character_name': student_name,
                'drawn': {
                    'market_id': f'char_{student_id}_drawn',
                    'market_type': 'character_drawn',
                    'text_on_screen': f'{student_name} - Drawn',
                    'odds_decimal': round(odds_drawn, 2),
                    'odds_american': decimal_to_american(odds_drawn),
                    'probability': round(prob_drawn * 100, 1)
                },
                'not_drawn': {
                    'market_id': f'char_{student_id}_not_drawn',
                    'market_type': 'character_not_drawn',
                    'text_on_screen': f'{student_name} - Not Drawn',
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

@goodshepherd_bp.route('/house-markets', methods=['POST'])
def get_house_markets():
    """Get house drawn/not drawn markets with combinatorial odds"""
    try:
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        draw_number = request.json.get('draw_number', 1) if request.json else 1
        
        # Alternate between houses and sports
        use_houses = (draw_number % 2 == 1)  # Odd draws show houses, even draws show sports
        
        # Get all students
        response = supabase.table('goodshepherd_trading').select('*').execute()
        students = response.data
        n = len(students)
        
        if use_houses:
            # HOUSE MARKETS
            houses = ['Spring', 'Summer', 'Autumn', 'Winter']
            markets = []
            
            for house in houses:
                # Count house members
                house_members = [s for s in students if s.get('house') == house]
                num_in_category = len(house_members)
                num_not_in_category = n - num_in_category
                
                # Probability at least one member of this house is drawn
                if num_not_in_category >= num_cards:
                    prob_none = math.comb(num_not_in_category, num_cards) / math.comb(n, num_cards)
                    prob_drawn = 1.0 - prob_none
                else:
                    prob_drawn = 1.0
                
                prob_not_drawn = 1.0 - prob_drawn
                
                # Apply vig
                odds_drawn = apply_vig(prob_drawn)
                odds_not_drawn = apply_vig(prob_not_drawn)
                
                house_slug = house.lower().replace(' ', '_')
                
                markets.append({
                    'house_name': house,
                    'house_size': num_in_category,
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
        else:
            # SPORT MARKETS
            # Get all unique sports (filter out None/NULL)
            all_sports = list(set([s.get('sport') for s in students if s.get('sport')]))
            
            # Sample 3 random sports
            if len(all_sports) >= 3:
                selected_sports = random.sample(all_sports, 3)
            else:
                selected_sports = all_sports
            
            markets = []
            
            for sport in selected_sports:
                # Count sport members
                sport_members = [s for s in students if s.get('sport') == sport]
                num_in_category = len(sport_members)
                num_not_in_category = n - num_in_category
                
                # Probability at least one member of this sport is drawn
                if num_not_in_category >= num_cards:
                    prob_none = math.comb(num_not_in_category, num_cards) / math.comb(n, num_cards)
                    prob_drawn = 1.0 - prob_none
                else:
                    prob_drawn = 1.0
                
                prob_not_drawn = 1.0 - prob_drawn
                
                # Apply vig
                odds_drawn = apply_vig(prob_drawn)
                odds_not_drawn = apply_vig(prob_not_drawn)
                
                sport_slug = sport.lower().replace(' ', '_')
                
                markets.append({
                    'house_name': sport,  # Keep same key for consistency
                    'house_size': num_in_category,
                    'drawn': {
                        'market_id': f"sport_{sport_slug}_drawn",
                        'name': f"{sport} Drawn",
                        'text_on_screen': f"{sport} Drawn",
                        'odds_decimal': round(odds_drawn, 2),
                        'odds_american': decimal_to_american(odds_drawn),
                        'probability': round(prob_drawn * 100, 1)
                    },
                    'not_drawn': {
                        'market_id': f"sport_{sport_slug}_not_drawn",
                        'name': f"{sport} Not Drawn",
                        'text_on_screen': f"{sport} Not Drawn",
                        'odds_decimal': round(odds_not_drawn, 2),
                        'odds_american': decimal_to_american(odds_not_drawn),
                        'probability': round(prob_not_drawn * 100, 1)
                    }
                })
        
        return jsonify({
            'success': True,
            'crew_markets': markets,
            'market_type': 'houses' if use_houses else 'sports'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@goodshepherd_bp.route('/special-markets', methods=['POST'])
def get_special_markets():
    """Get special markets with combinatorial probability calculations"""
    try:
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all students
        response = supabase.table('goodshepherd_trading').select('*').execute()
        students = response.data
        n = len(students)
        
        special_markets = []
        
        # Count totals for prefects
        num_prefects = sum(1 for s in students if s.get('was_prefect', False))
        num_not_prefects = n - num_prefects
        
        # PREFECT MARKETS
        if num_not_prefects >= num_cards:
            prob_no_prefects = math.comb(num_not_prefects, num_cards) / math.comb(n, num_cards)
        else:
            prob_no_prefects = 0.0
        prob_atleast_one_prefect = 1.0 - prob_no_prefects
        
        odds_no_prefects = apply_vig(prob_no_prefects, is_special=True)
        odds_atleast_one_prefect = apply_vig(prob_atleast_one_prefect, is_special=True)
        
        special_markets.extend([
            {
                'market_id': 'no_prefects',
                'text_on_screen': 'No Prefects',
                'odds_decimal': round(odds_no_prefects, 2),
                'odds_american': decimal_to_american(odds_no_prefects),
                'probability': round(prob_no_prefects * 100, 1)
            },
            {
                'market_id': 'atleast_one_prefect',
                'text_on_screen': 'At Least One Prefect',
                'odds_decimal': round(odds_atleast_one_prefect, 2),
                'odds_american': decimal_to_american(odds_atleast_one_prefect),
                'probability': round(prob_atleast_one_prefect * 100, 1)
            }
        ])
        
        # FOOTBALL MARKETS - All Football / Not All Football
        num_football = sum(1 for s in students if s.get('sport') == 'Football')
        num_not_football = n - num_football
        
        if num_football >= num_cards:
            prob_all_football = math.comb(num_football, num_cards) / math.comb(n, num_cards)
        else:
            prob_all_football = 0.0
        prob_not_all_football = 1.0 - prob_all_football
        
        odds_all_football = apply_vig(prob_all_football, is_special=True)
        odds_not_all_football = apply_vig(prob_not_all_football, is_special=True)
        
        special_markets.extend([
            {
                'market_id': 'all_football_yes',
                'text_on_screen': 'All Football - Yes',
                'odds_decimal': round(odds_all_football, 2),
                'odds_american': decimal_to_american(odds_all_football),
                'probability': round(prob_all_football * 100, 1)
            },
            {
                'market_id': 'all_football_no',
                'text_on_screen': 'All Football - No',
                'odds_decimal': round(odds_not_all_football, 2),
                'odds_american': decimal_to_american(odds_not_all_football),
                'probability': round(prob_not_all_football * 100, 1)
            }
        ])
        
        # OVER/UNDER 1.5 FOOTBALL MARKETS
        # Over 1.5 = 2 or more football players drawn
        # Under 1.5 = 0 or 1 football players drawn
        prob_over_1_5_football = 0.0
        for k in range(2, num_cards + 1):
            if num_football >= k and num_not_football >= (num_cards - k):
                prob_over_1_5_football += math.comb(num_football, k) * math.comb(num_not_football, num_cards - k) / math.comb(n, num_cards)
        
        prob_under_1_5_football = 1.0 - prob_over_1_5_football
        
        odds_over_1_5_football = apply_vig(prob_over_1_5_football, is_special=True)
        odds_under_1_5_football = apply_vig(prob_under_1_5_football, is_special=True)
        
        special_markets.extend([
            {
                'market_id': 'over_1_5_football',
                'text_on_screen': 'Over 1.5 Football',
                'odds_decimal': round(odds_over_1_5_football, 2),
                'odds_american': decimal_to_american(odds_over_1_5_football),
                'probability': round(prob_over_1_5_football * 100, 1)
            },
            {
                'market_id': 'under_1_5_football',
                'text_on_screen': 'Under 1.5 Football',
                'odds_decimal': round(odds_under_1_5_football, 2),
                'odds_american': decimal_to_american(odds_under_1_5_football),
                'probability': round(prob_under_1_5_football * 100, 1)
            }
        ])
        
        # EXPELLED MARKETS
        num_expelled = sum(1 for s in students if s.get('expelled', False))
        num_not_expelled = n - num_expelled
        
        if num_not_expelled >= num_cards:
            prob_no_expelled = math.comb(num_not_expelled, num_cards) / math.comb(n, num_cards)
        else:
            prob_no_expelled = 0.0
        prob_atleast_one_expelled = 1.0 - prob_no_expelled
        
        odds_no_expelled = apply_vig(prob_no_expelled, is_special=True)
        odds_atleast_one_expelled = apply_vig(prob_atleast_one_expelled, is_special=True)
        
        special_markets.extend([
            {
                'market_id': 'no_expelled',
                'text_on_screen': 'No Expelled',
                'odds_decimal': round(odds_no_expelled, 2),
                'odds_american': decimal_to_american(odds_no_expelled),
                'probability': round(prob_no_expelled * 100, 1)
            },
            {
                'market_id': 'atleast_one_expelled',
                'text_on_screen': 'At Least One Expelled',
                'odds_decimal': round(odds_atleast_one_expelled, 2),
                'odds_american': decimal_to_american(odds_atleast_one_expelled),
                'probability': round(prob_atleast_one_expelled * 100, 1)
            }
        ])
        
        # ERROR 404 (BAND) MARKETS
        num_404 = sum(1 for s in students if s.get('was_404', False))
        num_not_404 = n - num_404
        
        if num_not_404 >= num_cards:
            prob_no_404 = math.comb(num_not_404, num_cards) / math.comb(n, num_cards)
        else:
            prob_no_404 = 0.0
        prob_atleast_one_404 = 1.0 - prob_no_404
        
        odds_no_404 = apply_vig(prob_no_404, is_special=True)
        odds_atleast_one_404 = apply_vig(prob_atleast_one_404, is_special=True)
        
        special_markets.extend([
            {
                'market_id': 'no_404',
                'text_on_screen': 'No Error 404 (Band)',
                'odds_decimal': round(odds_no_404, 2),
                'odds_american': decimal_to_american(odds_no_404),
                'probability': round(prob_no_404 * 100, 1)
            },
            {
                'market_id': 'atleast_one_404',
                'text_on_screen': 'At Least 1 Error 404 (Band)',
                'odds_decimal': round(odds_atleast_one_404, 2),
                'odds_american': decimal_to_american(odds_atleast_one_404),
                'probability': round(prob_atleast_one_404 * 100, 1)
            }
        ])
        
        # JULY BORN MARKETS
        # Parse DOB and check if born in July
        num_july_born = sum(1 for s in students if s.get('dob') and str(s.get('dob')).split('-')[1] == '07')
        num_not_july_born = n - num_july_born
        
        if num_not_july_born >= num_cards:
            prob_no_july = math.comb(num_not_july_born, num_cards) / math.comb(n, num_cards)
        else:
            prob_no_july = 0.0
        prob_atleast_one_july = 1.0 - prob_no_july
        
        odds_no_july = apply_vig(prob_no_july, is_special=True)
        odds_atleast_one_july = apply_vig(prob_atleast_one_july, is_special=True)
        
        special_markets.extend([
            {
                'market_id': 'no_july_born',
                'text_on_screen': 'No July Born',
                'odds_decimal': round(odds_no_july, 2),
                'odds_american': decimal_to_american(odds_no_july),
                'probability': round(prob_no_july * 100, 1)
            },
            {
                'market_id': 'atleast_one_july_born',
                'text_on_screen': 'At Least One July Born',
                'odds_decimal': round(odds_atleast_one_july, 2),
                'odds_american': decimal_to_american(odds_atleast_one_july),
                'probability': round(prob_atleast_one_july * 100, 1)
            }
        ])
        
        return jsonify({
            'success': True,
            'special_markets': special_markets
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@goodshepherd_bp.route('/settle', methods=['POST'])
def settle_draw():
    """Settle bets for a completed draw - COPIED EXACTLY FROM BREAKING BAD"""
    try:
        data = request.json
        drawn_characters = data.get('drawn_characters', [])
        bets = data.get('bets', [])
        
        if not drawn_characters or not bets:
            return jsonify({
                'success': False,
                'error': 'Missing drawn_characters or bets'
            }), 400
        
        # Create sets for quick lookup
        drawn_ids = {c['character_id'] for c in drawn_characters}
        drawn_houses = {c['house'] for c in drawn_characters if c.get('house')}
        drawn_sports = {c['sport'] for c in drawn_characters if c.get('sport')}
        
        results = []
        total_pnl = 0
        
        for bet in bets:
            market_id = bet['market_id']
            stake = float(bet['stake'])
            odds_decimal = float(bet['odds_decimal'])
            
            won = False
            push = False
            
            # Character markets
            if market_id.startswith('char_'):
                parts = market_id.split('_')
                char_id = int(parts[1])
                market_type = parts[2]  # 'drawn' or 'not'
                
                if market_type == 'drawn':
                    won = char_id in drawn_ids
                else:  # not_drawn
                    won = char_id not in drawn_ids
            
            # House markets
            elif market_id.startswith('house_'):
                parts = market_id.split('_')
                house_slug = parts[1]  # lowercase slug like 'spring', 'summer'
                market_type = parts[2]  # 'drawn' or 'not'
                
                # Convert slug to proper case for matching
                house_name = house_slug.capitalize()  # 'spring' -> 'Spring'
                
                if market_type == 'drawn':
                    won = house_name in drawn_houses
                else:  # not_drawn
                    won = house_name not in drawn_houses
            
            # Sport markets
            elif market_id.startswith('sport_'):
                # Parse like houses: sport_cricket_drawn or sport_cricket_not_drawn
                if market_id.endswith('_not_drawn'):
                    sport_slug = market_id.replace('sport_', '').replace('_not_drawn', '')
                    market_type = 'not_drawn'
                elif market_id.endswith('_drawn'):
                    sport_slug = market_id.replace('sport_', '').replace('_drawn', '')
                    market_type = 'drawn'
                else:
                    sport_slug = market_id.replace('sport_', '')
                    market_type = 'unknown'
                
                # Convert slug to proper case for matching
                sport_name = sport_slug.replace('_', ' ').title()
                
                if market_type == 'drawn':
                    won = sport_name in drawn_sports
                else:  # not_drawn
                    won = sport_name not in drawn_sports
            
            # Special markets
            elif market_id == 'no_prefects':
                won = not any(c.get('was_prefect', False) for c in drawn_characters)
            elif market_id == 'atleast_one_prefect':
                won = any(c.get('was_prefect', False) for c in drawn_characters)
            
            elif market_id == 'all_football_yes':
                won = all(c.get('sport') == 'Football' for c in drawn_characters)
            elif market_id == 'all_football_no':
                won = not all(c.get('sport') == 'Football' for c in drawn_characters)
            
            elif market_id == 'over_1_5_football':
                num_football_drawn = sum(1 for c in drawn_characters if c.get('sport') == 'Football')
                won = num_football_drawn >= 2
            elif market_id == 'under_1_5_football':
                num_football_drawn = sum(1 for c in drawn_characters if c.get('sport') == 'Football')
                won = num_football_drawn <= 1
            
            elif market_id == 'no_expelled':
                won = not any(c.get('expelled', False) for c in drawn_characters)
            elif market_id == 'atleast_one_expelled':
                won = any(c.get('expelled', False) for c in drawn_characters)
            
            elif market_id == 'no_404':
                won = not any(c.get('was_404', False) for c in drawn_characters)
            elif market_id == 'atleast_one_404':
                won = any(c.get('was_404', False) for c in drawn_characters)
            
            elif market_id == 'no_july_born':
                won = not any(str(c.get('dob', '')).split('-')[1] == '07' for c in drawn_characters)
            elif market_id == 'atleast_one_july_born':
                won = any(str(c.get('dob', '')).split('-')[1] == '07' for c in drawn_characters)
            
            # Calculate PnL
            payout = 0
            if push:
                pnl = 0.0
            elif won:
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
            'total_pnl': round(total_pnl, 2),
            'drawn_characters': drawn_characters
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@goodshepherd_bp.route('/stats', methods=['GET'])
def get_stats():
    """Get user stats for Good Shepherd trading"""
    try:
        user_id = request.args.get('user_id')
        
        if not user_id:
            return jsonify({
                'success': True,
                'sessions_played': 0,
                'total_pnl': 0
            }), 200
        
        # Get stats from bets table where game_id = 13 (Good Shepherd)
        response = supabase.table('bets').select('*').eq('user_id', user_id).eq('game_id', 13).execute()
        
        sessions_played = len(response.data)
        total_pnl = sum(bet.get('bet_pnl', 0) for bet in response.data)
        
        return jsonify({
            'success': True,
            'sessions_played': sessions_played,
            'total_pnl': round(total_pnl, 2)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@goodshepherd_bp.route('/end-session', methods=['POST'])
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
            outcome=f'Good Shepherd Session {num_bets} Bets',
            game_id=13,
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

"""
Breaking Bad trading game routes
"""
from flask import Blueprint, jsonify, request
from database.supabase_client import get_supabase_client
import random
from typing import List, Dict
import math

breakingbad_bp = Blueprint('breakingbad', __name__, url_prefix='/api/trading/breakingbad')

# Constants
VIG_MARGIN = 0.03  # 3% vig
SPECIALS_VIG_MARGIN = 0.045  # 4.5% vig for special markets

# Get supabase client
supabase = get_supabase_client()


def get_breakingbad_settings() -> Dict:
    """Fetch settings from breakingbad_settings table"""
    try:
        response = supabase.table('breakingbad_settings').select('setting, value').execute()
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


@breakingbad_bp.route('/characters', methods=['GET'])
def get_characters():
    """Get all Breaking Bad characters"""
    try:
        response = supabase.table('breakingbad_trading').select('*').execute()
        return jsonify({
            'success': True,
            'characters': response.data
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@breakingbad_bp.route('/draw', methods=['POST'])
def create_draw():
    """Create a new draw of random characters based on settings"""
    try:
        # Fetch settings
        settings = get_breakingbad_settings()
        card_nature = settings.get('card_nature', 'static')
        card_count_setting = int(settings.get('card_count', '3'))
        
        # Determine number of cards to draw
        if card_nature == 'random':
            num_cards = random.choice([2, 3, 4])
        else:
            num_cards = card_count_setting
        
        # Get all characters
        response = supabase.table('breakingbad_trading').select('*').execute()
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


@breakingbad_bp.route('/markets', methods=['POST'])
def get_markets():
    """Get general markets (placeholder for now - Breaking Bad uses character markets)"""
    try:
        return jsonify({
            'success': True,
            'markets': []  # Empty for now - Breaking Bad focuses on character markets
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@breakingbad_bp.route('/character-markets', methods=['POST'])
def get_character_markets():
    """Get character markets for 4 randomly sampled characters with drawn/not_drawn odds"""
    try:
        # Get num_cards from request
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all characters
        response = supabase.table('breakingbad_trading').select('*').execute()
        all_characters = response.data
        
        if len(all_characters) < 4:
            return jsonify({'success': False, 'error': 'Not enough characters'}), 500
        
        # Sample 4 random characters for this round
        sampled_characters = random.sample(all_characters, 4)
        
        n = len(all_characters)  # Total number of characters
        
        character_markets = []
        
        for char in sampled_characters:
            char_id = char['character_id']
            char_name = char['name']
            
            # Probability of being drawn: num_cards / n
            prob_drawn = num_cards / n
            
            # Probability of NOT being drawn: (n - num_cards) / n
            prob_not_drawn = (n - num_cards) / n
            
            # Apply vig and get odds
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
            'character_markets': character_markets,
            'num_sampled': len(sampled_characters),
            'total_characters': n
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@breakingbad_bp.route('/crew-markets', methods=['POST'])
def get_crew_markets():
    """Get family markets for Breaking Bad families with drawn/not_drawn odds"""
    try:
        # Get num_cards from request
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all characters
        response = supabase.table('breakingbad_trading').select('*').execute()
        all_characters = response.data
        
        # Get unique families (exclude NULL/None)
        unique_families = list(set([char['family'] for char in all_characters if char.get('family')]))
        
        if len(unique_families) == 0:
            return jsonify({'success': True, 'crew_markets': []}), 200
        
        # Use all families (White, Schrader, Salamanca)
        n = len(all_characters)  # Total number of characters
        
        crew_markets = []
        
        for family_name in unique_families:
            # Count members in this family
            k = len([char for char in all_characters if char.get('family') == family_name])
            
            # Probability of family being drawn: 1 - C(n-k, num_cards) / C(n, num_cards)
            prob_not_drawn = math.comb(n - k, num_cards) / math.comb(n, num_cards) if n >= num_cards and (n - k) >= num_cards else 0
            prob_drawn = 1 - prob_not_drawn
            
            # Apply vig and get odds
            odds_drawn = apply_vig(prob_drawn)
            odds_not_drawn = apply_vig(prob_not_drawn)
            
            crew_markets.append({
                'crew_name': family_name,
                'crew_size': k,
                'drawn': {
                    'market_id': f'family_{family_name.replace(" ", "_").lower()}_drawn',
                    'market_type': 'family_drawn',
                    'text_on_screen': f'{family_name} Family - Drawn',
                    'odds_decimal': round(odds_drawn, 2),
                    'odds_american': decimal_to_american(odds_drawn),
                    'probability': round(prob_drawn * 100, 1)
                },
                'not_drawn': {
                    'market_id': f'family_{family_name.replace(" ", "_").lower()}_not_drawn',
                    'market_type': 'family_not_drawn',
                    'text_on_screen': f'{family_name} Family - Not Drawn',
                    'odds_decimal': round(odds_not_drawn, 2),
                    'odds_american': decimal_to_american(odds_not_drawn),
                    'probability': round(prob_not_drawn * 100, 1)
                }
            })
        
        return jsonify({
            'success': True,
            'crew_markets': crew_markets,
            'num_families': len(unique_families)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@breakingbad_bp.route('/special-markets', methods=['POST'])
def get_special_markets():
    """Get special markets (gender, lawyers, Emmy winners) with pricing"""
    try:
        # Get num_cards from request
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all characters
        response = supabase.table('breakingbad_trading').select('*').execute()
        characters = response.data
        n = len(characters)
        
        special_markets = []
        
        # Count totals
        num_men = sum(1 for char in characters if str(char.get('gender', '')).strip().upper() == 'M')
        num_women = n - num_men
        num_lawyers = sum(1 for char in characters if char.get('was_lawyer') == True)
        num_non_lawyers = n - num_lawyers
        num_emmy = sum(1 for char in characters if char.get('won_emmy') == True)
        num_non_emmy = n - num_emmy
        
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
        
        # Lawyer Markets
        # No Lawyers
        prob_no_lawyers = math.comb(num_non_lawyers, num_cards) / math.comb(n, num_cards) if num_non_lawyers >= num_cards else 0.0
        odds_no_lawyers = apply_vig(prob_no_lawyers, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'lawyer_none',
            'name': 'No Lawyers',
            'description': f'None of {num_cards} characters are lawyers',
            'odds_decimal': round(odds_no_lawyers, 2),
            'odds_american': decimal_to_american(odds_no_lawyers),
            'probability': round(prob_no_lawyers * 100, 1)
        })
        
        # At Least One Lawyer
        if num_non_lawyers >= num_cards:
            prob_no_lawyers_calc = math.comb(num_non_lawyers, num_cards) / math.comb(n, num_cards)
            prob_atleast_one_lawyer = 1.0 - prob_no_lawyers_calc
        else:
            prob_atleast_one_lawyer = 1.0
        odds_atleast_one_lawyer = apply_vig(prob_atleast_one_lawyer, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'lawyer_atleast_1',
            'name': 'At Least One Lawyer',
            'description': f'At least 1 of {num_cards} characters is a lawyer',
            'odds_decimal': round(odds_atleast_one_lawyer, 2),
            'odds_american': decimal_to_american(odds_atleast_one_lawyer),
            'probability': round(prob_atleast_one_lawyer * 100, 1)
        })
        
        # Emmy Winner Markets
        # No Emmy Winners
        prob_no_emmy = math.comb(num_non_emmy, num_cards) / math.comb(n, num_cards) if num_non_emmy >= num_cards else 0.0
        odds_no_emmy = apply_vig(prob_no_emmy, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'emmy_none',
            'name': 'No Emmy Winners',
            'description': f'None of {num_cards} characters won an Emmy',
            'odds_decimal': round(odds_no_emmy, 2),
            'odds_american': decimal_to_american(odds_no_emmy),
            'probability': round(prob_no_emmy * 100, 1)
        })
        
        # At Least One Emmy Winner
        if num_non_emmy >= num_cards:
            prob_no_emmy_calc = math.comb(num_non_emmy, num_cards) / math.comb(n, num_cards)
            prob_atleast_one_emmy = 1.0 - prob_no_emmy_calc
        else:
            prob_atleast_one_emmy = 1.0
        odds_atleast_one_emmy = apply_vig(prob_atleast_one_emmy, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'emmy_atleast_1',
            'name': 'At Least One Emmy Winner',
            'description': f'At least 1 of {num_cards} characters won an Emmy',
            'odds_decimal': round(odds_atleast_one_emmy, 2),
            'odds_american': decimal_to_american(odds_atleast_one_emmy),
            'probability': round(prob_atleast_one_emmy * 100, 1)
        })
        
        # Dead/Survived Markets
        # Count dead vs survived
        num_dead = sum(1 for char in characters if char.get('survived') == False)
        num_survived = n - num_dead
        
        # Over 1.5 Dead (2 or more dead)
        prob_over_1_5_dead = 0.0
        for k in range(2, num_cards + 1):
            if k <= num_dead and (num_cards - k) <= num_survived:
                prob_over_1_5_dead += (math.comb(num_dead, k) * math.comb(num_survived, num_cards - k)) / math.comb(n, num_cards)
        odds_over_1_5_dead = apply_vig(prob_over_1_5_dead, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'dead_over_1_5',
            'name': 'Over 1.5 Dead',
            'description': f'2 or more of {num_cards} characters are dead',
            'odds_decimal': round(odds_over_1_5_dead, 2),
            'odds_american': decimal_to_american(odds_over_1_5_dead),
            'probability': round(prob_over_1_5_dead * 100, 1)
        })
        
        # Under 1.5 Dead (0 or 1 dead)
        prob_under_1_5_dead = 1.0 - prob_over_1_5_dead
        odds_under_1_5_dead = apply_vig(prob_under_1_5_dead, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'dead_under_1_5',
            'name': 'Under 1.5 Dead',
            'description': f'0 or 1 of {num_cards} characters are dead',
            'odds_decimal': round(odds_under_1_5_dead, 2),
            'odds_american': decimal_to_american(odds_under_1_5_dead),
            'probability': round(prob_under_1_5_dead * 100, 1)
        })
        
        # Combined Age Markets
        # Calculate probabilities for age totals
        from itertools import combinations
        
        # Get all possible combinations and their age sums
        age_sums = []
        for combo in combinations(characters, num_cards):
            total_age = sum(char.get('age', 0) for char in combo)
            age_sums.append(total_age)
        
        total_combos = len(age_sums)
        
        # Over 121.5 Combined Age
        over_121_5_count = sum(1 for age_sum in age_sums if age_sum > 121.5)
        prob_over_121_5 = over_121_5_count / total_combos if total_combos > 0 else 0.0
        odds_over_121_5 = apply_vig(prob_over_121_5, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'age_over_121_5',
            'name': 'Over 121.5 Combined Age',
            'description': f'Combined age of {num_cards} characters is over 121.5',
            'odds_decimal': round(odds_over_121_5, 2),
            'odds_american': decimal_to_american(odds_over_121_5),
            'probability': round(prob_over_121_5 * 100, 1)
        })
        
        # Under 121.5 Combined Age
        prob_under_121_5 = 1.0 - prob_over_121_5
        odds_under_121_5 = apply_vig(prob_under_121_5, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'age_under_121_5',
            'name': 'Under 121.5 Combined Age',
            'description': f'Combined age of {num_cards} characters is under 121.5',
            'odds_decimal': round(odds_under_121_5, 2),
            'odds_american': decimal_to_american(odds_under_121_5),
            'probability': round(prob_under_121_5 * 100, 1)
        })
        
        # Over 140.5 Combined Age
        over_140_5_count = sum(1 for age_sum in age_sums if age_sum > 140.5)
        prob_over_140_5 = over_140_5_count / total_combos if total_combos > 0 else 0.0
        odds_over_140_5 = apply_vig(prob_over_140_5, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'age_over_140_5',
            'name': 'Over 140.5 Combined Age',
            'description': f'Combined age of {num_cards} characters is over 140.5',
            'odds_decimal': round(odds_over_140_5, 2),
            'odds_american': decimal_to_american(odds_over_140_5),
            'probability': round(prob_over_140_5 * 100, 1)
        })
        
        # Under 140.5 Combined Age
        prob_under_140_5 = 1.0 - prob_over_140_5
        odds_under_140_5 = apply_vig(prob_under_140_5, margin=SPECIALS_VIG_MARGIN)
        special_markets.append({
            'market_id': 'age_under_140_5',
            'name': 'Under 140.5 Combined Age',
            'description': f'Combined age of {num_cards} characters is under 140.5',
            'odds_decimal': round(odds_under_140_5, 2),
            'odds_american': decimal_to_american(odds_under_140_5),
            'probability': round(prob_under_140_5 * 100, 1)
        })
        
        return jsonify({
            'success': True,
            'special_markets': special_markets
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@breakingbad_bp.route('/settle', methods=['POST'])
def settle_draw():
    """Settle bets for a draw"""
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
            
            # Check family markets (drawn/not_drawn)
            elif market_id.startswith('family_') and '_drawn' in market_id:
                # Extract family name from market_id like "family_white_drawn"
                # Remove 'family_' prefix and '_drawn' or '_not_drawn' suffix
                if market_id.endswith('_not_drawn'):
                    family_slug = market_id.replace('family_', '').replace('_not_drawn', '')
                else:
                    family_slug = market_id.replace('family_', '').replace('_drawn', '')
                
                # Match family by slug (handle spaces in family names)
                family_matched = False
                for char in drawn_characters:
                    char_family = char.get('family', '')
                    if char_family and char_family.replace(' ', '_').lower() == family_slug:
                        family_matched = True
                        break
                
                if market_id.endswith('_not_drawn'):
                    # Won if NO member of this family was drawn
                    won = not family_matched
                else:
                    # Won if at least one member of this family was drawn
                    won = family_matched
            
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
            
            elif market_id.startswith('lawyer_'):
                # lawyer_none, lawyer_atleast_1
                parts = market_id.split('_')
                # Join remaining parts for count
                count = '_'.join(parts[1:])  # none or atleast_1
                
                lawyer_count = sum(1 for char in drawn_characters if char.get('was_lawyer') == True)
                
                if count == 'none':
                    won = lawyer_count == 0
                elif count == 'atleast_1':
                    won = lawyer_count >= 1
            
            elif market_id.startswith('emmy_'):
                # emmy_none, emmy_atleast_1
                parts = market_id.split('_')
                # Join remaining parts for count
                count = '_'.join(parts[1:])  # none or atleast_1
                
                emmy_count = sum(1 for char in drawn_characters if char.get('won_emmy') == True)
                
                if count == 'none':
                    won = emmy_count == 0
                elif count == 'atleast_1':
                    won = emmy_count >= 1
            
            elif market_id.startswith('dead_'):
                # dead_over_1_5, dead_under_1_5
                parts = market_id.split('_')
                # Join remaining parts: over_1_5 or under_1_5
                count = '_'.join(parts[1:])
                
                dead_count = sum(1 for char in drawn_characters if char.get('survived') == False)
                
                if count == 'over_1_5':
                    won = dead_count >= 2
                elif count == 'under_1_5':
                    won = dead_count <= 1
            
            elif market_id.startswith('age_'):
                # age_over_121_5, age_under_121_5, age_over_140_5, age_under_140_5
                parts = market_id.split('_')
                # Join remaining parts: over_121_5, under_121_5, over_140_5, under_140_5
                count = '_'.join(parts[1:])
                
                total_age = sum(char.get('age', 0) for char in drawn_characters)
                
                if count == 'over_121_5':
                    won = total_age > 121.5
                elif count == 'under_121_5':
                    won = total_age <= 121.5
                elif count == 'over_140_5':
                    won = total_age > 140.5
                elif count == 'under_140_5':
                    won = total_age <= 140.5
            
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
            'total_pnl': round(total_pnl, 2),
            'drawn_characters': drawn_characters
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@breakingbad_bp.route('/end-session', methods=['POST'])
def end_session():
    """Record session bet in bets table when user ends session"""
    try:
        # Extract user_id from JWT token in Authorization header
        from api.routes import _get_user_from_header
        user_id = _get_user_from_header(request)
        
        if not user_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
        data = request.json
        num_bets = data.get('num_bets', 0)
        net_pnl = float(data.get('net_pnl', 0))
        
        # Insert bet record into bets table
        bet_data = {
            'user_id': user_id,
            'market': 'Trading',
            'outcome': f'Breaking Bad Session {num_bets} Bets',
            'point': None,
            'bet_size': abs(net_pnl),
            'odds_american': '+100',
            'result': 'Win' if net_pnl >= 0 else 'Loss',
            'bet_pnl': net_pnl,
            'game_id': 11
        }
        
        supabase.table('bets').insert(bet_data).execute()
        
        return jsonify({
            'success': True,
            'message': 'Session recorded'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@breakingbad_bp.route('/stats', methods=['GET'])
def get_stats():
    """Get user stats for Breaking Bad trading"""
    try:
        user_id = request.args.get('user_id')
        
        if not user_id:
            return jsonify({
                'success': True,
                'sessions_played': 0,
                'total_pnl': 0
            }), 200
        
        # Return placeholder for now
        return jsonify({
            'success': True,
            'sessions_played': 0,
            'total_pnl': 0
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

"""
Trading game routes for Sopranos and other trading games
"""
from flask import Blueprint, jsonify, request
from database.supabase_client import get_supabase_client
from utils.chop import build_session_bet_rows  # type: ignore
import random
from typing import List, Dict
import math

trading_bp = Blueprint('trading', __name__, url_prefix='/api/trading')

# Constants
VIG_MARGIN = 0.03  # 3% vig
SPECIALS_VIG_MARGIN = 0.045  # 4.5% vig for special markets

# Get supabase client
supabase = get_supabase_client()


def get_sopranos_settings() -> Dict:
    """Fetch settings from sopranos_settings table"""
    try:
        response = supabase.table('sopranos_settings').select('setting, value').execute()
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


def calculate_probability(deck: List[Dict], condition_func, num_cards: int) -> float:
    """Calculate probability of a condition being met in a draw"""
    total_combinations = math.comb(len(deck), num_cards)
    
    favorable = 0
    # Sample combinations (for large decks, use approximation)
    if len(deck) > 30:
        # Use sampling for efficiency
        samples = 10000
        for _ in range(samples):
            draw = random.sample(deck, num_cards)
            if condition_func(draw):
                favorable += 1
        probability = favorable / samples
    else:
        # Exact calculation for small decks
        from itertools import combinations
        for combo in combinations(deck, num_cards):
            if condition_func(list(combo)):
                favorable += 1
        probability = favorable / total_combinations
    
    return max(0.01, min(0.99, probability))  # Bound between 1% and 99%


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
    """Apply vigorish with asymmetric margin - more vig on underdogs, less on favorites
    
    Traditional symmetric vig creates terrible lines on extreme probabilities.
    Bookies apply more margin to longshots (underdogs) and keep base margin for favorites.
    
    Asymmetric adjustment:
    - For probabilities far from 50%, we increase vig on underdog side
    - Distance from 0.5 determines how much extra vig to apply
    - Underdogs (prob < 0.5) get extra margin
    - Favorites (prob > 0.5) keep base margin (no reduction)
    
    Example with 4.5% base margin:
    - 6% probability: apply ~6% margin → better underdog odds
    - 94% probability: apply 4.5% margin → reasonable favorite odds
    """
    # Calculate distance from 50% (evens)
    distance_from_evens = abs(probability - 0.5)
    
    # Asymmetric vig adjustment
    if probability < 0.5:
        # Underdog: add extra margin based on how unlikely it is
        # The longer the shot, the more margin we take
        extra_margin = distance_from_evens * 0.4  # Scale factor
        adjusted_margin = margin + extra_margin
    else:
        # Favorite: keep base margin at 4.5%
        adjusted_margin = margin
    
    # Ensure margin stays reasonable (between 1% and 8%)
    adjusted_margin = max(0.01, min(0.08, adjusted_margin))
    
    # Apply vig by dividing by (1 - adjusted_margin)
    vigged_prob = probability / (1.0 - adjusted_margin)
    
    # Cap at 0.9999 to avoid decimal odds below 1.0
    vigged_prob = min(vigged_prob, 0.9999)
    
    # Convert to decimal odds
    decimal_odds = 1.0 / vigged_prob if vigged_prob > 0 else 100.0
    return decimal_odds


@trading_bp.route('/sopranos/characters', methods=['GET'])
def get_characters():
    """Get all Sopranos characters"""
    try:
        response = supabase.table('sopranos_trading').select('*').execute()
        return jsonify({
            'success': True,
            'characters': response.data
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@trading_bp.route('/sopranos/draw', methods=['POST'])
def create_draw():
    """Create a new draw of random characters based on settings"""
    try:
        # Fetch settings
        settings = get_sopranos_settings()
        card_nature = settings.get('card_nature', 'static')
        card_count_setting = int(settings.get('card_count', '3'))
        
        # Determine number of cards to draw
        if card_nature == 'random':
            # Randomly sample from 2, 3, or 4
            num_cards = random.choice([2, 3, 4])
        else:
            # Use static card count from settings
            num_cards = card_count_setting
        
        # Get all characters
        response = supabase.table('sopranos_trading').select('*').execute()
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


@trading_bp.route('/sopranos/markets', methods=['POST'])
def get_markets():
    """Calculate odds for all markets given current characters"""
    try:
        # Get num_cards from request
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all characters for probability calculation
        response = supabase.table('sopranos_trading').select('*').execute()
        all_characters = response.data
        
        if not all_characters:
            return jsonify({'success': False, 'error': 'No characters found'}), 500
        
        markets = []
        
        # Market 1: All Married
        def all_married(draw):
            return all(char['married_s1'] for char in draw)
        
        prob_married = calculate_probability(all_characters, all_married, num_cards)
        odds_married = apply_vig(prob_married)
        
        markets.append({
            'market_id': 'all_married',
            'name': 'All Married',
            'description': 'All 3 characters were married in Season 3',
            'odds_decimal': round(odds_married, 2),
            'odds_american': decimal_to_american(odds_married),
            'probability': round(prob_married * 100, 1)
        })
        
        # Market 2: No Bosses
        bosses = ['Tony Soprano', 'Corrado "Junior" Soprano', 'Carmine Lupertazzi Sr.']
        
        def no_bosses(draw):
            return not any(char['name'] in bosses for char in draw)
        
        prob_no_bosses = calculate_probability(all_characters, no_bosses, num_cards)
        odds_no_bosses = apply_vig(prob_no_bosses)
        
        markets.append({
            'market_id': 'no_bosses',
            'name': 'No Bosses',
            'description': 'None of Tony, Junior, or Carmine Sr.',
            'odds_decimal': round(odds_no_bosses, 2),
            'odds_american': decimal_to_american(odds_no_bosses),
            'probability': round(prob_no_bosses * 100, 1)
        })
        
        # Market 3: All Men
        def all_men(draw):
            return all(char['gender'] == 'M' for char in draw)
        
        prob_all_men = calculate_probability(all_characters, all_men, num_cards)
        odds_all_men = apply_vig(prob_all_men)
        
        markets.append({
            'market_id': 'all_men',
            'name': 'All Men',
            'description': 'All 3 characters are male',
            'odds_decimal': round(odds_all_men, 2),
            'odds_american': decimal_to_american(odds_all_men),
            'probability': round(prob_all_men * 100, 1)
        })
        
        return jsonify({
            'success': True,
            'markets': markets
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@trading_bp.route('/sopranos/character-markets', methods=['POST'])
def get_character_markets():
    """Get character markets for 4 randomly sampled characters with drawn/not_drawn odds"""
    try:
        # Get num_cards from request
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all characters
        response = supabase.table('sopranos_trading').select('*').execute()
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


@trading_bp.route('/sopranos/crew-markets', methods=['POST'])
def get_crew_markets():
    """Get crew markets for 3 randomly sampled crews with drawn/not_drawn odds"""
    try:
        # Get num_cards from request
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all characters
        response = supabase.table('sopranos_trading').select('*').execute()
        all_characters = response.data
        
        # Get unique crews (exclude NULL/None)
        unique_crews = list(set([char['crew'] for char in all_characters if char.get('crew')]))
        
        if len(unique_crews) < 3:
            return jsonify({'success': False, 'error': 'Not enough crews'}), 500
        
        # Sample 3 random crews for this round
        sampled_crews = random.sample(unique_crews, 3)
        
        n = len(all_characters)  # Total number of characters
        
        crew_markets = []
        
        for crew_name in sampled_crews:
            # Count members in this crew
            k = len([char for char in all_characters if char.get('crew') == crew_name])
            
            # Probability of crew being drawn: 1 - C(n-k, num_cards) / C(n, num_cards)
            prob_not_drawn = math.comb(n - k, num_cards) / math.comb(n, num_cards) if n >= num_cards and (n - k) >= num_cards else 0
            prob_drawn = 1 - prob_not_drawn
            
            # Apply vig and get odds
            odds_drawn = apply_vig(prob_drawn)
            odds_not_drawn = apply_vig(prob_not_drawn)
            
            crew_markets.append({
                'crew_name': crew_name,
                'crew_size': k,
                'drawn': {
                    'market_id': f'crew_{crew_name.replace(" ", "_").lower()}_drawn',
                    'market_type': 'crew_drawn',
                    'text_on_screen': f'{crew_name} Crew - Drawn',
                    'odds_decimal': round(odds_drawn, 2),
                    'odds_american': decimal_to_american(odds_drawn),
                    'probability': round(prob_drawn * 100, 1)
                },
                'not_drawn': {
                    'market_id': f'crew_{crew_name.replace(" ", "_").lower()}_not_drawn',
                    'market_type': 'crew_not_drawn',
                    'text_on_screen': f'{crew_name} Crew - Not Drawn',
                    'odds_decimal': round(odds_not_drawn, 2),
                    'odds_american': decimal_to_american(odds_not_drawn),
                    'probability': round(prob_not_drawn * 100, 1)
                }
            })
        
        return jsonify({
            'success': True,
            'crew_markets': crew_markets,
            'num_sampled': len(sampled_crews),
            'total_crews': len(unique_crews)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@trading_bp.route('/sopranos/special-markets', methods=['POST'])
def get_special_markets():
    """Get special markets (gender, captain, married) with pricing"""
    try:
        # Get num_cards from request
        num_cards = request.json.get('num_cards', 3) if request.json else 3
        
        # Get all characters
        response = supabase.table('sopranos_trading').select('*').execute()
        characters = response.data
        n = len(characters)
        
        # Fetch special markets from DB
        markets_response = supabase.table('sopranos_markets').select('*').in_(
            'market_type', ['gender', 'captain', 'married', 'combined_age', 'boss']
        ).execute()
        
        db_markets = markets_response.data or []
        
        special_markets = []
        
        for market in db_markets:
            market_type = market.get('market_type')
            count = market.get('count')
            category = market.get('category')
            market_id = market.get('market_id')
            
            probability = 0.0
            
            # Gender markets
            if market_type == 'gender':
                if category == 'men':
                    # Count men - strip whitespace since DB column is character(1)
                    num_men = sum(1 for char in characters if str(char.get('gender', '')).strip().upper() == 'M')
                    if count == 'all':
                        # All cards are men: C(num_men, num_cards) / C(n, num_cards)
                        probability = math.comb(num_men, num_cards) / math.comb(n, num_cards)
                    elif count == 'atleast_1':
                        # At least 1 man: 1 - P(all women)
                        num_women = n - num_men
                        if num_women >= num_cards:
                            prob_all_women = math.comb(num_women, num_cards) / math.comb(n, num_cards)
                            probability = 1.0 - prob_all_women
                        else:
                            probability = 1.0  # Not enough women to exclude all men
                
                elif category == 'women':
                    # Count women - strip whitespace since DB column is character(1)
                    num_women = sum(1 for char in characters if str(char.get('gender', '')).strip().upper() == 'F')
                    if count == 'all':
                        # All cards are women: C(num_women, num_cards) / C(n, num_cards)
                        probability = math.comb(num_women, num_cards) / math.comb(n, num_cards)
                    elif count == 'atleast_1':
                        # At least 1 woman: 1 - P(all men)
                        num_men = n - num_women
                        if num_men >= num_cards:
                            prob_all_men = math.comb(num_men, num_cards) / math.comb(n, num_cards)
                            probability = 1.0 - prob_all_men
                        else:
                            probability = 1.0  # Not enough men to exclude all women
            
            # Captain markets
            elif market_type == 'captain':
                # Count captains by checking s3_position column
                num_captains = sum(1 for char in characters 
                                 if str(char.get('s3_position', '')).strip().lower() == 'captain')
                num_non_captains = n - num_captains
                
                if count == 'all':
                    # All cards are captains: C(num_captains, num_cards) / C(n, num_cards)
                    if num_captains >= num_cards:
                        probability = math.comb(num_captains, num_cards) / math.comb(n, num_cards)
                    else:
                        probability = 0.0  # Not enough captains
                
                elif count == 'none':
                    # No captains: C(num_non_captains, num_cards) / C(n, num_cards)
                    if num_non_captains >= num_cards:
                        probability = math.comb(num_non_captains, num_cards) / math.comb(n, num_cards)
                    else:
                        probability = 0.0  # Not enough non-captains
                
                elif count == 'atleast_1':
                    # At least 1 captain: 1 - P(no captains)
                    if num_non_captains >= num_cards:
                        prob_no_captains = math.comb(num_non_captains, num_cards) / math.comb(n, num_cards)
                        probability = 1.0 - prob_no_captains
                    else:
                        probability = 1.0  # Not enough non-captains to exclude captains
            
            # Boss markets
            elif market_type == 'boss':
                # Count bosses by checking s3_position column
                num_bosses = sum(1 for char in characters 
                               if str(char.get('s3_position', '')).strip().lower() == 'boss')
                num_non_bosses = n - num_bosses
                
                if count == 'none':
                    # No bosses: C(num_non_bosses, num_cards) / C(n, num_cards)
                    if num_non_bosses >= num_cards:
                        probability = math.comb(num_non_bosses, num_cards) / math.comb(n, num_cards)
                    else:
                        probability = 0.0  # Not enough non-bosses
                
                elif count == 'atleast_1':
                    # At least 1 boss: 1 - P(no bosses)
                    if num_non_bosses >= num_cards:
                        prob_no_bosses = math.comb(num_non_bosses, num_cards) / math.comb(n, num_cards)
                        probability = 1.0 - prob_no_bosses
                    else:
                        probability = 1.0  # Not enough non-bosses to exclude bosses
            
            # Married markets
            elif market_type == 'married':
                # Count married characters
                num_married = sum(1 for char in characters if char.get('married_s1') == True)
                num_not_married = n - num_married
                
                if count == 'none':
                    # No married: C(num_not_married, num_cards) / C(n, num_cards)
                    if num_not_married >= num_cards:
                        probability = math.comb(num_not_married, num_cards) / math.comb(n, num_cards)
                    else:
                        probability = 0.0  # Not enough non-married
                
                elif count == 'atleast_1':
                    # At least 1 married: 1 - P(no married)
                    if num_not_married >= num_cards:
                        prob_no_married = math.comb(num_not_married, num_cards) / math.comb(n, num_cards)
                        probability = 1.0 - prob_no_married
                    else:
                        probability = 1.0  # Not enough non-married to exclude married
            
            # Combined Age markets (Over/Under with Monte Carlo)
            elif market_type == 'combined_age':
                point_value = market.get('point')  # e.g., 105.5, 125.5, 155.5
                
                if point_value and count in ['over', 'under']:
                    # Run Monte Carlo simulation
                    iterations = 10000
                    over_count = 0
                    
                    for _ in range(iterations):
                        # Draw num_cards random characters
                        drawn = random.sample(characters, num_cards)
                        total_age = sum(char.get('age_s3', 0) for char in drawn)
                        
                        if total_age > point_value:
                            over_count += 1
                    
                    prob_over = over_count / iterations
                    prob_under = 1.0 - prob_over
                    
                    if count == 'over':
                        probability = prob_over
                    elif count == 'under':
                        probability = prob_under
            
            # Skip if probability wasn't set (shouldn't happen but safety check)
            if probability is None or probability <= 0.0:
                continue
            
            # Apply vig and convert to odds
            decimal_odds = apply_vig(probability, SPECIALS_VIG_MARGIN)
            american_odds = decimal_to_american(decimal_odds)
            
            # Construct market_id string for frontend matching
            # Format: market_type_category_count or market_type_count if no category
            if market_type == 'combined_age':
                # combined_age uses count for over/under, include point to make unique
                # Format: combined_age_over_105_5, combined_age_under_125_5, etc.
                point_str = str(point_value).replace('.', '_')
                market_id_str = f"{market_type}_{count}_{point_str}"
            elif category and count:
                market_id_str = f"{market_type}_{category}_{count}"
            elif count:
                market_id_str = f"{market_type}_{count}"
            elif category:
                market_id_str = f"{market_type}_{category}"
            else:
                market_id_str = f"{market_type}_{market.get('market_id')}"
            
            special_markets.append({
                'market_id': market_id_str,
                'name': market.get('text_on_screen', f"{market_type} {category} {count}"),
                'text_on_screen': market.get('text_on_screen'),
                'market_type': market_type,
                'category': category,
                'count': count,
                'probability': round(probability, 4),
                'odds_decimal': round(decimal_odds, 2),
                'odds_american': american_odds
            })
        
        return jsonify({
            'success': True,
            'special_markets': special_markets
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@trading_bp.route('/sopranos/settle', methods=['POST'])
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
        
        bosses = ['Tony Soprano', 'Corrado "Junior" Soprano', 'Carmine Lupertazzi Sr.']
        
        results = []
        total_pnl = 0
        
        for bet in bets:
            market_id = bet['market_id']
            stake = float(bet['stake'])
            odds_decimal = float(bet['odds_decimal'])
            
            won = False
            
            # Get actual number of cards drawn
            num_cards_drawn = len(drawn_characters)
            
            # Check special markets (gender, captain)
            if market_id.startswith('gender_'):
                # Parse: gender_men_all, gender_women_atleast_1, etc.
                parts = market_id.split('_')
                category = parts[1]  # men or women
                # Join remaining parts for count (handles atleast_1 which has underscore)
                count = '_'.join(parts[2:])  # all or atleast_1
                
                if category == 'men':
                    # Count men - strip whitespace since DB column is character(1)
                    men_count = sum(1 for char in drawn_characters if str(char.get('gender', '')).strip().upper() == 'M')
                    if count == 'all':
                        won = men_count == num_cards_drawn
                    elif count == 'atleast_1':
                        won = men_count >= 1
                
                elif category == 'women':
                    # Count women - strip whitespace since DB column is character(1)
                    women_count = sum(1 for char in drawn_characters if str(char.get('gender', '')).strip().upper() == 'F')
                    if count == 'all':
                        won = women_count == num_cards_drawn
                    elif count == 'atleast_1':
                        won = women_count >= 1
            
            elif market_id.startswith('captain_'):
                # Parse: captain_captain_all, captain_captain_none, captain_captain_atleast_1
                parts = market_id.split('_')
                # Join remaining parts for count (handles atleast_1 which has underscore)
                count = '_'.join(parts[2:])  # all, none, or atleast_1
                
                # Count captains by checking s3_position column
                captain_count = sum(1 for char in drawn_characters 
                                  if str(char.get('s3_position', '')).strip().lower() == 'captain')
                
                if count == 'all':
                    won = captain_count == num_cards_drawn  # All drawn are captains
                elif count == 'none':
                    won = captain_count == 0  # No captains drawn
                elif count == 'atleast_1':
                    won = captain_count >= 1  # At least 1 captain drawn
            
            elif market_id.startswith('boss_'):
                # Parse: boss_none, boss_atleast_1
                parts = market_id.split('_')
                # Join remaining parts for count (handles atleast_1 which has underscore)
                count = '_'.join(parts[1:])  # none or atleast_1
                
                # Count bosses by checking s3_position column
                boss_count = sum(1 for char in drawn_characters 
                               if str(char.get('s3_position', '')).strip().lower() == 'boss')
                
                if count == 'none':
                    won = boss_count == 0  # No bosses drawn
                elif count == 'atleast_1':
                    won = boss_count >= 1  # At least 1 boss drawn
            
            elif market_id.startswith('married_'):
                # Parse: married_married_none, married_married_atleast_1
                parts = market_id.split('_')
                # Join remaining parts for count (handles atleast_1 which has underscore)
                count = '_'.join(parts[2:])  # none or atleast_1
                
                # Count married characters
                married_count = sum(1 for char in drawn_characters if char.get('married_s1') == True)
                
                if count == 'none':
                    won = married_count == 0  # No married drawn
                elif count == 'atleast_1':
                    won = married_count >= 1  # At least 1 married drawn
            
            elif market_id.startswith('combined_age_'):
                # Parse: combined_age_over_105_5, combined_age_under_125_5, etc.
                parts = market_id.split('_')
                count = parts[2]  # over or under
                # Reconstruct point from parts[3] and parts[4] (e.g., ['105', '5'] -> 105.5)
                point_value = float(f"{parts[3]}.{parts[4]}")
                
                # Calculate total age of drawn characters
                total_age = sum(char.get('age_s3', 0) for char in drawn_characters)
                
                if count == 'over':
                    won = total_age > point_value
                elif count == 'under':
                    won = total_age < point_value
            
            # Check legacy hardcoded markets
            elif market_id == 'all_married':
                won = all(char['married_s1'] for char in drawn_characters)
            
            elif market_id == 'no_bosses':
                won = not any(char['name'] in bosses for char in drawn_characters)
            
            elif market_id == 'all_men':
                won = all(char['gender'] == 'M' for char in drawn_characters)
            
            # Check character markets (drawn/not_drawn)
            elif market_id.startswith('char_') and '_drawn' in market_id:
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
            
            # Check crew markets (drawn/not_drawn)
            elif market_id.startswith('crew_') and '_drawn' in market_id:
                # Extract crew name from market_id like "crew_dimeo_crime_family_drawn"
                # Remove 'crew_' prefix and '_drawn' or '_not_drawn' suffix
                if market_id.endswith('_not_drawn'):
                    crew_slug = market_id.replace('crew_', '').replace('_not_drawn', '')
                else:
                    crew_slug = market_id.replace('crew_', '').replace('_drawn', '')
                
                # Get all crew names from drawn characters
                drawn_crews = [char.get('crew') for char in drawn_characters if char.get('crew')]
                
                # Match crew by slug (handle spaces in crew names)
                crew_matched = False
                for char in drawn_characters:
                    char_crew = char.get('crew', '')
                    if char_crew and char_crew.replace(' ', '_').lower() == crew_slug:
                        crew_matched = True
                        break
                
                if market_id.endswith('_not_drawn'):
                    # Won if NO member of this crew was drawn
                    won = not crew_matched
                else:
                    # Won if at least one member of this crew was drawn
                    won = crew_matched
            
            push = False  # Add push logic later if needed
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


@trading_bp.route('/sopranos/stats', methods=['GET'])
def get_stats():
    """Get user stats for Sopranos trading"""
    try:
        user_id = request.args.get('user_id')
        
        if not user_id:
            return jsonify({
                'success': True,
                'sessions_played': 0,
                'total_pnl': 0
            }), 200
        
        # Count sessions (bets with market "Sopranos Trading Session")
        # For now, return placeholder
        return jsonify({
            'success': True,
            'sessions_played': 0,
            'total_pnl': 0
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@trading_bp.route('/sopranos/end-session', methods=['POST'])
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
            outcome=f'Sopranos Session {num_bets} Bets',
            game_id=10,
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


@trading_bp.route('/chop-users', methods=['GET', 'OPTIONS'])
def chop_users():
    """Return users available as chop partners (excludes the caller).

    Response: { users: [{ user_id, screenname, display_name }] }
    - screenname: canonical screenname from users table (may be empty string)
    - display_name: screenname if non-empty, else the email local-part
    """
    if request.method == 'OPTIONS':
        return ('', 200)

    try:
        from api.routes import _get_user_from_header
        caller_id = _get_user_from_header(request)

        resp = supabase.table('users').select('user_id,screenname,email').execute()
        urows = resp.data or []

        out = []
        for u in urows:
            uid = u.get('user_id')
            if not uid:
                continue
            if caller_id and str(uid) == str(caller_id):
                continue
            screenname = (u.get('screenname') or '').strip()
            email = u.get('email') or ''
            if screenname:
                display_name = screenname
            elif '@' in email:
                display_name = email.split('@', 1)[0]
            else:
                display_name = str(uid)[:8]
            out.append({
                'user_id': str(uid),
                'screenname': screenname,
                'display_name': display_name,
            })

        out.sort(key=lambda x: x['display_name'].lower())
        return jsonify({'success': True, 'users': out}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@trading_bp.route('/sopranos/reference', methods=['GET'])
def get_sopranos_reference():
    """Get reference data for Sopranos characters - for Help page"""
    try:
        # Get all characters
        response = supabase.table('sopranos_trading').select('*').order('gender', desc=False).order('name').execute()
        characters = response.data
        
        # Group by gender and married status
        characters_by_gender = {}
        for char in characters:
            gender_label = 'Male' if char['gender'] == 'M' else 'Female'
            if gender_label not in characters_by_gender:
                characters_by_gender[gender_label] = []
            characters_by_gender[gender_label].append({
                'name': char['name'],
                'married_s1': char['married_s1'],
                'age_s3': char['age_s3']
            })
        
        # Group by crew
        crews = {}
        for char in characters:
            if char['crew']:
                crew = char['crew']
                if crew not in crews:
                    crews[crew] = []
                crews[crew].append({
                    'name': char['name'],
                    's3_position': char['s3_position']
                })
        
        # Get bosses only
        bosses = [
            {
                'name': char['name'],
                'crew': char['crew'],
                's3_position': char['s3_position']
            }
            for char in characters 
            if char['s3_position'] and 'Boss' in char['s3_position']
        ]
        
        # All characters with age
        characters_with_age = sorted(
            [{'name': char['name'], 'age_s3': char['age_s3'], 'gender': 'Male' if char['gender'] == 'M' else 'Female'} 
             for char in characters],
            key=lambda x: x['age_s3']
        )
        
        return jsonify({
            'success': True,
            'characters_by_gender': characters_by_gender,
            'crews': crews,
            'bosses': bosses,
            'characters_by_age': characters_with_age
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@trading_bp.route('/locks', methods=['GET'])
def get_trading_locks():
    """Get lock status for trading games"""
    try:
        # Fetch all locks
        response = supabase.table('trading_locks').select('*').execute()
        locks = response.data or []
        
        # Build lock status dict
        lock_status = {
            'master': False,
            'sopranos': False,
            'breaking_bad': False
        }
        
        for lock in locks:
            lock_name = lock.get('lock_name', '').lower()
            if lock_name in lock_status:
                lock_status[lock_name] = lock.get('locked', False)
        
        return jsonify({
            'success': True,
            'locks': lock_status
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

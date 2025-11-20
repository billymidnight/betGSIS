#!/usr/bin/env python3
"""
Test script to verify pricing routes work with Supabase client.
Tests:
1. price_for_thresholds function with Supabase geo_players
2. recompute_all_lines_supabase function
3. Validates response structure matches frontend expectations
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

def test_pricing_service():
    """Test pricing_service functions directly."""
    print("\n" + "="*60)
    print("Testing Pricing Service with Supabase")
    print("="*60)
    
    try:
        from services.pricing_service import price_for_thresholds, recompute_all_lines_supabase
        from database.geo_repo import get_geo_players
        
        # First, verify we can fetch players
        print("\n1. Fetching geo_players from Supabase...")
        all_players = get_geo_players()
        print(f"   ✓ Fetched {len(all_players)} players")
        for p in all_players[:3]:
            print(f"     - {p.get('name')} (μ={p.get('mean_score')}, σ={p.get('stddev_score')})")
        
        if not all_players:
            print("   ✗ ERROR: No players found in geo_players table!")
            return False
        
        # Test 2: price_for_thresholds
        print("\n2. Testing price_for_thresholds()...")
        player_ids = [p.get('player_id') for p in all_players[:2]]
        thresholds = [7500, 10000, 15000]
        results = price_for_thresholds(player_ids, thresholds, margin_bps=700)
        
        print(f"   ✓ Computed prices for {len(player_ids)} players x {len(thresholds)} thresholds")
        
        # Verify structure
        for pid in player_ids:
            if pid not in results:
                print(f"   ✗ ERROR: Player {pid} not in results!")
                return False
            
            for t in thresholds:
                if t not in results[pid]:
                    print(f"   ✗ ERROR: Threshold {t} not in results for player {pid}!")
                    return False
                
                entry = results[pid][t]
                required_keys = ['prob_over', 'prob_under', 'odds_over_decimal', 'odds_under_decimal', 'odds_over_american', 'odds_under_american']
                for key in required_keys:
                    if key not in entry:
                        print(f"   ✗ ERROR: Missing key '{key}' in results[{pid}][{t}]!")
                        return False
        
        # Display sample result
        pid = player_ids[0]
        t = thresholds[1]
        sample = results[pid][t]
        print(f"\n   Sample result for player {pid} at threshold {t}:")
        print(f"     prob_over:              {sample['prob_over']:.4f}")
        print(f"     prob_under:             {sample['prob_under']:.4f}")
        print(f"     odds_over_decimal:      {sample['odds_over_decimal']:.2f}")
        print(f"     odds_under_decimal:     {sample['odds_under_decimal']:.2f}")
        print(f"     odds_over_american:     {sample['odds_over_american']}")
        print(f"     odds_under_american:    {sample['odds_under_american']}")
        
        # Test 3: recompute_all_lines_supabase
        print("\n3. Testing recompute_all_lines_supabase()...")
        recompute_result = recompute_all_lines_supabase(thresholds=[7500, 10000, 15000], margin_bps=700)
        
        print(f"   ✓ Recomputed lines:")
        print(f"     - Inserted: {recompute_result.get('inserted')}")
        print(f"     - Updated: {recompute_result.get('updated')}")
        print(f"     - Players processed: {len(recompute_result.get('results', {}))}")
        
        # Verify results structure
        if 'results' not in recompute_result:
            print("   ✗ ERROR: 'results' key missing from recompute output!")
            return False
        
        for pid, by_threshold in recompute_result['results'].items():
            for t, entry in by_threshold.items():
                required_keys = ['prob_over', 'prob_under', 'odds_over_decimal', 'odds_under_decimal', 'odds_over_american', 'odds_under_american']
                for key in required_keys:
                    if key not in entry:
                        print(f"   ✗ ERROR: Missing key '{key}' in recompute results!")
                        return False
        
        print("\n✓ ALL PRICING SERVICE TESTS PASSED!")
        return True
        
    except Exception as e:
        print(f"\n✗ PRICING SERVICE TEST FAILED:")
        print(f"   Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_pricing_routes():
    """Test pricing routes via Flask app."""
    print("\n" + "="*60)
    print("Testing Pricing Routes via Flask")
    print("="*60)
    
    try:
        from app import create_app
        
        app = create_app()
        client = app.test_client()
        
        # Get player IDs from database first
        from database.geo_repo import get_geo_players
        all_players = get_geo_players()
        if not all_players:
            print("✗ ERROR: No players in database!")
            return False
        
        player_ids = [p.get('player_id') for p in all_players[:2]]
        thresholds = [7500, 10000, 15000]
        
        # Test 1: POST /api/pricing/lines
        print("\n1. Testing POST /api/pricing/lines...")
        response = client.post('/api/pricing/lines', json={
            'playerIds': player_ids,
            'thresholds': thresholds,
            'model': 'normal',
            'marginBps': 700
        })
        
        if response.status_code != 200:
            print(f"   ✗ ERROR: Response status {response.status_code}")
            print(f"   Response: {response.get_json()}")
            return False
        
        data = response.get_json()
        if 'results' not in data:
            print(f"   ✗ ERROR: 'results' not in response!")
            return False
        
        print(f"   ✓ Response received with {len(data['results'])} player results")
        
        # Verify structure
        for pid_str in map(str, player_ids):
            if pid_str not in data['results']:
                print(f"   ✗ ERROR: Player {pid_str} not in results!")
                return False
            
            for t_str in map(str, thresholds):
                if t_str not in data['results'][pid_str]:
                    print(f"   ✗ ERROR: Threshold {t_str} not in results for player {pid_str}!")
                    return False
        
        # Display sample
        first_pid = str(player_ids[0])
        first_t = str(thresholds[0])
        sample = data['results'][first_pid][first_t]
        print(f"\n   Sample for player {first_pid} at threshold {first_t}:")
        print(f"     odds_over_american: {sample.get('odds_over_american')}")
        print(f"     odds_under_american: {sample.get('odds_under_american')}")
        
        # Test 2: POST /api/pricing/recompute-all
        print("\n2. Testing POST /api/pricing/recompute-all...")
        response = client.post('/api/pricing/recompute-all', json={
            'thresholds': thresholds,
            'marginBps': 700
        })
        
        if response.status_code != 200:
            print(f"   ✗ ERROR: Response status {response.status_code}")
            print(f"   Response: {response.get_json()}")
            return False
        
        data = response.get_json()
        if 'result' not in data:
            print(f"   ✗ ERROR: 'result' not in response!")
            return False
        
        result_info = data['result']
        print(f"   ✓ Recompute response received")
        print(f"     - Inserted: {result_info.get('inserted')}")
        print(f"     - Updated: {result_info.get('updated')}")
        print(f"     - Players in results: {len(result_info.get('results', {}))}")
        
        print("\n✓ ALL PRICING ROUTE TESTS PASSED!")
        return True
        
    except Exception as e:
        print(f"\n✗ PRICING ROUTE TEST FAILED:")
        print(f"   Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == '__main__':
    print("\n" + "="*60)
    print("PRICING SERVICE & ROUTES TEST SUITE")
    print("="*60)
    
    service_ok = test_pricing_service()
    routes_ok = test_pricing_routes()
    
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Pricing Service:  {'✓ PASSED' if service_ok else '✗ FAILED'}")
    print(f"Pricing Routes:   {'✓ PASSED' if routes_ok else '✗ FAILED'}")
    print("="*60)
    
    sys.exit(0 if (service_ok and routes_ok) else 1)

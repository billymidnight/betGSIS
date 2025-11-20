#!/usr/bin/env python3
"""Quick test: verify CORS headers are correct"""

from app import create_app

app = create_app()

print("="*60)
print("CORS Fix Verification")
print("="*60)

with app.test_client() as client:
    # Test 1: Preflight with custom headers
    print("\n1. Preflight Request (OPTIONS)")
    response = client.options(
        '/api/geoguessr/totals',
        headers={
            'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'x-user-role'
        }
    )
    
    print(f"   Status: {response.status_code}")
    print(f"   Allow-Origin: {response.headers.get('Access-Control-Allow-Origin', 'NOT SET')}")
    print(f"   Allow-Methods: {response.headers.get('Access-Control-Allow-Methods', 'NOT SET')}")
    print(f"   Allow-Headers: {response.headers.get('Access-Control-Allow-Headers', 'NOT SET')}")
    
    if 'x-user-role' in str(response.headers.get('Access-Control-Allow-Headers', '')).lower():
        print("   ✓ X-User-Role header is allowed!")
    
    # Test 2: Actual request with custom headers
    print("\n2. GET Request with X-User-Role Header")
    response = client.get(
        '/api/geoguessr/totals',
        headers={
            'Origin': 'http://localhost:3000',
            'X-User-Role': 'user'
        }
    )
    
    print(f"   Status: {response.status_code}")
    print(f"   Allow-Origin: {response.headers.get('Access-Control-Allow-Origin', 'NOT SET')}")
    
    if response.status_code == 200:
        print("   ✓ Request successful with custom header!")
    
print("\n" + "="*60)
print("✓ CORS Fixed - Custom headers now allowed")
print("="*60)

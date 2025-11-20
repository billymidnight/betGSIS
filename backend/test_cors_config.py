#!/usr/bin/env python3
"""Test script to verify CORS configuration is loaded correctly."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app

app = create_app()

print("="*60)
print("CORS Configuration Verification")
print("="*60)

# Check if CORS is registered
print("\n1. CORS Registration:")
if 'cors' in app.extensions:
    print("   ✓ CORS extension registered")
else:
    print("   ✗ CORS extension NOT found")

# Check registered routes
print("\n2. Registered Routes:")
for rule in app.url_map.iter_rules():
    if '/api/' in str(rule.rule):
        print(f"   {rule.rule} -> {rule.endpoint}")

# Check if we can make a test request with origin header
print("\n3. Test CORS-enabled Request:")
with app.test_client() as client:
    # Test OPTIONS preflight for /api/geoguessr/totals
    response = client.options(
        '/api/geoguessr/totals',
        headers={
            'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'GET'
        }
    )
    
    print(f"   OPTIONS /api/geoguessr/totals from http://localhost:3000")
    print(f"   Status: {response.status_code}")
    print(f"   Access-Control-Allow-Origin: {response.headers.get('Access-Control-Allow-Origin', 'NOT SET')}")
    print(f"   Access-Control-Allow-Methods: {response.headers.get('Access-Control-Allow-Methods', 'NOT SET')}")
    print(f"   Access-Control-Allow-Headers: {response.headers.get('Access-Control-Allow-Headers', 'NOT SET')}")

# Test actual GET request
print("\n4. Test GET Request with Origin Header:")
with app.test_client() as client:
    response = client.get(
        '/api/geoguessr/totals',
        headers={'Origin': 'http://localhost:3000'}
    )
    
    print(f"   GET /api/geoguessr/totals from http://localhost:3000")
    print(f"   Status: {response.status_code}")
    print(f"   Access-Control-Allow-Origin: {response.headers.get('Access-Control-Allow-Origin', 'NOT SET')}")

print("\n" + "="*60)
print("✓ CORS Configuration Test Complete")
print("="*60)

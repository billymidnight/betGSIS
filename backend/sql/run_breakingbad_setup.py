#!/usr/bin/env python3
"""
Run all Breaking Bad SQL setup scripts in order.
This creates the tables and inserts all the data.
"""
import os
from supabase import create_client

# Get Supabase credentials from environment
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# SQL files to run in order
sql_files = [
    'create_breakingbad_trading.sql',
    'create_breakingbad_settings.sql',
    'create_breakingbad_markets.sql',
    'insert_breakingbad_characters.sql',
    'insert_breakingbad_character_markets.sql'
]

script_dir = os.path.dirname(os.path.abspath(__file__))

print("🎬 Setting up Breaking Bad Trading...")
print("=" * 60)

for sql_file in sql_files:
    file_path = os.path.join(script_dir, sql_file)
    
    if not os.path.exists(file_path):
        print(f"❌ File not found: {sql_file}")
        continue
    
    print(f"\n📄 Running {sql_file}...")
    
    with open(file_path, 'r') as f:
        sql = f.read()
    
    try:
        # Execute the SQL
        result = supabase.rpc('exec_sql', {'sql': sql}).execute()
        print(f"✅ {sql_file} completed successfully")
    except Exception as e:
        print(f"❌ Error in {sql_file}: {str(e)}")
        # Continue with other files even if one fails

print("\n" + "=" * 60)
print("✅ Breaking Bad Trading setup complete!")
print("\nYou can now:")
print("  1. Start the backend: cd backend && python app.py")
print("  2. Start the frontend: cd frontend && npm run dev")
print("  3. Visit: http://localhost:5173/trading/breaking-bad")

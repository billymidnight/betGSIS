# CORS Setup - Code Changes Summary

## File: `backend/app.py`

### What Changed

**BEFORE:**
```python
def create_app():
    app = Flask(__name__)
    # Enable CORS for frontend
    CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173"]}})
    # ... rest of code
```

**AFTER:**
```python
def create_app():
    app = Flask(__name__)
    # Enable CORS for frontend (React dev server on port 3000 and Vite on 5173)
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173"
            ],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })
    # ... rest of code
```

## Key Changes Explained

| Change | Why | Effect |
|--------|-----|--------|
| `"http://localhost:3000"` | React dev server hostname | Frontend can call API |
| `"http://127.0.0.1:3000"` | Alternative localhost IP | Works with both `localhost` and `127.0.0.1` |
| `"http://localhost:5173"` | Vite dev server (if used) | Maintains existing Vite support |
| `"http://127.0.0.1:5173"` | Alternative Vite IP | Covers both IP formats |
| `"methods": [...]` | Explicit HTTP methods | Browser sends correct Access-Control-Allow-Methods header |
| `"allow_headers": [...]` | Custom headers | Allows JSON content type and future auth headers |

## What Stayed the Same

✓ Import statement: `from flask_cors import CORS` (already there)
✓ Blueprint registration: `app.register_blueprint(api_bp)`
✓ Route definitions: All routes work as before
✓ Port: Flask still runs on 4000
✓ Debug mode: Still enabled for development

## Deployment vs Development

### Development (Current)
```python
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            ...
        ]
    }
})
```

### Production (Future - if needed)
```python
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "https://mydomain.com",
            "https://www.mydomain.com"
        ]
    }
})
```

## Complete File: `backend/app.py` (Updated)

```python
import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

def create_app():
    app = Flask(__name__)
    # Enable CORS for frontend (React dev server on port 3000 and Vite on 5173)
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173"
            ],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })

    # Register API blueprint (it already includes its own /api prefix)
    from api.routes import api_bp
    app.register_blueprint(api_bp)

    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok"})

    return app

# ... rest of the file (database initialization, main block, etc.)
```

## Usage in Frontend

### Axios Example
```typescript
// frontend/src/lib/api/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:4000',
});

export async function fetchGeoTotals() {
  const response = await api.get('/api/geoguessr/totals');
  return response.data;
}

export async function fetchGeoPrice(playerId: number, threshold: number) {
  const response = await api.post('/api/geoguessr/price', {
    playerId,
    threshold,
    marginBps: 700
  });
  return response.data;
}
```

### No CORS Errors!
✓ Browser allows the request
✓ Frontend receives data
✓ Console has no warnings

## Troubleshooting

If you still see CORS errors:

1. **Restart Flask**
   ```bash
   # Kill old process
   pkill -f "python app.py"
   
   # Start new
   cd backend
   python app.py
   ```

2. **Check origin matches exactly**
   - Browser sends: `Origin: http://localhost:3000`
   - Config must include: `"http://localhost:3000"`
   - Case-sensitive, no trailing slashes

3. **Verify flask-cors is installed**
   ```bash
   pip list | grep flask-cors
   # Should show: flask-cors 6.0.1 (or similar)
   ```

4. **Check browser console**
   - Open DevTools (F12)
   - Go to Network tab
   - Look for response headers
   - Find `Access-Control-Allow-Origin`

## Summary

✅ **One file changed**: `backend/app.py`
✅ **One function updated**: `create_app()`
✅ **Minimal changes**: Just the CORS configuration dict
✅ **No new dependencies**: flask-cors already installed
✅ **Result**: Frontend on :3000 can call backend on :4000 without CORS errors

---

**Status**: Ready to use! Frontend and backend can communicate freely.

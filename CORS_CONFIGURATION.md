# CORS Configuration - Complete ✓

## Changes Made

### Updated `backend/app.py`

The CORS configuration in `create_app()` now allows requests from your React frontend running on port 3000:

```python
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
```

## What This Configuration Does

| Setting | Purpose |
|---------|---------|
| `r"/api/*"` | Applies CORS rules to all routes matching `/api/*` pattern |
| `origins` | **Allowed frontend origins** - React (3000) and Vite (5173), localhost and 127.0.0.1 variants |
| `methods` | **Allowed HTTP methods** - GET, POST, PUT, DELETE, OPTIONS (OPTIONS needed for preflight requests) |
| `allow_headers` | **Allowed request headers** - Content-Type (JSON) and Authorization (for future auth tokens) |

## How It Works

When your React frontend makes a request to `http://localhost:4000/api/geoguessr/totals`:

1. **Browser sends** a preflight OPTIONS request (for POST/complex requests)
   ```
   OPTIONS /api/geoguessr/totals
   Origin: http://localhost:3000
   ```

2. **Flask-CORS intercepts** and checks if origin is in allowed list
   
3. **Flask responds** with CORS headers:
   ```
   Access-Control-Allow-Origin: http://localhost:3000
   Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
   Access-Control-Allow-Headers: Content-Type, Authorization
   ```

4. **Browser allows** the actual request (GET, POST, etc.)

5. **Frontend gets** response with data

## Frontend Code (Axios/Fetch)

Your frontend code now works without CORS errors:

### Using Axios (from `api.ts`)
```typescript
const api = axios.create({
  baseURL: 'http://localhost:4000',
});

// This now works without CORS errors:
const response = await api.get('/api/geoguessr/totals');
```

### Using Fetch
```typescript
// This now works without CORS errors:
const response = await fetch('http://localhost:4000/api/geoguessr/totals', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  }
});
const data = await response.json();
```

## Testing CORS

To verify CORS is working, check browser console when making a request to Flask:

### ✓ Should See (Success)
```
GET http://localhost:4000/api/geoguessr/totals 200 OK
Response headers include:
  access-control-allow-origin: http://localhost:3000
  access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS
  access-control-allow-headers: Content-Type, Authorization
```

### ✗ Should NOT See (The old error)
```
Access to XMLHttpRequest at 'http://localhost:4000/api/geoguessr/totals' 
from origin 'http://localhost:3000' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present.
```

## Prerequisites

Flask-CORS is already installed (verified from imports in app.py). If not:
```bash
pip install flask-cors
```

## Important Notes

1. **Restart Flask** after making this change for it to take effect
   ```bash
   # Kill existing Flask process
   pkill -f "python app.py"
   
   # Restart
   cd backend
   python app.py
   ```

2. **Keep development origins in config** - Only these are allowed in dev:
   - `http://localhost:3000` (React)
   - `http://127.0.0.1:3000` (React alternative)
   - `http://localhost:5173` (Vite)
   - `http://127.0.0.1:5173` (Vite alternative)

3. **Production**: Before deploying, update origins to your production domain(s) and consider using environment variables

## Summary

✅ CORS now properly configured for React frontend on port 3000
✅ Supports all necessary HTTP methods (GET, POST, PUT, DELETE)
✅ Allows Content-Type and Authorization headers
✅ Both localhost and 127.0.0.1 variants work
✅ All /api/* routes are covered

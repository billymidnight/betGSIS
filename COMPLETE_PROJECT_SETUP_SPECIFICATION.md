# 🔥 COMPLETE PROJECT SETUP SPECIFICATION - MEDICARE CLINIC WEB APP 🔥

## 📋 PROJECT OVERVIEW
This specification provides EXACT instructions to replicate the entire tech stack, architecture, and setup from the geo_book sportsbook project for a new Medicare/Clinic web application.

**Tech Stack:**
- **Frontend**: React 18.3 + TypeScript + Vite 5.4 + React Router 6.30
- **Backend**: Python 3.12 + Flask 2.2 + Flask-CORS
- **Database**: Supabase PostgreSQL (with Supabase Python SDK)
- **State Management**: Zustand 5.0
- **HTTP Client**: Axios 1.13
- **Authentication**: Supabase Auth (JWT tokens)
- **Styling**: Custom CSS (no framework)
- **Deployment**: Backend (Render/Railway), Frontend (Vercel)

---

## 🏗️ PROJECT STRUCTURE

```
medicare-clinic-app/
├── backend/
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py           # Main API blueprint with all routes
│   ├── database/
│   │   ├── __init__.py
│   │   └── db_repo.py          # Database helper functions
│   ├── models/                 # (Optional SQLAlchemy models if needed)
│   │   ├── __init__.py
│   │   └── base.py
│   ├── services/
│   │   ├── __init__.py
│   │   └── business_logic.py   # Core business logic
│   ├── utils/
│   │   ├── __init__.py
│   │   └── helpers.py          # Utility functions
│   ├── .env                    # Environment variables (DO NOT COMMIT)
│   ├── .env.example            # Template for .env
│   ├── app.py                  # Flask app factory and entry point
│   ├── supabase_client.py      # Supabase client initialization
│   ├── requirements.txt        # Python dependencies
│   └── README.md
│
└── frontend/
    ├── public/
    │   └── assets/             # Static assets
    ├── src/
    │   ├── components/
    │   │   ├── Layout/
    │   │   │   ├── Navbar.tsx
    │   │   │   └── Footer.tsx
    │   │   └── Shared/
    │   │       └── ToastContainer.tsx
    │   ├── lib/
    │   │   ├── api/
    │   │   │   └── api.ts      # Axios API client with all endpoints
    │   │   ├── state/
    │   │   │   └── authStore.ts # Zustand auth state management
    │   │   └── supabaseClient.ts # Supabase client initialization
    │   ├── pages/
    │   │   ├── Home.tsx        # Homepage (placeholder)
    │   │   ├── Login.tsx       # Login/Signup page
    │   │   └── Dashboard.tsx   # Main dashboard (placeholder)
    │   ├── styles/
    │   │   ├── index.css       # Global styles
    │   │   └── variables.css   # CSS variables
    │   ├── App.tsx             # Main app component with router
    │   ├── main.tsx            # React entry point
    │   ├── router.tsx          # Route protection components
    │   ├── vite-env.d.ts       # Vite type definitions
    │   └── custom.d.ts         # Custom type definitions
    ├── .env                    # Frontend environment variables (DO NOT COMMIT)
    ├── index.html              # HTML entry point
    ├── package.json            # Node dependencies
    ├── tsconfig.json           # TypeScript configuration
    ├── vite.config.mjs         # Vite configuration
    └── README.md
```

---

## 🚀 BACKEND SETUP

### 1. CREATE BACKEND DIRECTORY AND FILES

#### Terminal Commands:
```powershell
# Navigate to project root
cd "C:\Users\pritesh\Documents\Project Hub"

# Create project directory
mkdir medicare-clinic-app
cd medicare-clinic-app

# Create backend structure
mkdir backend
cd backend
mkdir api, database, services, utils, models
New-Item -ItemType File -Path api\__init__.py, api\routes.py
New-Item -ItemType File -Path database\__init__.py, database\db_repo.py
New-Item -ItemType File -Path services\__init__.py, services\business_logic.py
New-Item -ItemType File -Path utils\__init__.py, utils\helpers.py
New-Item -ItemType File -Path models\__init__.py, models\base.py
New-Item -ItemType File -Path .env, .env.example, app.py, supabase_client.py, requirements.txt, README.md
```

### 2. BACKEND requirements.txt
```txt
Flask>=2.2.0
flask-cors>=3.0.10
python-dotenv>=1.0.0
SQLAlchemy>=1.4.0
psycopg2-binary>=2.9.0
numpy>=1.24.0
scipy>=1.10.0
gunicorn>=21.0.0
supabase>=2.0.0
```

### 3. BACKEND .env.example
```env
# Supabase Configuration
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=your-supabase-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here

# Database (if using direct PostgreSQL connection)
DATABASE_URL=postgresql://postgres:PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres

# Flask Configuration
PORT=4000
FLASK_ENV=development
JWT_SECRET=your-jwt-secret-key-here

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173
```

### 4. BACKEND app.py
```python
import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

def create_app():
    app = Flask(__name__)
    
    # Configure CORS
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                "http://localhost:3000",
                "http://localhost:5173",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:5173",
                # Add production URLs here
            ],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": [
                "Content-Type", 
                "Authorization", 
                "X-User-Email", 
                "X-User-Name", 
                "X-User-Role"
            ],
            "supports_credentials": True
        }
    })

    # Register API blueprint
    from api.routes import api_bp
    app.register_blueprint(api_bp)

    # Health check endpoint
    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok", "message": "Medicare Clinic API is running"})

    return app


if __name__ == '__main__':
    app = create_app()
    port = int(os.getenv('PORT', 4000))
    app.run(host='0.0.0.0', port=port, debug=True)

# Expose app for gunicorn
app = create_app()
```

### 5. BACKEND supabase_client.py
```python
import os
import logging

try:
    from supabase import create_client
except Exception:
    create_client = None

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')


def get_admin_client():
    """Return a Supabase client using the service role key for privileged operations."""
    if create_client is None:
        logging.warning('supabase-py not installed; supabase client unavailable')
        return None
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logging.warning('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_user_from_access_token(access_token: str):
    """Return user dict from access token using admin client."""
    client = get_admin_client()
    if not client:
        return None
    try:
        if hasattr(client.auth, 'get_user'):
            res = client.auth.get_user(access_token)
            if isinstance(res, dict) and res.get('data') and res['data'].get('user'):
                return res['data']['user']
            elif isinstance(res, dict) and res.get('user'):
                return res.get('user')
            else:
                return res
        else:
            return client.auth.api.get_user(access_token)
    except Exception as e:
        logging.debug('get_user_from_access_token error: %s', e)
        return None
```

### 6. BACKEND api/routes.py (STARTER TEMPLATE)
```python
from flask import Blueprint, jsonify, request
import logging

from supabase_client import get_admin_client, get_user_from_access_token

api_bp = Blueprint('api', __name__, url_prefix='/api')


def _get_user_from_header(req):
    """Extract and validate user from Authorization header."""
    auth = req.headers.get('Authorization') or req.headers.get('authorization')
    if not auth:
        return None
    
    token = auth.split(' ', 1)[1].strip() if auth.lower().startswith('bearer ') else auth.strip()
    user_obj = get_user_from_access_token(token)
    
    if not user_obj:
        return None
    
    try:
        uid = user_obj.get('id') if isinstance(user_obj, dict) else getattr(user_obj, 'id', None)
        return str(uid) if uid else None
    except Exception:
        return None


# ============= AUTHENTICATION ROUTES =============

@api_bp.route('/auth/me', methods=['GET', 'OPTIONS'])
def auth_me():
    """Get current authenticated user info."""
    if request.method == 'OPTIONS':
        return ('', 200)
    
    try:
        user_id = _get_user_from_header(request)
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401
        
        client = get_admin_client()
        if not client:
            return jsonify({"error": "Database unavailable"}), 503
        
        # Fetch user from Supabase users table
        res = client.table('users').select('*').eq('user_id', user_id).execute()
        users = res.data if hasattr(res, 'data') else []
        
        if not users:
            return jsonify({"error": "User not found"}), 404
        
        return jsonify({"user": users[0]}), 200
        
    except Exception as e:
        logging.exception('auth_me error')
        return jsonify({"error": str(e)}), 500


# ============= PLACEHOLDER ROUTES =============

@api_bp.route('/home', methods=['GET', 'OPTIONS'])
def home():
    """Homepage data endpoint - PLACEHOLDER."""
    if request.method == 'OPTIONS':
        return ('', 200)
    
    return jsonify({
        "message": "Welcome to Medicare Clinic App",
        "version": "1.0.0"
    }), 200


@api_bp.route('/dashboard', methods=['GET', 'OPTIONS'])
def dashboard():
    """Dashboard data endpoint - PLACEHOLDER."""
    if request.method == 'OPTIONS':
        return ('', 200)
    
    try:
        user_id = _get_user_from_header(request)
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401
        
        # Add dashboard logic here
        return jsonify({
            "message": "Dashboard data",
            "user_id": user_id
        }), 200
        
    except Exception as e:
        logging.exception('dashboard error')
        return jsonify({"error": str(e)}), 500


# ============= ADD MORE ROUTES HERE =============
```

### 7. BACKEND database/db_repo.py (STARTER TEMPLATE)
```python
from supabase_client import get_admin_client


def get_client():
    """Get Supabase admin client."""
    return get_admin_client()


# Example helper function
def fetch_all_records(table_name: str):
    """Fetch all records from a table."""
    client = get_client()
    if not client:
        return []
    
    try:
        res = client.table(table_name).select('*').execute()
        return res.data if hasattr(res, 'data') else []
    except Exception as e:
        print(f"Error fetching from {table_name}: {e}")
        return []


# Add more database helper functions here
```

### 8. INSTALL BACKEND DEPENDENCIES
```powershell
# In backend directory
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

---

## 🎨 FRONTEND SETUP

### 1. CREATE FRONTEND WITH VITE

```powershell
# Navigate to project root
cd "C:\Users\pritesh\Documents\Project Hub\medicare-clinic-app"

# Create Vite React TypeScript project
npm create vite@latest frontend -- --template react-ts

# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Install additional required packages
npm install @supabase/supabase-js axios react-router-dom zustand
npm install -D @types/react-router-dom
```

### 2. FRONTEND package.json
```json
{
  "name": "medicare-clinic-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.81.1",
    "axios": "^1.13.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.30.2",
    "zustand": "^5.0.8"
  },
  "devDependencies": {
    "@types/react": "^18.3.26",
    "@types/react-dom": "^18.3.7",
    "@types/react-router-dom": "^5.3.3",
    "@vitejs/plugin-react": "^5.1.0",
    "typescript": "^5.9.3",
    "vite": "^5.4.21"
  }
}
```

### 3. FRONTEND .env
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here
VITE_API_URL=http://localhost:4000/api
```

### 4. FRONTEND vite.config.mjs
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
  }
});
```

### 5. FRONTEND tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "ESNext"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

### 6. FRONTEND src/lib/supabaseClient.ts
```typescript
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (import.meta.env.DEV) {
    console.log('Supabase URL:', SUPABASE_URL ? '[set]' : '[MISSING]')
    console.log('Supabase ANON KEY:', SUPABASE_ANON ? '[set]' : '[MISSING]')
}

if (!SUPABASE_URL || !SUPABASE_ANON) {
    if (import.meta.env.DEV) {
        throw new Error('Missing Supabase configuration')
    }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
export default supabase
```

### 7. FRONTEND src/lib/api/api.ts
```typescript
import axios from 'axios';
import { useAuthStore } from '../state/authStore';
import supabase from '../supabaseClient';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const api = axios.create({
  baseURL,
  timeout: 10000,
});

// Attach auth headers
api.interceptors.request.use((config) => {
  try {
    const user = useAuthStore.getState().user;
    if (user) {
      const headers = (config.headers as Record<string, any>) || {};
      if (user.email) headers['X-User-Email'] = user.email;
      if (user.username) headers['X-User-Name'] = user.username;
      if (user.role) headers['X-User-Role'] = user.role;
      config.headers = headers as any;
    }
  } catch (e) {
    // ignore
  }
  return config;
});

// ============= AUTH API =============

export async function fetchCurrentUser() {
  const session = await supabase.auth.getSession();
  let token = (session as any)?.data?.session?.access_token;
  if (!token) token = useAuthStore.getState().accessToken ?? null;
  if (!token) return null;
  
  const headers = { Authorization: `Bearer ${token}` };
  const r = await api.get('/auth/me', { headers });
  return r.data.user || null;
}

// ============= PLACEHOLDER ENDPOINTS =============

export async function fetchHomeData() {
  const r = await api.get('/home');
  return r.data;
}

export async function fetchDashboardData() {
  const session = await supabase.auth.getSession();
  let token = (session as any)?.data?.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  
  const headers = { Authorization: `Bearer ${token}` };
  const r = await api.get('/dashboard', { headers });
  return r.data;
}

// ============= ADD MORE API FUNCTIONS HERE =============

export default api;
```

### 8. FRONTEND src/lib/state/authStore.ts (ZUSTAND)
```typescript
import { create } from 'zustand';
import supabase from '../supabaseClient';

interface User {
  user_id: string;
  email: string;
  username?: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  logout: () => void;
  initializeAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  accessToken: null,
  
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  
  setAccessToken: (token) => set({ accessToken: token }),
  
  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false, accessToken: null });
  },
  
  initializeAuth: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      
      if (session && session.access_token) {
        set({ accessToken: session.access_token });
        
        // Fetch user from backend
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/auth/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          set({ user: data.user, isAuthenticated: true });
        }
      }
      
      // Listen to auth changes
      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session && session.access_token) {
          set({ accessToken: session.access_token });
          
          const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/auth/me`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
          
          if (response.ok) {
            const data = await response.json();
            set({ user: data.user, isAuthenticated: true });
          }
        } else {
          set({ user: null, isAuthenticated: false, accessToken: null });
        }
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
    }
  }
}));
```

### 9. FRONTEND src/router.tsx
```tsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from './lib/state/authStore';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}

export function RootRedirect() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return <Navigate to={isAuthenticated ? "/home" : "/login"} replace />;
}
```

### 10. FRONTEND src/pages/Login.tsx (PLACEHOLDER)
```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabaseClient';
import { useAuthStore } from '../lib/state/authStore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const initializeAuth = useAuthStore((s) => s.initializeAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Check your email for verification link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await initializeAuth();
        navigate('/home');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px' }}>
      <h1>{isSignup ? 'Sign Up' : 'Login'}</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
        />
        <button type="submit" style={{ width: '100%', padding: '10px' }}>
          {isSignup ? 'Sign Up' : 'Login'}
        </button>
      </form>
      <p style={{ marginTop: '20px', textAlign: 'center' }}>
        {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
        <button onClick={() => setIsSignup(!isSignup)} style={{ background: 'none', border: 'none', color: 'blue', cursor: 'pointer' }}>
          {isSignup ? 'Login' : 'Sign Up'}
        </button>
      </p>
    </div>
  );
}
```

### 11. FRONTEND src/pages/Home.tsx (PLACEHOLDER)
```tsx
import React from 'react';
import { useAuthStore } from '../lib/state/authStore';

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Medicare Clinic App - Home</h1>
      <p>Welcome, {user?.email || 'User'}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### 12. FRONTEND src/App.tsx
```tsx
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './lib/state/authStore';
import { ProtectedRoute, PublicRoute, RootRedirect } from './router';
import Login from './pages/Login';
import Home from './pages/Home';

export default function App() {
  const initializeAuth = useAuthStore((s) => s.initializeAuth);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
```

### 13. FRONTEND src/main.tsx
```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 14. FRONTEND src/styles/index.css (BASIC STARTER)
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: #0a0a0a;
  color: #ffffff;
  line-height: 1.6;
}

#root {
  min-height: 100vh;
}

button {
  cursor: pointer;
  font-family: inherit;
}

input {
  font-family: inherit;
}
```

---

## 📊 SUPABASE SETUP

### REQUIRED SUPABASE TABLES

#### 1. `users` table (for user management)
```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  username TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = user_id);
```

#### 2. Add more tables as needed for your Medicare/Clinic app

---

## 🔧 ENVIRONMENT SETUP CHECKLIST

### Backend `.env` (MUST FILL THESE):
```
SUPABASE_URL=<GET_FROM_SUPABASE_PROJECT_SETTINGS>
SUPABASE_KEY=<GET_ANON_KEY_FROM_SUPABASE>
SUPABASE_SERVICE_ROLE_KEY=<GET_SERVICE_ROLE_KEY_FROM_SUPABASE>
PORT=4000
```

### Frontend `.env` (MUST FILL THESE):
```
VITE_SUPABASE_URL=<SAME_AS_BACKEND_SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<SAME_AS_BACKEND_SUPABASE_KEY>
VITE_API_URL=http://localhost:4000/api
```

---

## 🚀 RUNNING THE APPLICATION

### Terminal 1 - Backend:
```powershell
cd "C:\Users\pritesh\Documents\Project Hub\medicare-clinic-app\backend"
.\venv\Scripts\Activate.ps1
python app.py
```

**Backend will run on:** `http://localhost:4000`

### Terminal 2 - Frontend:
```powershell
cd "C:\Users\pritesh\Documents\Project Hub\medicare-clinic-app\frontend"
npm run dev
```

**Frontend will run on:** `http://localhost:3000`

---

## ✅ VERIFICATION STEPS

1. **Backend Health Check:**
   - Open browser: `http://localhost:4000/health`
   - Should see: `{"status":"ok","message":"Medicare Clinic API is running"}`

2. **Frontend Load:**
   - Open browser: `http://localhost:3000`
   - Should redirect to login page

3. **Supabase Connection:**
   - Check browser console for Supabase logs
   - Should see: `Supabase URL: [set]` and `Supabase ANON KEY: [set]`

4. **CORS Working:**
   - Try logging in - if no CORS errors in console, CORS is configured correctly

---

## 📦 DEPLOYMENT

### Backend (Render/Railway):
1. Connect GitHub repo
2. Set environment variables (all from `.env`)
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`

### Frontend (Vercel):
1. Connect GitHub repo
2. Set environment variables (all from `.env`)
3. Framework preset: Vite
4. Build command: `npm run build`
5. Output directory: `dist`

---

## 🔥 CRITICAL NOTES

1. **NEVER commit `.env` files** - add to `.gitignore`
2. **Always use `VITE_` prefix** for frontend env vars
3. **Service Role Key is SECRET** - only use on backend
4. **All API routes must have OPTIONS handler** for CORS preflight
5. **Always extract user from JWT token** - never trust client-provided user ID
6. **Use Supabase RLS (Row Level Security)** for database security
7. **All routes needing auth must call `_get_user_from_header(request)`**
8. **Zustand store MUST call `initializeAuth()` on app mount**
9. **React Router MUST use `ProtectedRoute` wrapper for authenticated pages**
10. **Axios interceptor MUST attach user headers from Zustand store**

---

## 🎯 NEXT STEPS AFTER SETUP

Once setup is complete and verified:

1. **Create Database Schema** - Design tables in Supabase
2. **Add Business Logic** - Implement core features in `services/`
3. **Build API Endpoints** - Add routes to `api/routes.py`
4. **Create Frontend Pages** - Add pages to `src/pages/`
5. **Add API Functions** - Add to `src/lib/api/api.ts`
6. **Style Components** - Add CSS to `src/styles/`
7. **Test Everything** - Verify all features work end-to-end

---

## 📞 TROUBLESHOOTING

**Backend won't start:**
- Check Python version: `python --version` (need 3.8+)
- Verify venv activated: should see `(venv)` in terminal
- Check all env vars set in `.env`

**Frontend won't start:**
- Check Node version: `node --version` (need 18+)
- Delete `node_modules` and run `npm install` again
- Check all env vars set in `.env`

**CORS errors:**
- Verify frontend URL is in `CORS origins` list in `app.py`
- Check OPTIONS handler exists on backend route

**Auth not working:**
- Verify Supabase keys are correct
- Check `users` table exists in Supabase
- Verify RLS policies are set up

---

## 🎉 TEMPLATE IS READY!

This is the EXACT setup from geo_book project, generalized for any new application. Every file, every configuration, every dependency is documented. Now you can start coding the Medicare Clinic features! 🔥

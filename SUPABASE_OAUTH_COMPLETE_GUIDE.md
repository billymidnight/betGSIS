# 🔐 SUPABASE OAUTH IMPLEMENTATION GUIDE

## Complete Authentication Flow Documentation for Replication

> **Purpose**: This document provides a comprehensive, project-agnostic guide to implementing Supabase OAuth authentication with custom user management. Use this as a blueprint for any project requiring email-based authentication with email verification.

---

## 📋 TABLE OF CONTENTS

1. [Architecture Overview](#architecture-overview)
2. [Environment Configuration](#environment-configuration)
3. [File Structure](#file-structure)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Authentication Workflows](#authentication-workflows)
7. [Key Functions Reference](#key-functions-reference)
8. [Supabase Configuration](#supabase-configuration)
9. [Testing & Debugging](#testing--debugging)

---

## 🏗️ ARCHITECTURE OVERVIEW

### High-Level Flow

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Frontend   │ ◄─────► │   Supabase   │ ◄─────► │   Backend    │
│  (React/TS)  │         │     Auth     │         │   (Flask)    │
└──────────────┘         └──────────────┘         └──────────────┘
       │                        │                        │
       │                        │                        │
       ▼                        ▼                        ▼
  Auth Store            JWT Tokens              Custom Users DB
  (Zustand)            (Access Token)           (Supabase Table)
```

### Components Overview

1. **Supabase Auth Service** - Handles authentication, email verification, JWT tokens
2. **Frontend Auth Store** - Manages local auth state (user, token, session)
3. **Backend API** - Validates tokens, manages custom user data
4. **Custom Users Table** - Stores application-specific user data (screenname, role, etc.)

---

## ⚙️ ENVIRONMENT CONFIGURATION

### Backend Environment Variables (.env)

```bash
# Supabase Configuration
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=your-supabase-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here

# API Configuration (optional)
PORT=4000
```

**Key Points:**
- `SUPABASE_KEY` (anon key) - For client-side operations (limited permissions)
- `SUPABASE_SERVICE_ROLE_KEY` - For server-side admin operations (bypasses RLS)

### Frontend Environment Variables (.env)

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here

# API Configuration
VITE_API_URL=http://localhost:4000/api
```

**Key Points:**
- Use `VITE_` prefix for Vite build tool
- Anon key is safe for frontend (limited permissions)
- Never expose service role key in frontend

---

## 📁 FILE STRUCTURE

### Backend Files

```
backend/
├── supabase_client.py          # Supabase admin client setup
├── api/
│   └── routes.py               # Auth routes (/auth/me, /auth/create_user)
└── .env                        # Environment variables
```

### Frontend Files

```
frontend/
├── src/
│   ├── lib/
│   │   ├── supabaseClient.ts   # Supabase client initialization
│   │   └── state/
│   │       └── authStore.ts    # Auth state management (Zustand)
│   ├── pages/
│   │   └── Login.tsx           # Login/Signup UI
│   └── .env                    # Environment variables
```

---

## 🔧 BACKEND IMPLEMENTATION

### 1. Supabase Client Setup (`supabase_client.py`)

```python
import os
import logging
from supabase import create_client

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')

def get_admin_client():
    """
    Returns a Supabase client with service role privileges.
    Use for server-side operations that bypass Row Level Security (RLS).
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logging.warning('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def get_user_from_access_token(access_token: str):
    """
    Validates access token and returns user object.
    Returns None if token invalid.
    """
    client = get_admin_client()
    if not client:
        return None
    try:
        # Try to get user from token
        if hasattr(client.auth, 'get_user'):
            res = client.auth.get_user(access_token)
            # Handle different response formats
            if isinstance(res, dict) and res.get('data') and res['data'].get('user'):
                return res['data']['user']
            elif isinstance(res, dict) and res.get('user'):
                return res.get('user')
            return res
        else:
            # Fallback for older versions
            return client.auth.api.get_user(access_token)
    except Exception as e:
        logging.debug(f'get_user_from_access_token error: {e}')
        return None
```

**Key Functions:**
- `get_admin_client()` - Creates Supabase client with admin privileges
- `get_user_from_access_token()` - Validates JWT and extracts user data

---

### 2. Auth Helper Functions (`api/routes.py`)

```python
from flask import Blueprint, jsonify, request
from supabase_client import get_admin_client, get_user_from_access_token

api_bp = Blueprint('api', __name__, url_prefix='/api')

def _get_user_from_header(req):
    """
    Extracts and validates user ID from Authorization header.
    Returns user_id (UUID string) or None.
    """
    auth = req.headers.get('Authorization') or req.headers.get('authorization')
    if not auth:
        return None
    
    # Extract token from "Bearer <token>" format
    if auth.lower().startswith('bearer '):
        token = auth.split(' ', 1)[1].strip()
    else:
        token = auth.strip()
    
    # Validate token using admin client
    client = get_admin_client()
    if not client:
        user_obj = get_user_from_access_token(token)
        if not user_obj:
            return None
        # Extract user ID
        if isinstance(user_obj, dict):
            uid = user_obj.get('id') or user_obj.get('user', {}).get('id')
        else:
            uid = getattr(user_obj, 'id', None)
        return str(uid) if uid else None
    
    # New API approach
    try:
        user = client.auth.get_user(token)
        return user.id if hasattr(user, 'id') else str(user.get('id'))
    except:
        return None
```

**Purpose**: Validates JWT tokens in requests and extracts authenticated user ID.

---

### 3. Create User Endpoint (`/auth/create_user`)

```python
@api_bp.route('/auth/create_user', methods=['POST', 'OPTIONS'])
def auth_create_user():
    """
    Idempotent endpoint: Ensures a row exists in custom 'users' table.
    
    Request:
        - Authorization: Bearer <token> (required)
        - Body: { email?: string, screenname?: string } (optional)
    
    Response:
        - { success: true, user_id: string, was_inaugural_login: bool }
    
    Logic:
        1. Validate token and extract user_id
        2. Check if user already exists in custom users table
        3. If not exists, create user row with defaults
        4. Return success with inaugural flag
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    
    try:
        payload = request.get_json(force=True) or {}
        email = payload.get('email')
        screenname = payload.get('screenname') or (email.split('@')[0] if email and '@' in email else None)
        
        # Validate token
        uid = _get_user_from_header(request)
        if not uid:
            return jsonify({'error': 'unauthorized'}), 401
        
        client = get_admin_client()
        if not client:
            return jsonify({'error': 'supabase client missing'}), 500
        
        # Check if user already exists
        try:
            rc = client.table('users').select('user_id,email').eq('user_id', uid).limit(1).execute()
            rows = rc.data if hasattr(rc, 'data') else rc.get('data')
            if rows and len(rows) > 0:
                return jsonify({'success': True, 'user_id': uid, 'was_inaugural_login': False}), 200
        except Exception:
            pass
        
        # Check by email if provided
        if email:
            try:
                rc2 = client.table('users').select('user_id,email').eq('email', email).limit(1).execute()
                r2 = rc2.data if hasattr(rc2, 'data') else rc2.get('data')
                if r2 and len(r2) > 0:
                    return jsonify({'success': True, 'user_id': r2[0].get('user_id'), 'was_inaugural_login': False}), 200
            except Exception:
                pass
        
        # Create new user
        resolved_screen = screenname or (email.split('@')[0] if email and '@' in email else str(uid))
        insert_payload = {
            'user_id': uid,
            'email': email or None,
            'password': 'oauth',  # Default for OAuth users
            'screenname': resolved_screen,
            'role': 'BETTOR',     # Default role
            'net_pnl': 0,
        }
        
        try:
            ins = client.table('users').insert(insert_payload).execute()
            return jsonify({'success': True, 'user_id': uid, 'was_inaugural_login': True}), 200
        except Exception as e:
            logging.exception('auth_create_user insert error')
            # Handle race condition - check if created by another request
            try:
                rc3 = client.table('users').select('user_id').eq('user_id', uid).limit(1).execute()
                r3 = rc3.data if hasattr(rc3, 'data') else rc3.get('data')
                if r3 and len(r3) > 0:
                    return jsonify({'success': True, 'user_id': uid, 'was_inaugural_login': False}), 200
            except Exception:
                pass
            return jsonify({'error': str(e), 'was_inaugural_login': False}), 500
    except Exception as exc:
        logging.exception('auth_create_user error')
        return jsonify({'error': str(exc)}), 500
```

**Key Features:**
- **Idempotent** - Safe to call multiple times
- **Race condition safe** - Handles concurrent requests
- **Inaugural detection** - Returns flag if first login
- **Default values** - Sets password='oauth', role='BETTOR', net_pnl=0

---

### 4. Get User Info Endpoint (`/auth/me`)

```python
@api_bp.route('/auth/me', methods=['GET', 'OPTIONS'])
def auth_me():
    """
    Returns current user data from custom users table.
    
    Request:
        - Authorization: Bearer <token> (required)
    
    Response:
        - { user: { user_id, email, screenname, role, net_pnl, ... } }
    """
    if request.method == 'OPTIONS':
        return ('', 200)
    
    user_id = _get_user_from_header(request)
    if not user_id:
        return jsonify({'error': 'unauthorized'}), 401
    
    client = get_admin_client()
    if not client:
        return jsonify({'error': 'supabase client missing'}), 500
    
    try:
        res = client.table('users').select('*').eq('user_id', user_id).limit(1).execute()
        rows = res.data if hasattr(res, 'data') else res.get('data')
        if rows and len(rows) > 0:
            return jsonify({'user': rows[0]}), 200
        return jsonify({'user': None}), 200
    except Exception as e:
        logging.exception('auth_me error')
        return jsonify({'error': str(e)}), 500
```

**Purpose**: Fetches authenticated user's data from custom users table.

---

## 💻 FRONTEND IMPLEMENTATION

### 1. Supabase Client Setup (`supabaseClient.ts`)

```typescript
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Validation
if (!SUPABASE_URL || !SUPABASE_ANON) {
    if (import.meta.env.DEV) {
        throw new Error('Missing Supabase configuration: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set')
    }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export default supabase
```

**Key Points:**
- Uses anon key (not service role)
- Validates config in development
- Single client instance exported

---

### 2. Auth Store (`authStore.ts`)

```typescript
import { create } from 'zustand';
import supabase from '../supabaseClient';

export interface User {
  user_id: string;
  screen_name?: string;
  email?: string;
  role?: string;
}

interface AuthStore {
  isAuthenticated: boolean;
  user: User | null;
  accessToken?: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<any>;
  init: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  user: null,
  accessToken: null,
  
  // LOGIN FUNCTION
  login: async (email: string, password: string) => {
    try {
      const res = await supabase.auth.signInWithPassword({ email, password });
      const session = res?.data?.session;
      
      if (session) {
        const token = session.access_token;
        set({ accessToken: token });
        
        // Initialize to fetch user data
        await get().init();
      } else {
        // No session - email verification may be required
        set({ user: { user_id: res?.data?.user?.id ?? email, email }, isAuthenticated: true });
      }
    } catch (err) {
      console.error('login error', err);
      throw err;
    }
  },
  
  // SIGNUP FUNCTION
  signup: async (email: string, password: string) => {
    try {
      const res = await supabase.auth.signUp({ email, password });
      const session = res?.data?.session ?? res?.data?.user ?? null;
      const token = session?.access_token ?? null;
      
      if (token) {
        set({ accessToken: token });
      }
      
      // Call backend to create custom users row (if session exists)
      if (token) {
        try {
          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
          await fetch(`${apiBase}/auth/create_user`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              Authorization: `Bearer ${token}` 
            },
            body: JSON.stringify({ email }),
          });
        } catch (err) {
          console.warn('create_user call failed', err);
        }
      }
      
      // Refresh user state
      await get().init();
      
      return res;
    } catch (err) {
      console.error('signup error', err);
      throw err;
    }
  },
  
  // INIT FUNCTION (Check session and load user on app startup)
  init: async () => {
    try {
      const sessRes = await supabase.auth.getSession();
      const session = sessRes?.data?.session;
      
      if (!session) {
        set({ user: null, isAuthenticated: false });
        return;
      }
      
      const token = session.access_token;
      set({ accessToken: token });
      
      // Subscribe to auth state changes (for magic links, token refresh)
      supabase.auth.onAuthStateChange((event, s) => {
        const newToken = s?.access_token ?? s?.session?.access_token ?? null;
        set({ accessToken: newToken });
        
        // Fetch updated user data
        if (newToken && s?.user) {
          (async () => {
            try {
              const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
              const res2 = await fetch(`${apiBase}/auth/me`, { 
                headers: { Authorization: `Bearer ${newToken}` } 
              });
              const d2 = await res2.json();
              const userObj2 = d2?.user ?? d2;
              if (userObj2 && (userObj2.user_id || userObj2.id)) {
                set({ 
                  user: { 
                    user_id: userObj2.user_id ?? userObj2.id, 
                    screen_name: userObj2.screen_name, 
                    email: s?.user?.email,
                    role: userObj2.role 
                  }, 
                  isAuthenticated: true 
                });
              }
            } catch (err) {
              console.warn('onAuthStateChange fetch failed', err);
            }
          })();
        }
      });
      
      // Fetch current user data from backend
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
      const res = await fetch(`${apiBase}/auth/me`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      const data = await res.json();
      const userObj = data?.user ?? data;
      
      if (userObj && (userObj.user_id || userObj.id)) {
        set({ 
          user: { 
            user_id: userObj.user_id ?? userObj.id, 
            screen_name: userObj.screen_name, 
            email: session.user?.email,
            role: userObj.role 
          }, 
          isAuthenticated: true 
        });
      } else {
        // Fallback to Supabase user data
        set({ 
          user: { 
            user_id: session.user?.id, 
            email: session.user?.email 
          }, 
          isAuthenticated: true 
        });
      }
    } catch (e) {
      console.error('authStore.init error', e);
      set({ user: null, isAuthenticated: false });
    }
  },
  
  // LOGOUT FUNCTION
  logout: async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('logout error', err);
    }
    set({ user: null, isAuthenticated: false, accessToken: null });
  },
}));
```

**Key Features:**
- Centralized auth state management
- Automatic session persistence
- Token refresh handling
- Auth state change listeners

---

### 3. Login/Signup UI (`Login.tsx`)

```typescript
import React, { useState, useEffect } from 'react';
import supabase from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../lib/state/authStore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const navigate = useNavigate();
  const initAuth = useAuthStore((s) => s.init);

  useEffect(() => {
    initAuth(); // Initialize auth state on mount
  }, []);

  // SIGNUP HANDLER
  const handleSignup = async () => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      
      if (error) {
        alert('Sign up error: ' + error.message);
        return;
      }

      // Check if session exists (some configs auto-login, others require email verification)
      if (!data?.session) {
        alert('Signed up — check your email to verify your account before signing in.');
        setIsSignup(false); // Switch to login view
        return;
      }

      // If session exists, call backend to create custom user row
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      
      if (token) {
        try {
          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
          await fetch(`${apiBase}/auth/create_user`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              Authorization: `Bearer ${token}` 
            },
            body: JSON.stringify({ email }),
          });
        } catch (err) {
          console.warn('create_user call failed', err);
        }
      }

      await initAuth();
      navigate('/home');
    } catch (e: any) {
      alert('Signup failed: ' + e.message);
    }
  };

  // LOGIN HANDLER
  const handleLogin = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        alert('Login error: ' + error.message);
        return;
      }

      // Check if session exists
      if (!data?.session) {
        alert('Login successful — please verify your email before signing in (check your inbox).');
        return;
      }

      // Extract token
      const token = data?.session?.access_token;

      // Call backend to ensure custom user row exists (idempotent)
      try {
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
        const resp = await fetch(`${apiBase}/auth/create_user`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ email }),
        });
        const respJson = await resp.json();
        
        // Check if inaugural login
        if (respJson && respJson.was_inaugural_login) {
          console.log('This is the user\'s first login!');
          // Optional: Prompt for additional info (screen name, etc.)
        }
      } catch (e) {
        console.warn('create_user call failed', e);
      }

      // Refresh auth store
      await initAuth();
      navigate('/home');
    } catch (e: any) {
      alert('Login failed: ' + e.message);
    }
  };

  return (
    <div>
      <h1>{isSignup ? 'Sign Up' : 'Login'}</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={isSignup ? handleSignup : handleLogin}>
        {isSignup ? 'Sign Up' : 'Login'}
      </button>
      <button onClick={() => setIsSignup(!isSignup)}>
        {isSignup ? 'Already have an account?' : "Don't have an account?"}
      </button>
    </div>
  );
}
```

---

## 🔄 AUTHENTICATION WORKFLOWS

### Workflow 1: NEW USER SIGNUP (with Email Verification)

```
┌────────────────────────────────────────────────────────────────┐
│                    NEW USER SIGNUP FLOW                        │
└────────────────────────────────────────────────────────────────┘

1. USER: Fills signup form (email, password)
   └─> Frontend: Login.tsx

2. FRONTEND: Calls supabase.auth.signUp({ email, password })
   └─> Request sent to Supabase Auth API

3. SUPABASE: Creates user in auth.users table
   └─> Sends verification email to user
   └─> Returns { data, error } with NO SESSION (verification pending)

4. FRONTEND: Shows "Check your email" message
   └─> User clicks link in email

5. SUPABASE: Marks email as verified
   └─> Redirects user back to app

6. USER: Returns to app, enters credentials on login page

7. FRONTEND: Calls supabase.auth.signInWithPassword({ email, password })
   └─> Request sent to Supabase Auth API

8. SUPABASE: Validates credentials, returns session
   └─> Returns { data: { session, user }, error }

9. FRONTEND: Extracts access_token from session
   └─> Calls backend: POST /api/auth/create_user
   └─> Headers: Authorization: Bearer <token>
   └─> Body: { email }

10. BACKEND: Receives request at /auth/create_user endpoint
    └─> Validates token using _get_user_from_header()
    └─> Extracts user_id from validated token
    └─> Checks if user exists in custom users table
    └─> IF NOT EXISTS: Inserts new row
        - user_id: <UUID from token>
        - email: <from request body>
        - password: 'oauth'
        - screenname: <email local-part or provided>
        - role: 'BETTOR'
        - net_pnl: 0
    └─> Returns: { success: true, user_id: <UUID>, was_inaugural_login: true }

11. FRONTEND: Receives response
    └─> IF was_inaugural_login: true
        - Optional: Show screen name prompt
        - Optional: Show welcome message
    └─> Calls authStore.init() to load user data
    └─> Navigates to /home

12. AUTHSTORE: Fetches user data
    └─> Calls backend: GET /api/auth/me
    └─> Headers: Authorization: Bearer <token>
    └─> Receives: { user: { user_id, email, screenname, role, net_pnl } }
    └─> Updates local state

✅ USER IS NOW AUTHENTICATED WITH CUSTOM USER ROW
```

---

### Workflow 2: EXISTING USER LOGIN

```
┌────────────────────────────────────────────────────────────────┐
│                    EXISTING USER LOGIN FLOW                    │
└────────────────────────────────────────────────────────────────┘

1. USER: Fills login form (email, password)
   └─> Frontend: Login.tsx

2. FRONTEND: Calls supabase.auth.signInWithPassword({ email, password })
   └─> Request sent to Supabase Auth API

3. SUPABASE: Validates credentials
   └─> Returns { data: { session, user }, error }

4. FRONTEND: Extracts access_token from session
   └─> Calls backend: POST /api/auth/create_user (idempotent check)
   └─> Headers: Authorization: Bearer <token>
   └─> Body: { email }

5. BACKEND: Receives request at /auth/create_user endpoint
    └─> Validates token using _get_user_from_header()
    └─> Checks if user exists in custom users table
    └─> USER EXISTS: Returns { success: true, user_id: <UUID>, was_inaugural_login: false }

6. FRONTEND: Receives response
    └─> Calls authStore.init() to load user data
    └─> Navigates to /home

7. AUTHSTORE: Fetches user data
    └─> Calls backend: GET /api/auth/me
    └─> Receives: { user: { user_id, email, screenname, role, net_pnl } }
    └─> Updates local state

✅ USER IS NOW AUTHENTICATED
```

---

### Workflow 3: LOGOUT

```
┌────────────────────────────────────────────────────────────────┐
│                         LOGOUT FLOW                            │
└────────────────────────────────────────────────────────────────┘

1. USER: Clicks logout button
   └─> Frontend: Calls useAuthStore.logout()

2. AUTHSTORE: Executes logout()
   └─> Calls supabase.auth.signOut()
   └─> Clears local state: { user: null, isAuthenticated: false, accessToken: null }

3. SUPABASE: Invalidates session
   └─> Removes session from storage

4. FRONTEND: Redirects to login page

✅ USER IS LOGGED OUT
```

---

### Workflow 4: APP INITIALIZATION (Session Persistence)

```
┌────────────────────────────────────────────────────────────────┐
│                  APP INITIALIZATION FLOW                       │
└────────────────────────────────────────────────────────────────┘

1. APP: Mounts (useEffect in App.tsx or Login.tsx)
   └─> Calls useAuthStore.init()

2. AUTHSTORE: Executes init()
   └─> Calls supabase.auth.getSession()

3. SUPABASE: Checks for existing session in browser storage
   └─> IF SESSION EXISTS:
       - Returns { data: { session }, error: null }
   └─> IF NO SESSION:
       - Returns { data: { session: null }, error: null }

4. AUTHSTORE: Processes session
   └─> IF NO SESSION:
       - Sets: { user: null, isAuthenticated: false }
       - Returns early
   └─> IF SESSION EXISTS:
       - Extracts access_token
       - Calls backend: GET /api/auth/me
       - Headers: Authorization: Bearer <token>

5. BACKEND: Receives /auth/me request
   └─> Validates token
   └─> Queries custom users table
   └─> Returns: { user: { user_id, email, screenname, role, net_pnl } }

6. AUTHSTORE: Updates state
   └─> Sets: { user: <user data>, isAuthenticated: true, accessToken: <token> }

7. APP: Redirects based on auth state
   └─> IF authenticated: Navigate to /home
   └─> IF not authenticated: Show login page

✅ SESSION RESTORED (if valid)
```

---

## 🔑 KEY FUNCTIONS REFERENCE

### Backend Functions

| Function | Location | Purpose | Returns |
|----------|----------|---------|---------|
| `get_admin_client()` | `supabase_client.py` | Creates Supabase client with service role key | Supabase client or None |
| `get_user_from_access_token()` | `supabase_client.py` | Validates JWT and extracts user data | User object or None |
| `_get_user_from_header()` | `api/routes.py` | Extracts user_id from Authorization header | user_id (UUID string) or None |
| `auth_create_user()` | `api/routes.py` | Creates custom user row (idempotent) | JSON response |
| `auth_me()` | `api/routes.py` | Fetches user data from custom users table | JSON response |

### Frontend Functions

| Function | Location | Purpose | Returns |
|----------|----------|---------|---------|
| `supabase.auth.signUp()` | `supabaseClient.ts` | Creates new user in Supabase Auth | { data, error } |
| `supabase.auth.signInWithPassword()` | `supabaseClient.ts` | Authenticates existing user | { data: { session, user }, error } |
| `supabase.auth.signOut()` | `supabaseClient.ts` | Logs out user, invalidates session | { error } |
| `supabase.auth.getSession()` | `supabaseClient.ts` | Gets current session from storage | { data: { session }, error } |
| `supabase.auth.onAuthStateChange()` | `supabaseClient.ts` | Subscribes to auth state changes | { data: { subscription }, error } |
| `useAuthStore.login()` | `authStore.ts` | Handles login logic | Promise<void> |
| `useAuthStore.signup()` | `authStore.ts` | Handles signup logic | Promise<any> |
| `useAuthStore.logout()` | `authStore.ts` | Handles logout logic | Promise<void> |
| `useAuthStore.init()` | `authStore.ts` | Initializes auth state on app load | Promise<void> |

---

## ⚙️ SUPABASE CONFIGURATION

### 1. Enable Email Authentication

1. Go to Supabase Dashboard → Authentication → Providers
2. Enable **Email** provider
3. Configure settings:
   - **Confirm email**: ON (recommended for production)
   - **Secure email change**: ON
   - **Confirm email change**: ON

### 2. Email Templates

Go to Supabase Dashboard → Authentication → Email Templates

#### Confirm Signup Template

```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your email:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
```

**Confirmation URL Format:**
```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
```

### 3. URL Configuration

Go to Supabase Dashboard → Authentication → URL Configuration

- **Site URL**: `http://localhost:5173` (dev) or `https://yourdomain.com` (prod)
- **Redirect URLs**: Add your app URLs
  - `http://localhost:5173/auth/callback`
  - `https://yourdomain.com/auth/callback`

### 4. Database Setup

Create custom users table:

```sql
-- Custom users table
CREATE TABLE users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255), -- 'oauth' for OAuth users
  screenname VARCHAR(255),
  role VARCHAR(50) DEFAULT 'BETTOR',
  net_pnl DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_screenname ON users(screenname);

-- Row Level Security (optional)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Service role can manage all users
CREATE POLICY "Service role can manage users" ON users
  USING (auth.jwt() ->> 'role' = 'service_role');
```

---

## 🧪 TESTING & DEBUGGING

### Test Signup Flow

1. **Start frontend and backend**
   ```bash
   # Backend
   cd backend
   python app.py

   # Frontend
   cd frontend
   npm run dev
   ```

2. **Open browser console** (F12)

3. **Fill signup form**
   - Email: test@example.com
   - Password: password123

4. **Check console logs**
   - Look for "signup response" log
   - Should show { data: { user: {...}, session: null }, error: null }

5. **Check email inbox**
   - Look for verification email from Supabase
   - Click confirmation link

6. **Log in with verified account**
   - Enter same credentials
   - Check console for "LOGIN SUCCESS" logs
   - Should see token and user_id logged

7. **Verify backend call**
   - Look for "/api/auth/create_user response" log
   - Should show { success: true, user_id: "...", was_inaugural_login: true }

8. **Check custom users table**
   - Go to Supabase Dashboard → Table Editor → users
   - Should see new row with user_id, email, screenname, role='BETTOR'

### Common Issues & Solutions

#### Issue: "Missing Supabase configuration"

**Solution**: Ensure environment variables are set correctly

```bash
# Backend (.env)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxxx

# Frontend (.env)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
```

#### Issue: "unauthorized" when calling /auth/create_user

**Solution**: Check Authorization header format

```javascript
// Correct format
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// Wrong (missing "Bearer")
Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Issue: "Email not confirmed" on login

**Solution**: User must click verification link in email before logging in

#### Issue: User row not created in custom users table

**Possible causes:**
1. Backend /auth/create_user not called
2. Token validation failed
3. Database permissions issue (check RLS policies)

**Debug steps:**
1. Check browser console for create_user request
2. Check backend logs for errors
3. Verify token is being sent in Authorization header
4. Check Supabase logs (Dashboard → Logs)

#### Issue: Session not persisting on page refresh

**Solution**: Ensure authStore.init() is called on app mount

```typescript
// In App.tsx or Login.tsx
useEffect(() => {
  useAuthStore.getState().init();
}, []);
```

---

## 📝 CUSTOMIZATION CHECKLIST

When adapting this for your project:

- [ ] Update environment variable names if needed
- [ ] Customize custom users table schema (add/remove fields)
- [ ] Modify default user role and initial values
- [ ] Update email templates in Supabase Dashboard
- [ ] Configure Site URL and Redirect URLs
- [ ] Add screen name prompt UI (optional)
- [ ] Implement role-based access control (optional)
- [ ] Add password reset flow (optional)
- [ ] Configure email provider (Supabase built-in or custom SMTP)
- [ ] Set up Row Level Security policies
- [ ] Add user profile update endpoints
- [ ] Implement social OAuth providers (Google, GitHub, etc.) if needed

---

## 🎯 SUMMARY

This implementation provides:

✅ **Email-based authentication** with Supabase Auth
✅ **Email verification** workflow
✅ **Custom user management** in application database
✅ **Session persistence** across page refreshes
✅ **Inaugural login detection** for onboarding flows
✅ **Idempotent user creation** (safe for concurrent requests)
✅ **JWT token validation** on backend
✅ **Centralized auth state** with Zustand store
✅ **Secure token handling** (Bearer token in headers)

---

## 📚 ADDITIONAL RESOURCES

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase Python Client](https://github.com/supabase-community/supabase-py)
- [Supabase JavaScript Client](https://github.com/supabase/supabase-js)
- [JWT Token Structure](https://jwt.io/)
- [Zustand State Management](https://github.com/pmndrs/zustand)

---

**Document Version**: 1.0  
**Last Updated**: February 2026  
**Project**: betGSIS geo_book (extracted generic OAuth patterns)


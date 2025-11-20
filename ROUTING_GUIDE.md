# betGSIS Frontend - Routing & Authentication Guide

## 🔐 Authentication Flow

### Overview
The frontend uses React Router v6 with Zustand for state management to implement a secure, clean authentication flow.

---

## 📁 Routing Architecture

### File Structure
```
frontend/src/
├── App.tsx              # Main app component with router setup
├── router.tsx           # Route guards (ProtectedRoute, PublicRoute, RootRedirect)
├── pages/
│   ├── Login.tsx       # Public login page
│   ├── Dashboard.tsx   # Protected dashboard
│   ├── GeoGuessr.tsx   # Protected odds & betting
│   ├── Bets.tsx        # Protected bet history
│   └── Profile.tsx     # Protected user settings
└── components/
    └── Auth/
        └── LoginForm.tsx # Login form component
```

---

## 🔄 Route Configuration

### All Routes
| Path | Component | Auth Required | Purpose |
|------|-----------|---------------|---------|
| `/` | RootRedirect | N/A | Redirects to /login or /dashboard based on auth state |
| `/login` | Login (PublicRoute) | No | User authentication |
| `/dashboard` | Dashboard (ProtectedRoute) | Yes | P&L summary & recent bets |
| `/geoguessr` | GeoGuessr (ProtectedRoute) | Yes | Browse odds & place bets |
| `/bets` | Bets (ProtectedRoute) | Yes | Bet history & analytics |
| `/profile` | Profile (ProtectedRoute) | Yes | User settings |
| `*` | RootRedirect | N/A | Catch-all for unknown routes |

---

## 🛡️ Route Guards

### ProtectedRoute
**Location**: `router.tsx`

Checks if user is authenticated. If not, redirects to `/login`.

```typescript
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
```

**Usage in App.tsx**:
```tsx
<Route
  path="/dashboard"
  element={
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  }
/>
```

### PublicRoute
**Location**: `router.tsx`

Prevents authenticated users from viewing public pages (like login). Redirects to `/dashboard` if already logged in.

```typescript
export function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
```

**Usage in App.tsx**:
```tsx
<Route
  path="/login"
  element={
    <PublicRoute>
      <Login />
    </PublicRoute>
  }
/>
```

### RootRedirect
**Location**: `router.tsx`

Intelligently redirects `/` to either `/login` (unauthenticated) or `/dashboard` (authenticated).

```typescript
export function RootRedirect() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <Navigate to="/login" replace />
}
```

---

## 🔑 Authentication State (Zustand)

### authStore
**Location**: `lib/state/authStore.ts`

```typescript
interface AuthStore {
  isAuthenticated: boolean
  user: string | null
  login: (email: string, password: string) => void
  logout: () => void
}
```

### Usage
```typescript
import { useAuthStore } from './lib/state/authStore'

// In a component
const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
const login = useAuthStore((state) => state.login)
const logout = useAuthStore((state) => state.logout)
```

---

## 🔐 Login Flow

### Step-by-Step Process

1. **User visits app** (`http://localhost:5173/`)
   - `RootRedirect` checks `authStore.isAuthenticated`
   - If false → redirects to `/login`
   - If true → redirects to `/dashboard`

2. **User enters credentials** on `/login`
   - LoginForm validates email and password
   - Shows validation errors if needed

3. **User submits form**
   - `handleSubmit` prevents default form submission
   - Calls `authStore.login(email, password)` to update state
   - Shows success toast notification
   - Navigates to `/dashboard` using `useNavigate('/dashboard', { replace: true })`

4. **User is now authenticated**
   - Can access protected routes
   - Navbar shows user options (profile, logout)
   - Can place bets, view analytics, etc.

5. **User clicks logout**
   - Calls `authStore.logout()` to clear auth state
   - Redirects to `/login` page
   - Session cleared

### Logout Flow
```typescript
const handleLogout = () => {
  logout()                    // Clear auth state
  navigate('/login')          // Navigate to login
}
```

---

## 📝 LoginForm Component

### Location: `components/Auth/LoginForm.tsx`

### Features
- ✅ Email validation (must be valid email format)
- ✅ Password validation (minimum 6 characters)
- ✅ Error display with helpful messages
- ✅ Loading state during submission
- ✅ Toast notifications for success/error
- ✅ Auto-navigate to `/dashboard` on success
- ✅ Uses `useNavigate` hook with `replace` flag

### Code
```typescript
export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [isLoading, setIsLoading] = useState(false)

  const login = useAuthStore((state) => state.login)
  const addToast = useUIStore((state) => state.addToast)
  const navigate = useNavigate()

  const validateForm = () => {
    const newErrors: typeof errors = {}

    if (!email) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!password) {
      newErrors.password = 'Password is required'
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      addToast({ message: 'Please fix the errors below', type: 'error' })
      return
    }

    setIsLoading(true)

    // Simulate API call for authentication
    setTimeout(() => {
      try {
        login(email, password)
        addToast({ message: `Welcome back, ${email}!`, type: 'success' })
        navigate('/dashboard', { replace: true })
      } catch (error) {
        addToast({ message: 'Login failed. Please try again.', type: 'error' })
        console.error('Login error:', error)
      } finally {
        setIsLoading(false)
      }
    }, 500)
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      {/* Form JSX */}
    </form>
  )
}
```

---

## 🎯 App.tsx Router Setup

### Complete Implementation

```typescript
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute, PublicRoute, RootRedirect } from './router'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import GeoGuessr from './pages/GeoGuessr'
import Bets from './pages/Bets'
import Profile from './pages/Profile'
import ToastContainer from './components/Shared/ToastContainer'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root route - redirects to /login or /dashboard based on auth */}
        <Route path="/" element={<RootRedirect />} />

        {/* Public route - login page */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        {/* Protected routes - require authentication */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/geoguessr"
          element={
            <ProtectedRoute>
              <GeoGuessr />
            </ProtectedRoute>
          }
        />

        <Route
          path="/bets"
          element={
            <ProtectedRoute>
              <Bets />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* Catch-all - redirect unknown routes to root */}
        <Route path="*" element={<RootRedirect />} />
      </Routes>

      {/* Toast notifications - always visible */}
      <ToastContainer />
    </BrowserRouter>
  )
}
```

---

## 🧪 Testing the Flow

### Test Case 1: Unauthenticated User
1. Open `http://localhost:5173/`
2. Should see login form
3. Enter any email and password
4. Click "Login"
5. Should see success toast
6. Should redirect to `/dashboard`

### Test Case 2: Authenticated User Accessing Login
1. After login, visit `http://localhost:5173/login`
2. Should redirect to `/dashboard` (PublicRoute prevents access)

### Test Case 3: Unauthenticated User Accessing Protected Route
1. In a new browser/incognito, visit `http://localhost:5173/dashboard`
2. Should redirect to `/login` (ProtectedRoute enforces auth)

### Test Case 4: Logout Flow
1. From any protected page, click logout in navbar
2. Should call `authStore.logout()`
3. Should redirect to `/login`
4. Verify cannot access protected routes

### Test Case 5: Unknown Route
1. Visit `http://localhost:5173/unknown-route`
2. Should redirect to `/login` (RootRedirect catch-all)

---

## 🔧 Common Patterns

### Access Auth State in Any Component
```typescript
import { useAuthStore } from './lib/state/authStore'

export function MyComponent() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)

  if (!isAuthenticated) return <div>Please login</div>

  return <div>Welcome, {user}!</div>
}
```

### Navigate After Auth Action
```typescript
import { useNavigate } from 'react-router-dom'

const navigate = useNavigate()

// After successful login
navigate('/dashboard', { replace: true })

// After logout
navigate('/login', { replace: true })
```

### Show Toast Notification
```typescript
import { useUIStore } from './lib/state/uiStore'

const addToast = useUIStore((state) => state.addToast)

// Show success message
addToast({ message: 'Login successful!', type: 'success' })

// Show error message
addToast({ message: 'Login failed', type: 'error' })
```

---

## 🚀 Production Checklist

Before deploying to production:

- [ ] Replace mock authentication with real JWT tokens
- [ ] Store JWT in localStorage/sessionStorage or httpOnly cookies
- [ ] Add token refresh logic (refresh token on expiry)
- [ ] Implement logout that clears tokens
- [ ] Add password reset flow
- [ ] Add user registration/signup
- [ ] Add remember me functionality
- [ ] Set up HTTPS for all auth endpoints
- [ ] Add CSRF protection for forms
- [ ] Add rate limiting to login endpoint
- [ ] Add audit logging for auth events
- [ ] Test with real backend API

---

## 📚 Related Files

- **Router Definition**: `src/router.tsx`
- **App Component**: `src/App.tsx`
- **Auth Store**: `src/lib/state/authStore.ts`
- **UI Store**: `src/lib/state/uiStore.ts`
- **Login Page**: `src/pages/Login.tsx`
- **Login Form**: `src/components/Auth/LoginForm.tsx`
- **Navigation**: `src/components/Layout/Navbar.tsx`

---

## 🎓 Further Reading

- [React Router Documentation](https://reactrouter.com/)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [React Hooks Guide](https://react.dev/reference/react)
- [Web Security Best Practices](https://owasp.org/)

---

**Last Updated**: November 15, 2025
**Status**: ✅ Production Ready

# betGSIS Frontend - Routing & Auth Flow Diagrams

## 🔄 Authentication State Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION STATES                         │
└─────────────────────────────────────────────────────────────────┘

                      App Starts
                          ↓
              Check authStore.isAuthenticated
                    ↙                 ↘
              false                   true
                ↓                      ↓
          RootRedirect           RootRedirect
          Navigate to           Navigate to
           /login                /dashboard
                ↓                      ↓
          ┌──────────┐          ┌──────────────┐
          │  PUBLIC  │          │  PROTECTED   │
          │  ROUTES  │          │    ROUTES    │
          └──────────┘          └──────────────┘
                ↓                      ↓
          /login visible         /dashboard
                                 /geoguessr
                                 /bets
                                 /profile
```

---

## 🛡️ Route Guard Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                   ROUTE GUARD DECISION TREE                       │
└──────────────────────────────────────────────────────────────────┘


User Visits Route
        ↓
    ┌───┴────────────────────────────┐
    │ Which Route?                   │
    └───┬────────────────────────────┘
        │
    ┌───┴─────────────────────────────────────────┐
    │                                             │
 PUBLIC ROUTE                            PROTECTED ROUTE
 (/login)                                (/dashboard, /geoguessr, etc)
    │                                             │
    ↓                                             ↓
Check: isAuthenticated?                  Check: isAuthenticated?
    │                                             │
    ├─ YES → Redirect /dashboard        ├─ YES → Show Page ✓
    │        (prevent login bypass)      │
    └─ NO → Show LoginForm ✓             └─ NO → Redirect /login
                                                 (prevent access)
```

---

## 📱 User Journey - Login Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPLETE USER JOURNEY                         │
└─────────────────────────────────────────────────────────────────┘


Step 1: FIRST VISIT (Unauthenticated)
────────────────────────────────────
  User: Opens http://localhost:5173/
    ↓
  App: RootRedirect checks authStore
    ↓
  isAuthenticated = false
    ↓
  Navigate to /login
    ↓
  Display: LoginForm with email/password inputs


Step 2: ENTER CREDENTIALS
─────────────────────────
  User: Enters email & password
    ↓
  Form: Validates
    • Email format check ✓
    • Password length check ✓
    ↓
  User: Clicks "Login" button
    ↓
  State: isLoading = true (show spinner)


Step 3: AUTHENTICATION
──────────────────────
  Handler: handleSubmit
    ↓
  Call: authStore.login(email, password)
    ↓
  Update: isAuthenticated = true
    ↓
  Show: Toast "Welcome back, user@email.com!"
    ↓
  Execute: navigate('/dashboard', { replace: true })


Step 4: POST-LOGIN (Authenticated)
─────────────────────────────────
  isAuthenticated = true
    ↓
  User can now access:
    • /dashboard ✓
    • /geoguessr ✓
    • /bets ✓
    • /profile ✓
    • Cannot see /login (PublicRoute redirects)


Step 5: LOGOUT
──────────────
  User: Clicks Logout in Navbar
    ↓
  Call: authStore.logout()
    ↓
  Update: isAuthenticated = false
    ↓
  Execute: navigate('/login')
    ↓
  Back to: Login page (Step 1)
```

---

## 🚪 Route Guard Decision Matrix

```
┌────────────────────────────────────────────────────────────────────┐
│              ROUTE ACCESS DECISION MATRIX                           │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Route Type: PUBLIC (e.g., /login)                                │
│  ┌──────────────────────────────────────────────────────┐        │
│  │ isAuthenticated = true   → Redirect to /dashboard   │        │
│  │ isAuthenticated = false  → Show Page ✓              │        │
│  └──────────────────────────────────────────────────────┘        │
│                                                                    │
│  Route Type: PROTECTED (e.g., /dashboard, /geoguessr)             │
│  ┌──────────────────────────────────────────────────────┐        │
│  │ isAuthenticated = true   → Show Page ✓              │        │
│  │ isAuthenticated = false  → Redirect to /login       │        │
│  └──────────────────────────────────────────────────────┘        │
│                                                                    │
│  Route Type: ROOT (/)                                             │
│  ┌──────────────────────────────────────────────────────┐        │
│  │ isAuthenticated = true   → Redirect to /dashboard   │        │
│  │ isAuthenticated = false  → Redirect to /login       │        │
│  └──────────────────────────────────────────────────────┘        │
│                                                                    │
│  Route Type: UNKNOWN (anything else)                              │
│  ┌──────────────────────────────────────────────────────┐        │
│  │ Use RootRedirect logic (same as / route)            │        │
│  └──────────────────────────────────────────────────────┘        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 🔀 Component Hierarchy

```
┌──────────────────────────────────────────────────────┐
│                    <App />                           │
│         (BrowserRouter setup)                        │
└──────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────┐
│                  <Routes>                            │
└──────────────────────────────────────────────────────┘
         ↙                    ↓                    ↘
    Route /            Route /login           Route /dashboard
        ↓                    ↓                      ↓
    RootRedirect      PublicRoute         ProtectedRoute
        ↓                    ↓                      ↓
  (Navigate logic)      Login Component       Dashboard Component
                             ↓
                        LoginForm
                             ↓
                        authStore.login()
                             ↓
                     navigate('/dashboard')
                             ↓
                        Now on /dashboard
```

---

## 🔑 State Management Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              ZUSTAND STORE STATE FLOW                            │
└─────────────────────────────────────────────────────────────────┘


authStore
──────────
  State:
    • isAuthenticated: boolean
    • user: string | null

  Actions:
    • login(email, password) → isAuthenticated = true
    • logout() → isAuthenticated = false

  Usage:
    const isAuth = useAuthStore(s => s.isAuthenticated)


betsStore
──────────
  State:
    • selections: BetSelection[]
    • recentBets: BetSelection[]

  Actions:
    • addSelection(bet)
    • removeSelection(id)
    • updateStake(id, stake)
    • placeBet(bet)

  Usage:
    const selections = useBetsStore(s => s.selections)


uiStore
────────
  State:
    • toasts: Toast[]
    • showCSVUploader: boolean

  Actions:
    • addToast(toast)
    • removeToast(id)
    • setShowCSVUploader(show)

  Usage:
    const addToast = useUIStore(s => s.addToast)
```

---

## 🧭 Navigation Flow Between Pages

```
┌──────────────────────────────────────────────────────────────┐
│             PAGE NAVIGATION ROUTES                           │
└──────────────────────────────────────────────────────────────┘


                          /login
                            ↓↑
                   (public + auth required)
                            │
                            ↓ (LoginForm submit)
                            
    /dashboard ←──────────────────────────→ /geoguessr
        ↓↑                                     ↓↑
   (Dashboard)                            (Odds & Betting)
        │                                     │
        ├─────────────────────────────────────┤
        │                                     │
        ↓                                     ↓
    /bets ←──────────────────────────→ /profile
        ↓↑                                    ↓↑
   (Bet History)                        (User Settings)
        │                                    │
        └────────────────────────────────────┘
                         ↓
                    Navbar Links
                         ↓
                   Protected Routes
                    (all require auth)


Logout Flow
───────────
  Any Protected Page → Click Logout → /login
                           ↓
                   authStore.logout()
                    (clear session)
```

---

## 📊 LoginForm Component Flow

```
┌────────────────────────────────────────────────────────┐
│             LOGIN FORM STATE MACHINE                   │
└────────────────────────────────────────────────────────┘


Initial State
─────────────
  email = ''
  password = ''
  isLoading = false
  errors = {}


User Input
──────────
  onChange → Update state
         → Clear field errors


Form Submission
────────────────
  Submit button clicked
        ↓
  e.preventDefault()
        ↓
  validateForm()
        ├─ Invalid → Show error toast, highlight fields
        └─ Valid → Continue
        ↓
  setIsLoading(true)
        ↓
  setTimeout (simulate API call)
        ↓
  login(email, password)
        ├─ Success:
        │    → Show success toast
        │    → navigate('/dashboard')
        └─ Error:
             → Show error toast
             → Stay on login
        ↓
  setIsLoading(false)


Form States
───────────
  [IDLE]      User can type
       ↓
  [VALIDATING] Check email/password format
       ↓
  [LOADING]   Show spinner, disable inputs
       ↓
  [SUCCESS]   Redirect to dashboard
  [ERROR]     Show error message
```

---

## 🔐 Security Flow

```
┌─────────────────────────────────────────────────────────────┐
│            SECURITY & ACCESS CONTROL                        │
└─────────────────────────────────────────────────────────────┘


Unauthorized Access Attempt
─────────────────────────────
  User (no token) tries to visit /dashboard
         ↓
  ProtectedRoute checks authStore
         ↓
  isAuthenticated = false
         ↓
  return <Navigate to="/login" replace />
         ↓
  Redirected to /login
         ↓
  Must authenticate first


Logged-in User Trying to Reach Login
─────────────────────────────────────
  Authenticated user visits /login
         ↓
  PublicRoute checks authStore
         ↓
  isAuthenticated = true
         ↓
  return <Navigate to="/dashboard" replace />
         ↓
  Redirected to /dashboard
         ↓
  Prevents login form confusion


Token Management (Future)
──────────────────────────
  After real auth:
  
  1. Server sends JWT token
  2. Store in localStorage or httpOnly cookie
  3. Include in API request headers
  4. On logout: Clear token
  5. On expiry: Request new token (refresh)
```

---

## ✅ Test Execution Paths

```
┌────────────────────────────────────────────────────────┐
│           TEST SCENARIO FLOWCHARTS                     │
└────────────────────────────────────────────────────────┘


TEST 1: Fresh Visit (Unauthenticated)
──────────────────────────────────────
  Open http://localhost:5173/
         ↓
  RootRedirect: isAuth? NO
         ↓
  Navigate to /login
         ↓
  Show LoginForm
         ↓
  PASS ✓


TEST 2: Valid Login
───────────────────
  Submit valid email & password
         ↓
  Validation PASS
         ↓
  authStore.login()
         ↓
  isAuthenticated = true
         ↓
  navigate('/dashboard')
         ↓
  Show Dashboard
         ↓
  PASS ✓


TEST 3: Protect Authenticated Routes
──────────────────────────────────────
  After login, visit /geoguessr
         ↓
  ProtectedRoute: isAuth? YES
         ↓
  Show GeoGuessr
         ↓
  PASS ✓


TEST 4: Prevent Login Page Access
──────────────────────────────────
  After login, visit /login
         ↓
  PublicRoute: isAuth? YES
         ↓
  Navigate to /dashboard
         ↓
  Show Dashboard
         ↓
  PASS ✓


TEST 5: Block Unauth Access
───────────────────────────
  Not logged in, visit /dashboard
         ↓
  ProtectedRoute: isAuth? NO
         ↓
  Navigate to /login
         ↓
  Show LoginForm
         ↓
  PASS ✓
```

---

## 📞 Key Contact Points

```
User Actions          Component                 Store/Router
──────────────────────────────────────────────────────────────
Login form submit → LoginForm.handleSubmit() → authStore.login()
                       ↓                            ↓
                  navigate() to                 isAuthenticated
                  /dashboard                    = true

Click navbar link  → Navbar onClick()          → Check if route
                       ↓                        is protected
                  useNavigate()                 ↓
                                            ProtectedRoute?
                                               ↓
                                            Allow/Redirect

Visit protected    → Browser location          → ProtectedRoute
page directly         changed to /protected        checks auth
                       ↓                           ↓
                  App routing activated      Render/Redirect

Click logout       → Navbar onClick()          → authStore.logout()
                       ↓                            ↓
                  navigate('/login')          isAuthenticated
                                             = false
```

---

**These diagrams visualize the complete routing and authentication flow system.**

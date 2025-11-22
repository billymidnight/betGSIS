import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute, PublicRoute, RootRedirect, BookRoute, UserRoute } from './router'
import Login from './pages/Login'
import Home from './pages/Home'
import Portfolio from './pages/Portfolio'
import GeoGuessr from './pages/GeoGuessr'
// Legacy static Bets page kept for reference; prefer `MyBets` for dynamic per-user bets
import Bets from './pages/Bets'
import MyBets from './pages/MyBets'
import BetSettler from './pages/BetSettler'
import Profile from './pages/Profile'
import BetLogger from './pages/BetLogger'
import BookControl from './pages/BookControl'
import BetGSISPortfolio from './pages/BetGSISPortfolio'
import MarketLocker from './pages/MarketLocker'
import BookieMasterLocker from './pages/BookieMasterLocker'
import Help from './pages/Help'
import ChessTemplate from './pages/templates/Chess'
import ZetamacTemplate from './pages/templates/Zetamac'
import MonopolyTemplate from './pages/templates/Monopoly'
import PokerTemplate from './pages/templates/Poker'
import BirthdayParadoxTemplate from './pages/templates/BirthdayParadox'
import ToastContainer from './components/Shared/ToastContainer'
import { useAuthStore } from './lib/state/authStore'
import AppShell from './components/Layout/AppShell'

export default function App() {
  const initAuth = useAuthStore((s) => s.init);

  useEffect(() => {
    // initialize auth state on app mount
    initAuth();
  }, []);
  return (
    <BrowserRouter>
      <Routes>
  {/* Root route - redirects to /login or /portfolio based on auth */}
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
          path="/home"
          element={
            <ProtectedRoute>
              <AppShell>
                <Home />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/portfolio"
          element={
            <UserRoute>
              <AppShell>
                <Portfolio />
              </AppShell>
            </UserRoute>
          }
        />

        <Route
          path="/geoguessr"
          element={
            <ProtectedRoute>
              <AppShell>
                <GeoGuessr />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/bets"
          element={
            <ProtectedRoute>
              <AppShell>
                <Bets />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-bets"
          element={
            <UserRoute>
              <AppShell>
                <MyBets />
              </AppShell>
            </UserRoute>
          }
        />

        <Route
          path="/bet-settler"
          element={
            <UserRoute>
              <AppShell>
                <BetSettler />
              </AppShell>
            </UserRoute>
          }
        />

        <Route
          path="/bet-logger"
          element={
            <BookRoute>
              <AppShell>
                <BetLogger />
              </AppShell>
            </BookRoute>
          }
        />

        <Route
          path="/book/control"
          element={
            <BookRoute>
              <AppShell>
                <BookControl />
              </AppShell>
            </BookRoute>
          }
        />

        <Route
          path="/betgsis-portfolio"
          element={
            <BookRoute>
              <AppShell>
                <BetGSISPortfolio />
              </AppShell>
            </BookRoute>
          }
        />

        <Route
          path="/help"
          element={
            <ProtectedRoute>
              <AppShell>
                <Help />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/bookie/master-locker"
          element={
            <BookRoute>
              <AppShell>
                <BookieMasterLocker />
              </AppShell>
            </BookRoute>
          }
        />

        <Route
          path="/market-locker"
          element={
            <BookRoute>
              <AppShell>
                <BookieMasterLocker />
              </AppShell>
            </BookRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppShell>
                <Profile />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* Catch-all - redirect unknown routes to root */}
        <Route path="*" element={<RootRedirect />} />
        {/* Template routes - placeholders */}
        <Route
          path="/templates/chess"
          element={
            <ProtectedRoute>
              <AppShell>
                <ChessTemplate />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates/zetamac"
          element={
            <ProtectedRoute>
              <AppShell>
                <ZetamacTemplate />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates/monopoly"
          element={
            <ProtectedRoute>
              <AppShell>
                <MonopolyTemplate />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates/poker"
          element={
            <ProtectedRoute>
              <AppShell>
                <PokerTemplate />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates/birthday-paradox"
          element={
            <ProtectedRoute>
              <AppShell>
                <BirthdayParadoxTemplate />
              </AppShell>
            </ProtectedRoute>
          }
        />
      </Routes>

      {/* Toast notifications - always visible */}
      <ToastContainer />
    </BrowserRouter>
  )
}

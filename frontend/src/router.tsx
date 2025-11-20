import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from './lib/state/authStore'

/**
 * ProtectedRoute Component
 * Checks if user is authenticated, redirects to login if not
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

/**
 * PublicRoute Component
 * Redirects authenticated users to home to prevent seeing login page
 */
export function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to="/home" replace />
  }

  return <>{children}</>
}


/**
 * BookRoute Component
 * Ensures the authenticated user has role === 'book'
 */
export function BookRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (!isAuthenticated) return <Navigate to="/login" replace />
  // Accept only users with role === 'BOOKIE'
  if (!user || user.role !== 'BOOKIE') return <Navigate to="/home" replace />
  return <>{children}</>
}


/**
 * UserRoute Component
 * Ensures the authenticated user has role === 'user'
 */
export function UserRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  // Only require authentication for UserRoute. Allow any authenticated user
  // to access user-facing routes (do not auto-redirect to /home).
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

/**
 * RootRedirect Component
 * Redirects / to /login or /home based on auth status
 */
export function RootRedirect() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (isAuthenticated) {
     return <Navigate to="/home" replace />
  }

  return <Navigate to="/login" replace />
}

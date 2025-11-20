import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../lib/state/authStore'
import { Button } from '../Shared/Button'
import Input from '../Shared/Input'
import { useUIStore } from '../../lib/state/uiStore'
import './LoginForm.css'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [isLoading, setIsLoading] = useState(false)

  const login = useAuthStore((state) => state.login)
  const signup = useAuthStore((state) => (state as any).signup)
  const addToast = useUIStore((state) => state.addToast)
  const navigate = useNavigate()
  const [isSignup, setIsSignup] = useState(false)

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

    // Simulate API call for authentication / signup
    setTimeout(async () => {
      try {
        if (isSignup) {
          const res = await signup(email, password)
          addToast({ message: `Account created — welcome, ${email}!`, type: 'success' })
          // After signup navigate to portfolio
          navigate('/home', { replace: true })
        } else {
          await login(email, password)
          addToast({ message: `Welcome back, ${email}!`, type: 'success' })
          navigate('/home', { replace: true })
        }
      } catch (error) {
        addToast({ message: (error as any)?.message || 'Auth failed. Please try again.', type: 'error' })
        console.error('Auth error:', error)
      } finally {
        setIsLoading(false)
      }
    }, 500)
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <h2 className="login-form-title">Login to betGSIS</h2>

      <div className="form-group">
        <Input
          id="email"
          type="email"
          label="Email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (errors.email) setErrors({ ...errors, email: undefined })
          }}
          placeholder="your@email.com"
          error={errors.email}
          disabled={isLoading}
        />
      </div>

      <div className="form-group">
        <Input
          id="password"
          type="password"
          label="Password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (errors.password) setErrors({ ...errors, password: undefined })
          }}
          placeholder="••••••••"
          error={errors.password}
          disabled={isLoading}
          helpText="Any password works for demo"
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isLoading}
        className="login-submit-btn"
      >
        {isLoading ? (isSignup ? 'Creating account...' : 'Logging in...') : (isSignup ? 'Sign up' : 'Login')}
      </Button>

      <div className="login-actions">
        <label className="signup-toggle">
          <input type="checkbox" checked={isSignup} onChange={(e) => setIsSignup(e.target.checked)} />
          <span> Sign up instead</span>
        </label>
        <p className="login-demo-hint">💡 <strong>Demo mode:</strong> Use any email and password to {isSignup ? 'create an account' : 'login'}</p>
      </div>
    </form>
  )
}

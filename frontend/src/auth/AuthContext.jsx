import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authApi, getToken, setToken, setAuthErrorHandler } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  // Validate an existing token on first load; wire up the 401 → logout handler.
  useEffect(() => {
    setAuthErrorHandler(() => setUser(null))
    if (!getToken()) {
      setLoading(false)
      return
    }
    authApi.me()
      .then(({ data }) => setUser(data))
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    const { data } = await authApi.login({ email, password })
    setToken(data.access_token)
    setUser(data.user)
    return data.user
  }

  async function register(email, password, displayName) {
    const { data } = await authApi.register({
      email,
      password,
      display_name: displayName || undefined,
    })
    setToken(data.access_token)
    setUser(data.user)
    return data.user
  }

  // Re-fetch the current user (after upgrade, profile change, etc.).
  const refreshUser = useCallback(async () => {
    try {
      const { data } = await authApi.me()
      setUser(data)
      return data
    } catch {
      return null
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser, setUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

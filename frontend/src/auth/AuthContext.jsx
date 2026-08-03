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

  /**
   * Create an account. Returns the raw response: since e-mail confirmation
   * exists there is NO token yet — the caller has to collect the code first and
   * then call verify(). Returning the user here would have been a lie.
   */
  async function register(email, password, displayName, inviteCode) {
    const { data } = await authApi.register({
      email,
      password,
      display_name: displayName || undefined,
      invite_code: inviteCode || undefined,
    })
    return data
  }

  async function verify(email, code) {
    const { data } = await authApi.verify(email, code)
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
      value={{ user, loading, login, register, verify, logout, refreshUser, setUser }}
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

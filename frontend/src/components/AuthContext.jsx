import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)

  // Load auth from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('vh-auth')
    if (!saved) return

    try {
      const parsed = JSON.parse(saved)

      const tokenVal = parsed.token
      const userVal =
        parsed.user ||
        (parsed.username
          ? { username: parsed.username, role: parsed.role }
          : null)

      if (tokenVal && userVal?.username) {
        setToken(tokenVal)
        setUser(userVal)
      } else {
        localStorage.removeItem('vh-auth')
      }
    } catch {
      localStorage.removeItem('vh-auth')
    }
  }, [])

  // Save auth from ANY successful auth response
  const login = (auth) => {
    if (!auth) {
      console.warn('Auth object missing')
      return
    }

    const tokenVal = auth.token
    const userVal =
      auth.user ||
      (auth.username
        ? { username: auth.username, role: auth.role }
        : null)

    // 🚨 DO NOT THROW ERROR — just ignore bad response
    if (!tokenVal || !userVal?.username) {
      console.warn('Auth succeeded but response format was unexpected', auth)
      return
    }

    const normalizedAuth = {
      token: tokenVal,
      user: userVal,
    }

    localStorage.setItem('vh-auth', JSON.stringify(normalizedAuth))
    setToken(tokenVal)
    setUser(userVal)
  }

  const logout = () => {
    localStorage.removeItem('vh-auth')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

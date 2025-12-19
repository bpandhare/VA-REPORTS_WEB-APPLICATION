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
      console.log('📂 Loading auth from localStorage:', parsed) // Debug

      const tokenVal = parsed.token
      const userVal = parsed.user || null

      if (tokenVal && userVal?.username) {
        setToken(tokenVal)
        setUser(userVal)
        console.log('✅ Auth loaded:', userVal) // Debug
      } else {
        console.warn('❌ Invalid auth data in localStorage')
        localStorage.removeItem('vh-auth')
      }
    } catch (error) {
      console.error('❌ Error parsing localStorage auth:', error)
      localStorage.removeItem('vh-auth')
    }
  }, [])

  // Save auth from successful login
  const login = (auth) => {
    console.log('🔐 Login called with:', auth) // Debug
    
    if (!auth) {
      console.warn('❌ Auth object missing')
      return
    }

    // CRITICAL: Extract ALL fields from auth response
    const userVal = {
      username: auth.username,
      role: auth.role,
      employeeId: auth.employeeId
    }

    console.log('✅ Storing user:', userVal)

    const normalizedAuth = {
      token: auth.token,
      user: userVal,
    }

    localStorage.setItem('vh-auth', JSON.stringify(normalizedAuth))
    setToken(auth.token)
    setUser(userVal)
    
    // Also store employeeId separately for quick access
    if (auth.employeeId) {
      localStorage.setItem('lastEmployeeId', auth.employeeId)
    }
  }

  const logout = () => {
    console.log('🚪 Logging out')
    localStorage.removeItem('vh-auth')
    localStorage.removeItem('lastEmployeeId')
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
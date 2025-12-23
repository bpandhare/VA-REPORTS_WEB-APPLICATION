import { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  // Function to fetch user profile using token
  const fetchUserProfile = async (token) => {
    try {
      const response = await axios.get(`${API_URL}/auth/profile`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      
      if (response.data) {
        return {
          id: response.data.id,
          name: response.data.name || response.data.username,
          username: response.data.username,
          role: response.data.role,
          employeeId: response.data.employeeId,
          phone: response.data.phone,
          dob: response.data.dob
        }
      }
      return null
    } catch (error) {
      console.error('❌ Failed to fetch user profile:', error)
      return null
    }
  }

  // Load auth from localStorage and fetch fresh user data
  useEffect(() => {
    const loadAuth = async () => {
      const saved = localStorage.getItem('vh-auth')
      if (!saved) {
        setLoading(false)
        return
      }

      try {
        const parsed = JSON.parse(saved)
        console.log('📂 Loading auth from localStorage:', { 
          token: parsed.token ? 'Token exists' : 'No token',
          user: parsed.user 
        })

        const tokenVal = parsed.token
        const savedUser = parsed.user || null

        if (tokenVal) {
          // Set token immediately for API calls
          setToken(tokenVal)
          
          // Try to fetch fresh user profile from server
          const freshUser = await fetchUserProfile(tokenVal)
          
          if (freshUser) {
            // Use fresh user data from server
            setUser(freshUser)
            // Update localStorage with fresh data
            localStorage.setItem('vh-auth', JSON.stringify({
              token: tokenVal,
              user: freshUser
            }))
            console.log('✅ Auth loaded with fresh profile:', freshUser)
          } else if (savedUser?.username) {
            // Fallback to saved user data
            setUser(savedUser)
            console.log('✅ Auth loaded from localStorage (cached):', savedUser)
          } else {
            console.warn('❌ Invalid auth data in localStorage')
            localStorage.removeItem('vh-auth')
            setToken(null)
            setUser(null)
          }
        } else {
          console.warn('❌ No token found in localStorage')
          localStorage.removeItem('vh-auth')
          setToken(null)
          setUser(null)
        }
      } catch (error) {
        console.error('❌ Error parsing localStorage auth:', error)
        localStorage.removeItem('vh-auth')
        setToken(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    loadAuth()
  }, [])

  // Save auth from successful login
  const login = async (auth) => {
    console.log('🔐 Login called with:', auth)
    
    if (!auth || !auth.token) {
      console.warn('❌ Auth object or token missing')
      return false
    }

    try {
      // Fetch user profile from server with the new token
      const userProfile = await fetchUserProfile(auth.token)
      
      if (!userProfile) {
        console.error('❌ Failed to fetch user profile after login')
        return false
      }

    const userVal = {
  id: userProfile.id,
  name: userProfile.name || userProfile.username,  // Use username as fallback
  username: userProfile.username,
  role: userProfile.role,
  employeeId: userProfile.employeeId,
  phone: userProfile.phone,
  dob: userProfile.dob
}

      console.log('✅ User profile fetched:', userVal)

      const normalizedAuth = {
        token: auth.token,
        user: userVal,
      }

      // Store in localStorage
      localStorage.setItem('vh-auth', JSON.stringify(normalizedAuth))
      
      // Store employeeId separately for quick access
      if (userProfile.employeeId) {
        localStorage.setItem('lastEmployeeId', userProfile.employeeId)
      }

      // Update state
      setToken(auth.token)
      setUser(userVal)
      
      return true
    } catch (error) {
      console.error('❌ Error during login process:', error)
      return false
    }
  }

  const logout = () => {
    console.log('🚪 Logging out')
    localStorage.removeItem('vh-auth')
    localStorage.removeItem('lastEmployeeId')
    setToken(null)
    setUser(null)
  }

  // Function to update user data (e.g., after profile update)
  const updateUser = (updates) => {
    if (!user) return

    const updatedUser = { ...user, ...updates }
    setUser(updatedUser)
    
    // Update localStorage
    const saved = localStorage.getItem('vh-auth')
    if (saved) {
      const parsed = JSON.parse(saved)
      parsed.user = updatedUser
      localStorage.setItem('vh-auth', JSON.stringify(parsed))
    }
  }

  // Check if user has specific role
  const hasRole = (role) => {
    if (!user || !user.role) return false
    return user.role.toLowerCase().includes(role.toLowerCase())
  }

  // Check if user is manager
  const isManager = () => {
    return hasRole('manager')
  }

  // Check if user is engineer
  const isEngineer = () => {
    return hasRole('engineer')
  }

  // Get user display name
  const getDisplayName = () => {
    if (!user) return ''
    return user.name || user.username || ''
  }

  // Get user role display
  const getRoleDisplay = () => {
    if (!user || !user.role) return ''
    
    const role = user.role
    // Capitalize first letter of each word
    return role.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ')
  }

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    updateUser,
    hasRole,
    isManager,
    isEngineer,
    getDisplayName,
    getRoleDisplay
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Helper hook for authenticated API calls
export function useAuthAxios() {
  const { token } = useAuth()
  
  const authAxios = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json'
    }
  })

  // Add token to requests if available
  authAxios.interceptors.request.use(
    (config) => {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  // Handle token expiration
  authAxios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        console.warn('⚠️ Token expired or invalid')
        // Optionally: trigger logout
        // const { logout } = useAuth()
        // logout()
      }
      return Promise.reject(error)
    }
  )

  return authAxios
}
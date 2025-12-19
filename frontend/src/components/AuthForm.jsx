import { useMemo, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import './AuthForm.css'

function AuthForm() {
  const { login } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [employeeId, setEmployeeId] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [isEmployeeIdTaken, setIsEmployeeIdTaken] = useState(false)
  const [checkingEmployeeId, setCheckingEmployeeId] = useState(false)
   
  const endpointBase = useMemo(
    () => import.meta.env.VITE_API_URL?.replace('/api/activity', '/api/auth') ?? '/api/auth',
    []
  )

  // Check if employee ID is already taken when user stops typing
  useEffect(() => {
    const checkEmployeeId = async () => {
      if (mode === 'register' && employeeId && !role.includes('Manager')) {
        const empIdError = validateEmployeeId(employeeId)
        if (empIdError) {
          setIsEmployeeIdTaken(false)
          return
        }

        setCheckingEmployeeId(true)
        try {
          const response = await fetch(`${endpointBase}/check-employee-id/${employeeId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          })

          if (response.ok) {
            const data = await response.json()
            setIsEmployeeIdTaken(!data.available)
          } else {
            setIsEmployeeIdTaken(false)
          }
        } catch (error) {
          console.error('Error checking employee ID:', error)
          setIsEmployeeIdTaken(false)
        } finally {
          setCheckingEmployeeId(false)
        }
      } else {
        setIsEmployeeIdTaken(false)
      }
    }

    // Debounce the check
    const timer = setTimeout(checkEmployeeId, 500)
    return () => clearTimeout(timer)
  }, [employeeId, mode, role, endpointBase])

  // Reset employee ID and validation when role changes
  useEffect(() => {
    if (role.includes('Manager')) {
      setEmployeeId('')
      setIsEmployeeIdTaken(false)
    }
  }, [role])

  // Function to validate Employee ID format: E001 (E + 1-5 digits, max 6 chars)
  const validateEmployeeId = (id) => {
    if (!id) return 'Employee ID is required'
    
    // Format: E followed by 1-5 digits (total 2-6 characters)
    // Examples: E001, E12345, E99999
    const empIdRegex = /^E\d{1,5}$/
    if (!empIdRegex.test(id)) {
      return 'Employee ID must be in format E001 (E followed by 1-5 digits)'
    }
    
    // Check max 6 characters (E + up to 5 digits)
    if (id.length > 6) {
      return 'Employee ID cannot exceed 6 characters'
    }
    
    return null // No error
  }

  // Handle Employee ID input with format validation
  const handleEmployeeIdChange = (e) => {
    const value = e.target.value.toUpperCase() // Convert to uppercase
    
    // Only allow: starts with E, then only digits, max 6 chars total
    if (value === 'E' || /^E\d{0,5}$/.test(value)) {
      setEmployeeId(value)
    } else if (value === '') {
      setEmployeeId('') // Allow clearing the field
    }
    // Otherwise, don't update the state (invalid input)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setAlert(null)

    try {
      // Prepare request body
      const requestBody = {
        username: username.trim(),
        password: password,
        role: role
      }

      // Add additional fields based on mode
      if (mode === 'register') {
        // Add DOB for registration
        requestBody.dob = dob
        
        // Only include employeeId for non-manager roles
        if (!role.includes('Manager') && employeeId) {
          requestBody.employeeId = employeeId.trim()
        }
      } else {
        // For login: ALWAYS include employeeId if provided, but not required for Managers
        if (employeeId) {
          requestBody.employeeId = employeeId.trim()
        }
        // Managers can login with just username and password
        // Non-managers need employeeId + username + password
      }

      // Validate fields before sending
      if (mode === 'register') {
        if (!dob) {
          setAlert({ type: 'error', message: 'Date of birth is required' })
          setLoading(false)
          return
        }

        const dobDate = new Date(dob)
        if (Number.isNaN(dobDate.getTime())) {
          setAlert({ type: 'error', message: 'Invalid date of birth' })
          setLoading(false)
          return
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (dobDate >= today) {
          setAlert({
            type: 'error',
            message: 'Date of birth must be before today (no future dates)',
          })
          setLoading(false)
          return
        }

        // For non-manager registration, validate employeeId
        if (!role.includes('Manager')) {
          const empIdError = validateEmployeeId(employeeId)
          if (empIdError) {
            setAlert({ type: 'error', message: empIdError })
            setLoading(false)
            return
          }

          if (isEmployeeIdTaken) {
            setAlert({ type: 'error', message: 'This Employee ID is already taken. Please choose a different one.' })
            setLoading(false)
            return
          }
        }
      } else {
        // For login: validate employeeId only for non-manager roles
        if (!role.includes('Manager') && !employeeId) {
          setAlert({ type: 'error', message: 'Employee ID is required for non-manager roles' })
          setLoading(false)
          return
        }

        if (!role.includes('Manager') && employeeId) {
          const empIdError = validateEmployeeId(employeeId)
          if (empIdError) {
            setAlert({ type: 'error', message: empIdError })
            setLoading(false)
            return
          }
        }
      }

      // DEBUG: Log the request
      console.log('📤 Sending request to:', `${endpointBase}/${mode}`)
      console.log('📦 Request body:', requestBody)
      console.log('👤 Role:', role)
      console.log('👤 Is Manager:', role.includes('Manager'))
      
      const response = await fetch(`${endpointBase}/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      console.log('📥 Response status:', response.status)
      
      let data = null
      const rawText = await response.text()
      console.log('📥 Raw response:', rawText)
      
      if (rawText) {
        try {
          data = JSON.parse(rawText)
        } catch (e) {
          console.error('❌ Failed to parse response as JSON:', e)
        }
      }

      if (!response.ok) {
        const message = data?.message || `Authentication failed (status ${response.status})`
        throw new Error(message)
      }

      if (!data || !data.token || !data.username) {
        throw new Error('Authentication succeeded but server returned invalid data.')
      }

      login({ 
        token: data.token, 
        username: data.username, 
        role: data.role,
        employeeId: data.employeeId || null // Can be null for managers
      })
      setAlert({
        type: 'success',
        message: mode === 'login' ? 'Logged in successfully.' : 'Registered & logged in.',
      })
    } catch (error) {
      console.error('❌ Error details:', error)
      setAlert({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }

  // Check if employee ID field should be shown
  const showEmployeeIdField = mode === 'login' || !role.includes('Manager')
  
  // Check if employee ID field is required
  const isEmployeeIdRequired = () => {
    if (mode === 'register') {
      return !role.includes('Manager')
    } else {
      // For login: required for non-managers only
      return !role.includes('Manager')
    }
  }

  return (
    <section className="vh-form-shell">
      <header className="vh-form-header">
        <div>
          <p className="vh-form-label">Engineer access</p>
          <h2>{mode === 'login' ? 'Login to Site Pulse' : 'Create your Site Pulse account'}</h2>
          <p>
            {mode === 'login' 
              ? role.includes('Manager') 
                ? 'Managers: Use your username and password (Employee ID not required)'
                : 'Use your Employee ID (format: E001) and password to access the system.'
              : role.includes('Manager') 
                ? 'Managers do not require an Employee ID. Use your username and password.'
                : 'Use a unique Employee ID (format: E001) and create your account.'
            }
          </p>
        </div>
      </header>

      {alert && (
        <div className={`vh-alert ${alert.type}`}>
          <p>{alert.message}</p>
        </div>
      )}

      <form className="vh-form" onSubmit={handleSubmit}>
        {/* Role Selection for Login (Managers need to identify themselves) */}
        {mode === 'login' && (
          <label>
            <span>I am a:</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
            >
              <option value="">-- Select your role --</option>
              <option value="Manager">Manager</option>
              <option value="Team Leader">Team Leader</option>
              <option value="Senior Engineer">Senior Engineer</option>
              <option value="Junior Engineer">Junior Engineer</option>
              <option value="Trainee">Trainee</option>
            </select>
            <small className="form-hint">
              Select your role to determine login method
            </small>
          </label>
        )}

        {/* Employee ID Field - Conditionally shown */}
        {showEmployeeIdField && (
          <label>
            <span>Employee ID {isEmployeeIdRequired() ? '*' : ''}</span>
            <div className="input-with-status">
              <input
                type="text"
                value={employeeId}
                onChange={handleEmployeeIdChange}
                placeholder={mode === 'register' ? "E001, E002, E12345" : "Enter your Employee ID"}
                required={isEmployeeIdRequired()}
                // FIXED: Changed pattern to use double backslash or removed it
                // pattern={isEmployeeIdRequired() ? "E\\d{1,5}" : undefined}
                title={isEmployeeIdRequired() ? "Format: E followed by 1-5 digits (e.g., E001, E12345)" : "Optional for Managers"}
                maxLength="6"
                style={{ textTransform: 'uppercase' }}
                disabled={checkingEmployeeId}
              />
              {checkingEmployeeId && (
                <span className="checking-status">Checking...</span>
              )}
              {isEmployeeIdTaken && !checkingEmployeeId && (
                <span className="error-status">Already taken</span>
              )}
              {!isEmployeeIdTaken && employeeId && !checkingEmployeeId && mode === 'register' && (
                <span className="success-status">Available</span>
              )}
            </div>
            <small className="form-hint">
              {mode === 'register' 
                ? role.includes('Manager')
                  ? 'Managers do not require an Employee ID'
                  : 'Format: E followed by 1-5 digits (max 6 characters). Must be unique. Examples: E001, E12345'
                : role.includes('Manager')
                  ? 'Optional for Managers'
                  : 'Enter your assigned Employee ID'
              }
            </small>
          </label>
        )}

        <label>
          <span>Username *</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>

        <label>
          <span>Password *</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {mode === 'register' && (
          <label>
            <span>Role *</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
            >
              <option value="">-- Select your role --</option>
              <option value="Manager">Manager</option>
              <option value="Team Leader">Team Leader</option>
              <option value="Senior Engineer">Senior Engineer</option>
              <option value="Junior Engineer">Junior Engineer</option>
              <option value="Trainee">Trainee</option>
            </select>
            <small className="form-hint">
              {role.includes('Manager') 
                ? 'Managers do not require an Employee ID'
                : 'Select your role to determine access level'
              }
            </small>
          </label>
        )}

        {mode === 'register' && (
          <label>
            <span>Date of Birth *</span>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
        )}

        <div className="vh-form-actions">
          <button type="submit" disabled={loading || (mode === 'register' && !role.includes('Manager') && isEmployeeIdTaken)}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Login' : 'Register'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setEmployeeId('')
              setUsername('')
              setPassword('')
              setDob('')
              setRole('')
              setIsEmployeeIdTaken(false)
            }}
            disabled={loading}
          >
            {mode === 'login' ? 'Create new account' : 'I already have an account'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default AuthForm
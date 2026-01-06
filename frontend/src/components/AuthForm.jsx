import { useMemo, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import './AuthForm.css'

function AuthForm() {
  const { login } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [employeeId, setEmployeeId] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [isEmployeeIdTaken, setIsEmployeeIdTaken] = useState(false)
  const [checkingEmployeeId, setCheckingEmployeeId] = useState(false)
  const [checkingPhone, setCheckingPhone] = useState(false)
  const [isPhoneTaken, setIsPhoneTaken] = useState(false)
   
  const endpointBase = useMemo(
    () => import.meta.env.VITE_API_URL?.replace('/api/activity', '/api/auth') ?? '/api/auth',
    []
  )

  // Phone number validation
  const validatePhone = (phoneNumber) => {
    if (!phoneNumber) return 'Phone number is required'
    
    const cleanPhone = phoneNumber.replace(/\D/g, '')
    
    if (cleanPhone.length !== 10) {
      return 'Phone number must be 10 digits'
    }
    
    if (!/^[6-9]/.test(cleanPhone)) {
      return 'Phone number must start with 6, 7, 8, or 9'
    }
    
    return null
  }

  // Handle phone input with formatting
  const handlePhoneChange = (e) => {
    let value = e.target.value
    value = value.replace(/\D/g, '')
    value = value.substring(0, 10)
    
    if (value.length > 6) {
      value = value.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
    } else if (value.length > 3) {
      value = value.replace(/(\d{3})(\d{1,3})/, '$1-$2')
    }
    
    setPhone(value)
  }

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

    const timer = setTimeout(checkEmployeeId, 500)
    return () => clearTimeout(timer)
  }, [employeeId, mode, role, endpointBase])

  // Check if phone number is already taken when user stops typing
  useEffect(() => {
    const checkPhone = async () => {
      if (mode === 'register' && phone) {
        const cleanPhone = phone.replace(/\D/g, '')
        const phoneError = validatePhone(cleanPhone)
        
        if (phoneError || cleanPhone.length < 10) {
          setIsPhoneTaken(false)
          return
        }

        setCheckingPhone(true)
        try {
          const response = await fetch(`${endpointBase}/check-phone/${cleanPhone}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          })

          if (response.ok) {
            const data = await response.json()
            setIsPhoneTaken(!data.available)
          } else {
            setIsPhoneTaken(false)
          }
        } catch (error) {
          console.error('Error checking phone:', error)
          setIsPhoneTaken(false)
        } finally {
          setCheckingPhone(false)
        }
      } else {
        setIsPhoneTaken(false)
      }
    }

    const timer = setTimeout(checkPhone, 500)
    return () => clearTimeout(timer)
  }, [phone, mode, endpointBase])

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
    
    const empIdRegex = /^E\d{1,5}$/
    if (!empIdRegex.test(id)) {
      return 'Employee ID must be in format E001 (E followed by 1-5 digits)'
    }
    
    if (id.length > 6) {
      return 'Employee ID cannot exceed 6 characters'
    }
    
    return null
  }

  // Handle Employee ID input with format validation
  const handleEmployeeIdChange = (e) => {
    const value = e.target.value.toUpperCase()
    
    if (value === 'E' || /^E\d{0,5}$/.test(value)) {
      setEmployeeId(value)
    } else if (value === '') {
      setEmployeeId('')
    }
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
        role: role || ''
      }

      // Add additional fields based on mode
      if (mode === 'register') {
        requestBody.full_name = fullName.trim() || username.trim()
        requestBody.dob = dob
        
        const cleanPhone = phone.replace(/\D/g, '')
        requestBody.phone = cleanPhone
        
        // Only include employee_id for non-manager roles
        if (!role.includes('Manager') && employeeId) {
          requestBody.employee_id = employeeId.trim().toUpperCase()
        }
      } else {
        // For login: ALWAYS include employee_id if provided
        // Backend will validate it matches the user's registered employee_id
        if (employeeId) {
          requestBody.employee_id = employeeId.trim().toUpperCase()
        }
      }

      console.log('🔍 DEBUG - Request body being sent:', {
        ...requestBody,
        password: '***'
      })

      // Validate fields before sending
      if (mode === 'register') {
        if (!username || !password || !role) {
          setAlert({ type: 'error', message: 'All required fields must be filled' })
          setLoading(false)
          return
        }

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

        const cleanPhone = phone.replace(/\D/g, '')
        const phoneError = validatePhone(cleanPhone)
        if (phoneError) {
          setAlert({ type: 'error', message: phoneError })
          setLoading(false)
          return
        }

        if (isPhoneTaken) {
          setAlert({ type: 'error', message: 'This phone number is already registered' })
          setLoading(false)
          return
        }

        if (!role.includes('Manager')) {
          const empIdError = validateEmployeeId(employeeId)
          if (empIdError) {
            setAlert({ type: 'error', message: empIdError })
            setLoading(false)
            return
          }

          if (isEmployeeIdTaken) {
            setAlert({ type: 'error', message: 'This Employee ID is already taken' })
            setLoading(false)
            return
          }
        }
      } else {
        // For login: basic validation
        if (!username || !password || !role) {
          setAlert({ type: 'error', message: 'Username, password, and role are required' })
          setLoading(false)
          return
        }

        // For non-manager login: employeeId is REQUIRED
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

      console.log('📤 Sending request to:', `${endpointBase}/${mode}`)
      
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

      if (!data || !data.token) {
        throw new Error('Authentication succeeded but server returned invalid data.')
      }

      // Use the updated login function from AuthContext
      const loginSuccess = await login({ 
        token: data.token, 
        username: data.user?.username || data.username, 
        name: data.user?.fullName || data.user?.username || data.username,
        role: data.user?.role || data.role,
        employeeId: data.user?.employeeId || data.user?.employee_id || data.employee_id || null,
        phone: data.user?.phone || data.phone || null
      })
      
      if (loginSuccess) {
        setAlert({
          type: 'success',
          message: mode === 'login' ? 'Logged in successfully.' : 'Registered & logged in.',
        })
      } else {
        setAlert({ type: 'error', message: 'Failed to complete login process' })
      }
    } catch (error) {
      console.error('❌ Error details:', error)
      setAlert({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }

  const showEmployeeIdField = mode === 'login' || !role.includes('Manager')
  
  const isEmployeeIdRequired = () => {
    if (mode === 'register') {
      return !role.includes('Manager')
    } else {
      return !role.includes('Manager')
    }
  }

  const handleModeToggle = () => {
    setMode(mode === 'login' ? 'register' : 'login')
    if (mode === 'login') {
      setEmployeeId('')
      setUsername('')
      setFullName('')
      setPassword('')
      setDob('')
      setPhone('')
    } else {
      setEmployeeId('')
      setUsername('')
      setFullName('')
      setPassword('')
      setDob('')
      setPhone('')
      setRole('')
    }
    setIsEmployeeIdTaken(false)
    setIsPhoneTaken(false)
  }

  return (
    <section className="vh-form-shell">
      {/* Company Header with Logo */}
    {/* Company Header with Logo */}
<div className="company-header">
  <div className="company-logo-container">
    {/* Replace SVG with your actual logo */}
    <div className="company-logo">
      <img 
        src="/src/assets/logo.jpeg" 
        alt="VickHardth Engineering Logo" 
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'contain',
          borderRadius: '15px'
        }}
      />
    </div>
    <div className="company-info">
      <h1 className="company-name">VICKHARDTH AUTOMATION</h1>
      <p className="company-tagline">Site Activity Monitoring System</p>
    </div>
  </div>
</div>
      <header className="vh-form-header">
        <div>
          <p className="vh-form-label">Welcome</p>
          <h2>{mode === 'login' ? 'Login to Dashboard' : 'Create New Account'}</h2>
          <p>
            {mode === 'login' 
              ? role.includes('Manager') 
                ? 'Managers: Login with username and password'
                : 'Use Employee ID (format: E001), username and password'
              : role.includes('Manager') 
                ? 'Manager accounts don\'t require Employee ID'
                : 'Create account with unique Employee ID (format: E001)'
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
        {/* Role Selection for Login */}
        {mode === 'login' && (
          <label>
            <span>Your Role *</span>
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
            </select>
            <small className="form-hint">
              Select role to determine login method
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
                placeholder={mode === 'register' ? "E001, E002, E12345" : "Enter Employee ID"}
                required={isEmployeeIdRequired()}
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
                  : 'Format: E followed by 1-5 digits (e.g., E001, E12345)'
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
            placeholder="Enter username"
            required
          />
        </label>

        {/* Full Name Field - Only for registration */}
        {mode === 'register' && (
          <label>
            <span>Full Name {!fullName && <span className="optional">(Optional)</span>}</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
            />
            <small className="form-hint">
              Will use username if not provided
            </small>
          </label>
        )}

        <label>
          <span>Password *</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            required
            minLength="6"
          />
          <small className="form-hint">
            Minimum 6 characters
          </small>
        </label>

        {/* Phone Number Field - Only for registration */}
        {mode === 'register' && (
          <label>
            <span>Phone Number *</span>
            <div className="input-with-status">
              <input
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="123-456-7890"
                required
                pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
                title="Please enter a valid 10-digit phone number"
                disabled={checkingPhone}
              />
              {checkingPhone && (
                <span className="checking-status">Checking...</span>
              )}
              {isPhoneTaken && !checkingPhone && (
                <span className="error-status">Already registered</span>
              )}
              {!isPhoneTaken && phone.replace(/\D/g, '').length === 10 && !checkingPhone && (
                <span className="success-status">Available</span>
              )}
            </div>
            <small className="form-hint">
              10-digit mobile number starting with 6, 7, 8, or 9
            </small>
          </label>
        )}

        {/* Role Selection for Registration */}
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
            </select>
            <small className="form-hint">
              {role.includes('Manager') 
                ? 'Managers have full access to all features'
                : 'Role determines access level and permissions'
              }
            </small>
          </label>
        )}

        {/* Date of Birth - Only for registration */}
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
            <small className="form-hint">
              Must be a valid date before today
            </small>
          </label>
        )}

        <div className="vh-form-actions">
          <button 
            type="submit" 
            disabled={loading || (mode === 'register' && !role.includes('Manager') && isEmployeeIdTaken) || (mode === 'register' && isPhoneTaken)}
            className={loading ? 'loading' : ''}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                {mode === 'login' ? 'Logging in...' : 'Registering...'}
              </>
            ) : (
              mode === 'login' ? 'Login' : 'Register'
            )}
          </button>
          
          <button
            type="button"
            className="ghost"
            onClick={handleModeToggle}
            disabled={loading}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
          </button>
        </div>

        {/* Company Footer */}
        <div className="company-footer">
          <p className="copyright">© {new Date().getFullYear()} VickHardth Engineering. All rights reserved.</p>
          <p className="support">For support, contact: support@vickhardth.com</p>
        </div>
      </form>
    </section> 
  )
}

export default AuthForm
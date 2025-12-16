import { useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import './AuthForm.css'

function AuthForm() {
  const { login } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
   
  const endpointBase = useMemo(
    () => import.meta.env.VITE_API_URL?.replace('/api/activity', '/api/auth') ?? '/api/auth',
    []
  )

  
  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setAlert(null)

    try {
      // Extra client-side DOB validation for register mode
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
      }

      const requestBody =
        mode === 'register'
          ? { username, password, dob, role }
          : { username, password }
      
      const response = await fetch(`${endpointBase}/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      let data = null
      const rawText = await response.text()
      if (rawText) {
        try {
          data = JSON.parse(rawText)
        } catch {
          // not JSON, leave data as null
        }
      }

      if (!response.ok) {
        const message =
          (data && data.message) ||
          `Authentication failed (status ${response.status})`
        throw new Error(message)
      }

      if (!data || !data.token || !data.username) {
        throw new Error('Authentication succeeded but server returned invalid data.')
      }

      login({ token: data.token, username: data.username, role: data.role })
      setAlert({
        type: 'success',
        message: mode === 'login' ? 'Logged in successfully.' : 'Registered & logged in.',
      })
    } catch (error) {
      setAlert({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="vh-form-shell">
      <header className="vh-form-header">
        <div>
          <p className="vh-form-label">Engineer access</p>
          <h2>{mode === 'login' ? 'Login to Site Pulse' : 'Create your Site Pulse account'}</h2>
          <p>
            Use a simple username and password. Once logged in, you can fill daily activity and
            onboarding reports.
          </p>
        </div>
      </header>

      {alert && (
        <div className={`vh-alert ${alert.type}`}>
          <p>{alert.message}</p>
        </div>
      )}

      <form className="vh-form" onSubmit={handleSubmit}>
        <label>
          <span>Username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>

        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {mode === 'register' && (
          <label>
            <span>Role</span>
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
          </label>
        )}

        {mode === 'register' && (
          <label>
            <span>Date of Birth</span>
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
          <button type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Login' : 'Register'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setDob('') // Reset DOB when switching modes
              setRole('') // Reset role when switching modes
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


import { useMemo, useState, useEffect } from 'react'
import './OnboardingForm.css'
import { useAuth } from './AuthContext'

/* ---------- DEFAULT PAYLOAD ---------- */
const defaultPayload = () => {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = now.toISOString().slice(11, 16)

  return {
    date,
    time: `${time}:00`,
    engineerName: '',
    project: '',
    location: '',
    activityTarget: '',
    problem: '',
    status: 'present', // present, leave, absent
    leaveReason: '',
    startTime: '',
    endTime: '',
  }
}

/* ---------- ACTIVITY TYPES ---------- */
const activityTypes = [
  { value: 'site_work', label: 'Site Work' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'planning', label: 'Planning' },
  { value: 'reporting', label: 'Reporting' },
  { value: 'training', label: 'Training' },
  { value: 'leave', label: 'Leave' },
  { value: 'other', label: 'Other' },
]

/* ---------- TEXTAREA FIELDS ---------- */
const textAreas = [
  { name: 'activityTarget', label: 'Activity / Target' },
  { name: 'problem', label: 'Problem Faced' },
  { name: 'leaveReason', label: 'Leave Reason (if applicable)' },
]

function OnboardingForm() {
  const { token, user } = useAuth()
  const [formData, setFormData] = useState(defaultPayload())
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState(null)
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10))
  const [viewMode, setViewMode] = useState('form') // 'form' or 'view'

  const endpoint = useMemo(
    () => import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api',
    []
  )

  /* ---------- FETCH ACTIVITIES ---------- */
  const fetchActivities = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${endpoint}/activities?date=${filterDate}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (res.ok) {
        const data = await res.json()
        setActivities(data.activities || [])
      }
    } catch (err) {
      console.error('Failed to fetch activities:', err)
    } finally {
      setLoading(false)
    }
  }

  /* ---------- LOAD ACTIVITIES ON MOUNT & DATE CHANGE ---------- */
  useEffect(() => {
    fetchActivities()
  }, [filterDate, token])

  /* ---------- HANDLE INPUT CHANGES ---------- */
  const handleChange = (e) => {
    const { name, value } = e.target

    setFormData((prev) => {
      // If status changes to 'present', clear leave reason
      if (name === 'status' && value !== 'leave') {
        return {
          ...prev,
          [name]: value,
          leaveReason: '',
        }
      }

      // If status is 'leave', set default times
      if (name === 'status' && value === 'leave') {
        return {
          ...prev,
          [name]: value,
          startTime: '00:00:00',
          endTime: '00:00:00',
          activityTarget: 'leave',
        }
      }

      // If not leave, reset times if they were 00:00:00
      if (name === 'status' && value !== 'leave' && prev.startTime === '00:00:00') {
        const now = new Date()
        const time = now.toISOString().slice(11, 16)
        return {
          ...prev,
          [name]: value,
          startTime: `${time}:00`,
          endTime: `${time}:00`,
          activityTarget: '',
        }
      }

      return { ...prev, [name]: value }
    })
  }

  /* ---------- HANDLE STATUS CHANGE ---------- */
  const handleStatusChange = (status) => {
    setFormData((prev) => {
      const newData = { ...prev, status }

      if (status === 'leave') {
        newData.startTime = '00:00:00'
        newData.endTime = '00:00:00'
        newData.activityTarget = 'leave'
        newData.location = 'N/A'
        newData.project = 'N/A'
      } else {
        const now = new Date()
        const time = now.toISOString().slice(11, 16)
        newData.startTime = `${time}:00`
        newData.endTime = `${time}:00`
        if (prev.activityTarget === 'leave') newData.activityTarget = ''
        if (prev.location === 'N/A') newData.location = ''
        if (prev.project === 'N/A') newData.project = ''
      }

      return newData
    })
  }

  /* ---------- SUBMIT ACTIVITY ---------- */
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setAlert(null)

    try {
      const payload = {
        ...formData,
        engineerName: user?.name || formData.engineerName,
        loggedAt: new Date().toISOString(),
      }

      const res = await fetch(`${endpoint}/activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Unable to save activity')

      setAlert({ type: 'success', message: 'Activity logged successfully!' })
      setFormData(defaultPayload())
      fetchActivities() // Refresh the list
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  /* ---------- FORMAT TIME DISPLAY ---------- */
  const formatTimeRange = (start, end) => {
    if (!start || !end) return ''
    const startShort = start.slice(0, 8)
    const endShort = end.slice(0, 8)
    return `${startShort} - ${endShort}`
  }

  return (
    <section className="vh-form-shell">
      {/* HEADER WITH ROLE DISPLAY */}
      <header className="vh-form-header">
        <div className="vh-user-info">
          <h2>Employee Activity Log</h2>
          {user && (
            <div className="vh-user-role">
              <span>Logged in as: <strong>{user.name}</strong></span>
              <span className="role-badge">{user.role}</span>
            </div>
          )}
        </div>
        <p>Monitor and log daily activities</p>
      </header>

      {/* VIEW MODE TOGGLE */}
      <div className="vh-view-toggle">
        <button
          type="button"
          className={viewMode === 'form' ? 'active' : ''}
          onClick={() => setViewMode('form')}
        >
          Log Activity
        </button>
        <button
          type="button"
          className={viewMode === 'view' ? 'active' : ''}
          onClick={() => setViewMode('view')}
        >
          View Activities
        </button>
      </div>

      {alert && (
        <div className={`vh-alert ${alert.type}`}>
          {alert.message}
        </div>
      )}

      {/* ACTIVITY FORM */}
      {viewMode === 'form' && (
        <form className="vh-form" onSubmit={handleSubmit}>
          <div className="vh-form-info">
            <p><strong>Date:</strong> {formData.date}</p>
            <p><strong>Time:</strong> {formData.time}</p>
            {user && <p><strong>Engineer:</strong> {user.name} ({user.role})</p>}
          </div>

          <div className="vh-grid">
            {/* STATUS SELECTION */}
            <div className="vh-status-buttons vh-span-2">
              <label>Status:</label>
              <div className="status-options">
                {['present', 'leave', 'absent'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`status-btn ${formData.status === status ? 'active' : ''} ${status}`}
                    onClick={() => handleStatusChange(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* ENGINEER NAME (if not logged in) */}
            {!user && (
              <label className="vh-span-2">
                <span>Engineer Name</span>
                <input
                  type="text"
                  name="engineerName"
                  value={formData.engineerName}
                  onChange={handleChange}
                  required
                />
              </label>
            )}

            {/* PROJECT & LOCATION */}
            <label>
              <span>Project</span>
              <input
                type="text"
                name="project"
                value={formData.project}
                onChange={handleChange}
                disabled={formData.status === 'leave'}
                required={formData.status !== 'leave'}
              />
            </label>

            <label>
              <span>Location</span>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                disabled={formData.status === 'leave'}
                required={formData.status !== 'leave'}
              />
            </label>

            {/* TIME RANGE */}
            <label>
              <span>Start Time</span>
              <input
                type="time"
                name="startTime"
                value={formData.startTime.slice(0, 5)}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  startTime: `${e.target.value}:00`
                }))}
                disabled={formData.status === 'leave'}
                required={formData.status !== 'leave'}
                step="1"
              />
            </label>

            <label>
              <span>End Time</span>
              <input
                type="time"
                name="endTime"
                value={formData.endTime.slice(0, 5)}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  endTime: `${e.target.value}:00`
                }))}
                disabled={formData.status === 'leave'}
                required={formData.status !== 'leave'}
                step="1"
              />
            </label>

            {/* ACTIVITY TYPE */}
            <label>
              <span>Activity Type</span>
              <select
                name="activityType"
                value={formData.activityType}
                onChange={handleChange}
                disabled={formData.status === 'leave'}
              >
                <option value="">Select activity type</option>
                {activityTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* TEXT AREAS */}
          {textAreas.map((field) => (
            <label key={field.name} className="vh-span-2">
              <span>{field.label}</span>
              <textarea
                name={field.name}
                value={formData[field.name]}
                onChange={handleChange}
                rows={3}
                disabled={field.name === 'leaveReason' && formData.status !== 'leave'}
              />
            </label>
          ))}

          <div className="vh-form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Submit Activity'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setFormData(defaultPayload())}
              disabled={submitting}
            >
              Reset
            </button>
          </div>
        </form>
      )}

      {/* ACTIVITIES VIEW */}
      {viewMode === 'view' && (
        <div className="vh-activities-view">
          <div className="vh-view-controls">
            <label>
              <span>Filter by Date:</span>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </label>
            <button onClick={fetchActivities} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="vh-stats">
            <div className="stat-card">
              <h3>Total Activities</h3>
              <p>{activities.length}</p>
            </div>
            <div className="stat-card">
              <h3>Active Employees</h3>
              <p>{new Set(activities.filter(a => a.status === 'present').map(a => a.engineerName)).size}</p>
            </div>
            <div className="stat-card">
              <h3>On Leave</h3>
              <p>{activities.filter(a => a.status === 'leave').length}</p>
            </div>
          </div>

          {loading ? (
            <p>Loading activities...</p>
          ) : activities.length === 0 ? (
            <p className="vh-no-data">No activities found for {filterDate}</p>
          ) : (
            <>
              {/* ABSENTEES SECTION */}
              {activities.filter(a => a.status === 'absent').length > 0 && (
                <div className="vh-absentees">
                  <h3>Absentees</h3>
                  <ul>
                    {activities
                      .filter(a => a.status === 'absent')
                      .map((activity, idx) => (
                        <li key={idx}>
                          {activity.engineerName} - {activity.problem || 'No reason provided'}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {/* ACTIVITIES TABLE */}
              <div className="vh-activities-table">
                <h3>Daily Activities - {filterDate}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Engineer</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Project</th>
                      <th>Location</th>
                      <th>Activity / Target</th>
                      <th>Problem</th>
                      <th>Logged At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .map((activity, idx) => (
                        <tr key={idx} className={`status-${activity.status}`}>
                          <td>{activity.engineerName}</td>
                          <td>{activity.date}</td>
                          <td>{formatTimeRange(activity.startTime, activity.endTime)}</td>
                          <td>{activity.project}</td>
                          <td>{activity.location}</td>
                          <td>{activity.activityTarget}</td>
                          <td>{activity.problem}</td>
                          <td>{new Date(activity.loggedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default OnboardingForm
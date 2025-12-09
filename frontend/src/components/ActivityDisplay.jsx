import { useState, useEffect, useMemo } from 'react'
import { useAuth } from './AuthContext'
import './OnboardingForm.css'

export default function ActivityDisplay() {
  const { token, user } = useAuth()
  const [activities, setActivities] = useState([])
  const [summary, setSummary] = useState(null)
  const [subordinates, setSubordinates] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState('table') // 'cards' or 'table'
  const [absentees, setAbsentees] = useState([])
  const [myAbsent, setMyAbsent] = useState(null)

  const endpoint = useMemo(
    () => import.meta.env.VITE_API_URL?.replace('/api/activity', '/api/employee-activity') ?? 'http://localhost:5000/api/employee-activity',
    []
  )

  useEffect(() => {
    if (!user || !token) return
    fetchActivities()
    fetchSummary()
    fetchAbsentees()

    if (user.role && user.role.toLowerCase().includes('senior')) {
      fetchSubordinates()
    }

    if (user.role && user.role.toLowerCase().includes('group')) {
      fetchEmployees()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, user, token])

  const fetchAbsentees = async () => {
    try {
      if (!token) return
      const date = new Date().toISOString().slice(0, 10)
      const res = await fetch(`${endpoint}/absentees?date=${date}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      // Manager-like response: { date, absentees: [...] }
      if (data.absentees) {
        setAbsentees(data.absentees || [])
        setMyAbsent(null)
      } else if (typeof data.absent !== 'undefined') {
        setMyAbsent(Boolean(data.absent))
        setAbsentees([])
      }
    } catch (err) {
      console.error('Failed to fetch absentees', err)
    }
  }

  const fetchActivities = async () => {
    try {
      setLoading(true)
      setError(null)
      if (!token) return

      const url = `${endpoint}/activities?page=${page}&limit=10`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setActivities(data.activities || [])
    } catch (err) {
      console.error('Error fetching activities:', err)
      setError(err.message || 'Failed to load activities')
    } finally {
      setLoading(false)
    }
  }

  const fetchSummary = async () => {
    try {
      if (!token) return
      const res = await fetch(`${endpoint}/summary`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      setSummary(data.summary || null)
    } catch (err) {
      console.error('Failed to fetch summary', err)
    }
  }

  const fetchSubordinates = async () => {
    try {
      if (!token) return
      const res = await fetch(`${endpoint}/subordinates`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      setSubordinates(data.subordinates || [])
    } catch (err) {
      console.error('Failed to fetch subordinates', err)
    }
  }

  const fetchEmployees = async () => {
    try {
      if (!token) return
      const res = await fetch(`${endpoint}/employees`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      setEmployees(data.employees || [])
    } catch (err) {
      console.error('Failed to fetch employees', err)
    }
  }

  const formatDate = (d) => {
    if (!d) return 'N/A'
    try {
      return new Date(d).toLocaleDateString('en-IN')
    } catch {
      return d
    }
  }

  if (!user) {
    return (
      <section className="vh-form-shell">
        <div className="vh-alert error">
          <p>Please log in to view activities</p>
        </div>
      </section>
    )
  }

  return (
    <section className="vh-form-shell">
      <header className="vh-form-header">
        <div>
          <p className="vh-form-label">Activity Display</p>
          <h2>
            {user?.role === 'Manager' || user?.role === 'Team Leader' ? 'Monitor All Employee Activities' : 'Your Activities'}
          </h2>
          {summary && (
            <p>
              <strong>Total Activities:</strong> {summary.totalActivities}
              {(user?.role === 'Manager' || user?.role === 'Team Leader') && summary.activeEmployees && (
                <span style={{ marginLeft: '1rem' }}>
                  <strong>Active Employees:</strong> {summary.activeEmployees}
                </span>
              )}
            </p>
          )}

          <div style={{ marginTop: '0.5rem' }}>
            <button
              onClick={() => setViewMode('table')}
              style={{ padding: '0.4rem 0.6rem', background: viewMode === 'table' ? '#2ad1ff' : '#eee', color: viewMode === 'table' ? '#fff' : '#333', border: 'none', borderRadius: '6px' }}
            >
              Table View
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="vh-alert error" style={{ marginBottom: '1rem' }}>
          <p>⚠️ {error}</p>
        </div>
      )}

      {user?.role && user.role.toLowerCase().includes('senior') && subordinates.length > 0 && (
        <div style={{ background: '#f0f9ff', border: '1px solid #2ad1ff', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#092544' }}>Your Team (Junior Assistants)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {subordinates.map((emp) => (
              <div key={emp.id} style={{ background: 'white', border: '1px solid #d5e0f2', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', color: '#092544' }}>{emp.username}</p>
                <p style={{ margin: '0', fontSize: '0.85rem', color: '#666' }}>{emp.role}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {user?.role && user.role.toLowerCase().includes('group') && employees.length > 0 && (
        <div style={{ background: '#f9f0ff', border: '1px solid #d084d0', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#6b2d5f' }}>Organization Structure</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {employees.map((emp) => (
              <div key={emp.id} style={{ background: 'white', border: `2px solid ${emp.role === 'Senior Assistant' ? '#ff9800' : emp.role === 'Junior Assistant' ? '#2196f3' : '#4caf50'}`, borderRadius: '8px', padding: '0.75rem' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', color: '#092544' }}>{emp.username}</p>
                <p style={{ margin: '0', fontSize: '0.85rem', color: '#666' }}>{emp.role}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ color: '#092544', marginBottom: '1rem' }}>Activities</h3>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#666' }}>⏳ Loading activities...</p>
        ) : activities.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999' }}>No activities found. Activities will appear once daily/hourly reports are submitted.</p>
        ) : (
          <>
            {/* Table mode: show separate Daily and Hourly tables, plus absentees when available */}
            <div style={{ marginBottom: '1rem' }}>
              {absentees && absentees.length > 0 && (
                <div style={{ background: '#fff4f4', border: '1px solid #ffb4b4', padding: '0.75rem', borderRadius: '8px', marginBottom: '0.75rem' }}>
                  <strong>Absentees ({absentees.length}):</strong>
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {absentees.map((a) => (
                      <span key={a.id} style={{ padding: '0.25rem 0.5rem', background: '#fff', border: '1px solid #ffdede', borderRadius: '6px' }}>{a.username} <small style={{ color: '#666', marginLeft: '0.25rem' }}>{a.role}</small></span>
                    ))}
                  </div>
                </div>
              )}

              {myAbsent !== null && (
                <div style={{ background: myAbsent ? '#fff4f4' : '#f4fff6', border: myAbsent ? '1px solid #ffb4b4' : '1px solid #bdecbc', padding: '0.5rem', borderRadius: '6px', marginBottom: '0.5rem' }}>
                  {myAbsent ? <strong>You have not submitted today's daily target (Absent)</strong> : <strong>You have submitted today's daily target</strong>}
                </div>
              )}
            </div>

            {/* Daily Reports Table */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Daily Reports</h4>
              <div style={{ overflowX: 'auto', marginBottom: '0.75rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
                  <thead>
                    <tr style={{ background: '#f3f6f9' }}>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Engineer</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Date</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Time</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Project</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Location</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Activity / Target</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Problem</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Logged At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.filter(a => a.reportType === 'daily').map((a) => (
                      <tr key={`daily-${a.id}`}>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{a.username || 'N/A'}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{formatDate(a.reportDate)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{(a.inTime || '') + (a.outTime ? ` - ${a.outTime}` : '')}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{a.projectNo || 'N/A'}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{a.locationType || '-'}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{String(a.dailyTargetAchieved || '').substring(0,120)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{String(a.problemFaced || '').substring(0,120)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{formatDate(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hourly Reports Table */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Hourly Reports</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
                  <thead>
                    <tr style={{ background: '#f3f6f9' }}>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Engineer</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Date</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Activity</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Project</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Problem</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #e8eef4' }}>Logged At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.filter(a => a.reportType === 'hourly').map((a) => (
                      <tr key={`hourly-${a.id}`}>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{a.username || 'N/A'}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{formatDate(a.reportDate)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{String(a.dailyTargetAchieved || '').substring(0,120)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{a.projectNo || 'N/A'}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{String(a.problemFaced || '').substring(0,120)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #eef3f7' }}>{formatDate(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff' }}>Prev</button>
              <button onClick={() => setPage((p) => p + 1)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff' }}>Next</button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

import { useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import './OnboardingForm.css'

export default function ActivityDisplay() {
  const { token, user } = useAuth()
  const [activities, setActivities] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [absentees, setAbsentees] = useState([])
  const [presentEmployees, setPresentEmployees] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)

  const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  // Fetch all users once when component mounts
  useEffect(() => {
    if (token && user) {
      fetchAllUsers()
    }
  }, [token, user])

  // Fetch activities and attendance when users are loaded or page changes
  useEffect(() => {
    if (token && user && allUsers.length > 0) {
      fetchActivities()
      fetchAttendanceData()
      fetchSummary()
    }
  }, [token, user, page, allUsers])

  // Fetch ALL users from the system (for mapping IDs to names)
  const fetchAllUsers = async () => {
    try {
      setIsLoadingUsers(true)
      console.log('🔄 Fetching all users...')
      
      // Try different endpoints to get users
      const endpoints = [
        `${BASE_URL}/api/auth/users`,
        `${BASE_URL}/api/auth/employees`,
        `${BASE_URL}/api/activity/employees`
      ]
      
      let usersData = []
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`)
          const res = await fetch(endpoint, {
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (res.ok) {
            const data = await res.json()
            console.log(`✅ Got response from ${endpoint}:`, data)
            
            // Handle different response formats
            if (Array.isArray(data)) {
              usersData = data
            } else if (data.users && Array.isArray(data.users)) {
              usersData = data.users
            } else if (data.employees && Array.isArray(data.employees)) {
              usersData = data.employees
            } else if (typeof data === 'object') {
              // If it's a single object, put it in an array
              usersData = [data]
            }
            
            if (usersData.length > 0) {
              console.log(`✅ Found ${usersData.length} users from ${endpoint}`)
              break
            }
          }
        } catch (err) {
          console.log(`❌ Endpoint ${endpoint} failed:`, err.message)
        }
      }
      
      // If no users found from endpoints, create a basic list
      if (usersData.length === 0) {
        console.log('⚠️ No users found from endpoints, creating basic list')
        usersData = [
          {
            id: user.id,
            username: user.username,
            employee_id: user.employeeId,
            role: user.role,
            phone: user.phone
          }
        ]
      }
      
      // Transform users to a consistent format
      const formattedUsers = usersData.map(u => ({
        id: u.id || u.userId,
        username: u.username || u.name || `User ${u.id}`,
        employee_id: u.employee_id || u.employeeId || u.emp_id,
        role: u.role || 'Unknown',
        phone: u.phone || u.phone_number,
        dob: u.dob || u.date_of_birth
      }))
      
      console.log('👥 Final formatted users:', formattedUsers)
      setAllUsers(formattedUsers)
      
    } catch (err) {
      console.error('❌ Error fetching all users:', err)
    } finally {
      setIsLoadingUsers(false)
    }
  }

  // Fetch today's attendance data
  const fetchAttendanceData = async () => {
    try {
      if (!token) return
      
      const today = new Date().toISOString().split('T')[0]
      console.log('📊 Fetching attendance for date:', today)
      
      const res = await fetch(`${BASE_URL}/api/auth/attendance/daily?date=${today}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (res.ok) {
        const data = await res.json()
        console.log('📊 Attendance data received:', data)
        
        if (data.attendance && Array.isArray(data.attendance)) {
          // Process each attendance record
          const processedAttendance = data.attendance.map(att => {
            // Find user info for this attendance record
            const userInfo = findUserInfo(att.username, att.employeeId, att.engineer_id)
            
            return {
              ...att,
              username: userInfo?.username || att.username || 'Unknown',
              employeeId: userInfo?.employee_id || att.employeeId || att.engineer_id,
              role: userInfo?.role || att.role || 'Unknown',
              status: att.status || 'unknown'
            }
          })
          
          // Separate into absent and present
          const absent = processedAttendance.filter(emp => emp.status === 'absent')
          const present = processedAttendance.filter(emp => emp.status === 'present' || emp.status === 'leave')
          
          console.log('✅ Processed absentees:', absent)
          console.log('✅ Processed present employees:', present)
          
          setAbsentees(absent)
          setPresentEmployees(present)
        }
      } else {
        console.error('❌ Attendance endpoint failed:', res.status)
      }
    } catch (err) {
      console.error('❌ Error fetching attendance:', err)
    }
  }

  // Fetch activities
  const fetchActivities = async () => {
    try {
      setLoading(true)
      setError(null)
      if (!token) return

      const url = `${BASE_URL}/api/activity/activities?page=${page}&limit=10`
      console.log('📡 Fetching activities from:', url)
      
      const res = await fetch(url, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      console.log('📡 Activities response status:', res.status)
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error('❌ Activities error:', errorText)
        throw new Error(`Failed to load activities: ${res.status}`)
      }

      const data = await res.json()
      console.log('📡 Raw activities data:', data)
      
      // Process activities to include proper usernames and roles
      const processedActivities = (data.activities || []).map(activity => {
        // Find user info for this activity
        const userInfo = findUserInfo(
          activity.username, 
          activity.engineerId, 
          activity.engineer_id,
          activity.userId
        )
        
        return {
          ...activity,
          username: userInfo?.username || activity.username || `Employee ${activity.engineerId || 'Unknown'}`,
          engineerId: userInfo?.employee_id || activity.engineerId || activity.engineer_id,
          role: userInfo?.role || activity.role || 'Unknown'
        }
      })
      
      console.log('✅ Processed activities:', processedActivities)
      setActivities(processedActivities)
      
    } catch (err) {
      console.error('❌ Error fetching activities:', err)
      setError(err.message || 'Failed to load activities')
    } finally {
      setLoading(false)
    }
  }

  // Fetch summary
  const fetchSummary = async () => {
    try {
      if (!token) return
      const res = await fetch(`${BASE_URL}/api/activity/summary`, { 
        headers: { Authorization: `Bearer ${token}` } 
      })
      if (!res.ok) return
      const data = await res.json()
      setSummary(data.summary || null)
    } catch (err) {
      console.error('Failed to fetch summary', err)
    }
  }

  // Helper function to find user info from various identifiers
  const findUserInfo = (username, employeeId, engineer_id, userId) => {
    if (!allUsers.length) return null
    
    // Try different matching strategies
    const foundUser = allUsers.find(u => {
      // Match by username
      if (username && u.username === username) return true
      
      // Match by employee ID
      if (employeeId && u.employee_id === employeeId) return true
      
      // Match by engineer_id
      if (engineer_id && u.employee_id === engineer_id) return true
      
      // Match by user ID
      if (userId && u.id == userId) return true
      
      // Match by numeric username (common issue)
      if (username && /^\d+$/.test(username) && u.id == username) return true
      
      return false
    })
    
    return foundUser || null
  }

  // Format date
  const formatDate = (d) => {
    if (!d) return 'N/A'
    try {
      return new Date(d).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    } catch {
      return d
    }
  }

  // Format time
  const formatTime = (t) => {
    if (!t || t === '--:--') return ''
    return t
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
          <p className="vh-form-label">Activity Dashboard</p>
          <h2>
            {user?.role === 'Manager' || user?.role === 'Team Leader' ? 'Monitor All Employee Activities' : 'Your Activities'}
          </h2>
          
          {isLoadingUsers && (
            <div style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
              ⏳ Loading user data...
            </div>
          )}
          
          {summary && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <div style={{ background: '#e8f4ff', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                <strong>Total Activities:</strong> {summary.totalActivities}
              </div>
              {(user?.role === 'Manager' || user?.role === 'Team Leader') && summary.activeEmployees && (
                <div style={{ background: '#e8f4ff', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                  <strong>Active Employees:</strong> {summary.activeEmployees}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="vh-alert error" style={{ marginBottom: '1rem' }}>
          <p>⚠️ {error}</p>
        </div>
      )}

      {/* Debug Panel */}
      <div style={{ 
        background: '#f8f9fa', 
        border: '1px solid #dee2e6', 
        borderRadius: '8px', 
        padding: '1rem', 
        marginBottom: '1.5rem',
        fontSize: '0.85rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <strong>📊 System Status</strong>
          <button 
            onClick={() => {
              fetchAllUsers()
              fetchActivities()
              fetchAttendanceData()
            }}
            style={{
              padding: '0.3rem 0.6rem',
              background: '#2ad1ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            Refresh All Data
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          <div>
            <div style={{ color: '#666' }}>Users Loaded</div>
            <div style={{ fontWeight: 'bold', color: allUsers.length > 0 ? '#28a745' : '#dc3545' }}>
              {allUsers.length}
            </div>
          </div>
          <div>
            <div style={{ color: '#666' }}>Present Today</div>
            <div style={{ fontWeight: 'bold', color: '#28a745' }}>
              {presentEmployees.length}
            </div>
          </div>
          <div>
            <div style={{ color: '#666' }}>Absent Today</div>
            <div style={{ fontWeight: 'bold', color: '#dc3545' }}>
              {absentees.length}
            </div>
          </div>
        </div>
      </div>

      {/* Today's Attendance */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ color: '#092544', marginBottom: '1rem' }}>
          Today's Attendance ({formatDate(new Date())})
        </h3>
        
        {/* Present Employees */}
        {presentEmployees.length > 0 && (
          <div style={{ background: '#f0f9ff', border: '1px solid #b3e0ff', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', color: '#0066cc' }}>
              ✅ Present Today ({presentEmployees.length})
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {presentEmployees.map((emp, index) => (
                <div
                  key={index}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#ffffff',
                    border: '1px solid #b3e0ff',
                    borderRadius: '8px',
                    minWidth: '160px'
                  }}
                >
                  <div style={{ fontWeight: 'bold', color: '#092544', marginBottom: '0.25rem' }}>
                    {emp.username}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: emp.status === 'leave' ? '#ff9800' : '#4CAF50', marginBottom: '0.25rem' }}>
                    {emp.status === 'leave' ? 'On Leave' : 'Present'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>
                    {emp.role} • {emp.employeeId || 'No ID'}
                  </div>
                  {emp.inTime && emp.inTime !== '--:--' && (
                    <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                      {formatTime(emp.inTime)} {emp.outTime && emp.outTime !== '--:--' ? `- ${formatTime(emp.outTime)}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Absent Employees */}
        {absentees.length > 0 && (
          <div style={{ background: '#fff4f4', border: '1px solid #ffb4b4', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', color: '#d32f2f' }}>
              ❌ Absent Today ({absentees.length})
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {absentees.map((emp, index) => (
                <div
                  key={index}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#ffffff',
                    border: '1px solid #ffb4b4',
                    borderRadius: '8px',
                    minWidth: '160px'
                  }}
                >
                  <div style={{ fontWeight: 'bold', color: '#092544', marginBottom: '0.25rem' }}>
                    {emp.username}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#F44336', marginBottom: '0.25rem' }}>
                    Absent
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>
                    {emp.role} • {emp.employeeId || 'No ID'}
                  </div>
                  {emp.remarks && (
                    <div style={{ fontSize: '0.75rem', color: '#666', fontStyle: 'italic', marginTop: '0.25rem' }}>
                      {emp.remarks}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Attendance Data Message */}
        {presentEmployees.length === 0 && absentees.length === 0 && (
          <div style={{ 
            background: '#f9f9f9', 
            border: '1px dashed #ccc', 
            borderRadius: '8px', 
            padding: '1.5rem',
            textAlign: 'center',
            color: '#666'
          }}>
            <p style={{ margin: '0 0 0.5rem 0' }}>
              <strong>No attendance data available for today.</strong>
            </p>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              Attendance data will appear once employees submit their reports.
            </p>
          </div>
        )}
      </div>

      {/* Activities Section */}
      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ color: '#092544', marginBottom: '1rem' }}>Recent Activities</h3>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            ⏳ Loading activities...
          </div>
        ) : activities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#999', background: '#f9f9f9', borderRadius: '8px' }}>
            No activities found. Activities will appear once daily/hourly reports are submitted.
          </div>
        ) : (
          <>
            {/* Daily Reports */}
            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#092544', paddingBottom: '0.5rem', borderBottom: '2px solid #e8eef4' }}>
                Daily Reports
              </h4>
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e8eef4' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
                  <thead>
                    <tr style={{ background: '#f3f6f9' }}>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Engineer</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Role</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Time</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Project</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities
                      .filter(a => a.reportType === 'daily')
                      .map((activity, index) => (
                        <tr key={`daily-${activity.id || index}`}>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7', fontWeight: 'bold', color: '#092544' }}>
                            {activity.username}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7', color: activity.role === 'Unknown' ? '#999' : '#666' }}>
                            {activity.role}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            {formatDate(activity.reportDate)}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            {formatTime(activity.inTime)} {activity.outTime ? `- ${formatTime(activity.outTime)}` : ''}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            {activity.projectNo || 'N/A'}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            {String(activity.dailyTargetAchieved || activity.problemFaced || '').substring(0, 80)}...
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hourly Reports */}
            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#092544', paddingBottom: '0.5rem', borderBottom: '2px solid #e8eef4' }}>
                Hourly Reports
              </h4>
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e8eef4' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
                  <thead>
                    <tr style={{ background: '#f3f6f9' }}>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Engineer</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Role</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Activity</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities
                      .filter(a => a.reportType === 'hourly')
                      .map((activity, index) => (
                        <tr key={`hourly-${activity.id || index}`}>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7', fontWeight: 'bold', color: '#092544' }}>
                            {activity.username}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7', color: activity.role === 'Unknown' ? '#999' : '#666' }}>
                            {activity.role}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            {formatDate(activity.reportDate)}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            {String(activity.dailyTargetAchieved || activity.problemFaced || '').substring(0, 80)}...
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            {activity.projectNo || 'N/A'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0',
                  background: page === 1 ? '#f5f5f5' : '#fff',
                  color: page === 1 ? '#999' : '#333',
                  cursor: page === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                ← Previous
              </button>
              <span style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center' }}>
                Page {page}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0',
                  background: '#fff',
                  cursor: 'pointer'
                }}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
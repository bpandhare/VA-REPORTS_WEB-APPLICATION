import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from './AuthContext'
import './OnboardingForm.css'

export default function ActivityDisplay() {
  const { token, user } = useAuth()
  
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [dateSummary, setDateSummary] = useState(null)
  const [attendanceData, setAttendanceData] = useState(null)
  const [availableDates, setAvailableDates] = useState([])
  const [selectedEngineer, setSelectedEngineer] = useState(null)
  const [engineerModalOpen, setEngineerModalOpen] = useState(false)
  const [engineerLoading, setEngineerLoading] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  
  const hasFetchedInitial = useRef(false)
  
  // Get base URL from environment
  const API_BASE = useMemo(() => {
    const envUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    return envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl
  }, [])

  // Define endpoints
  const endpoints = useMemo(() => ({
    activities: `${API_BASE}/api/activity/activities`,
    stats: `${API_BASE}/api/activity/stats`,
    dateSummary: `${API_BASE}/api/activity/date-summary`,
    availableDates: `${API_BASE}/api/activity/available-dates`,
    attendance: `${API_BASE}/api/activity/attendance`,
    attendanceRange: `${API_BASE}/api/activity/attendance/range`,
    engineer: `${API_BASE}/api/activity/engineer`,
    profile: `${API_BASE}/api/auth/profile`,
    currentUser: `${API_BASE}/api/daily-target/current-user`,
    employees: `${API_BASE}/api/daily-target/employees`,
  }), [API_BASE])

  // Debug endpoints
  useEffect(() => {
    console.log('🔧 API Endpoints:', endpoints)
  }, [endpoints])

  // Check if user is manager or team leader
  const isManagerOrTeamLeader = useMemo(() => {
    return user?.role === 'Manager' || user?.role === 'Team Leader'
  }, [user])

  // Initial data fetch
  useEffect(() => {
    if (!user || !token) return;
    
    console.log('🚀 Fetching data...', { user: user?.username, refreshTrigger })
    
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        if (isManagerOrTeamLeader) {
          await Promise.all([
            fetchAvailableDates(),
            fetchDateSummary(selectedDate),
            fetchAttendanceData(selectedDate)
          ])
        } else {
          // For regular employees, only fetch their own data
          await fetchDateSummary(selectedDate)
        }
      } catch (err) {
        console.error('❌ Initial load failed:', err)
        setError('Failed to load initial data. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
  }, [user, token, selectedDate, refreshTrigger, isManagerOrTeamLeader])

  // Function to trigger refresh
  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  // Fetch date summary
  const fetchDateSummary = async (date) => {
    if (!token) return;
    
    try {
      console.log(`📅 Fetching date summary for: ${date}`)
      
      const response = await fetch(`${endpoints.dateSummary}?date=${date}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Date summary error:', errorText)
        
        if (response.status === 404) {
          console.log(`📭 No date summary found for ${date}`)
          setDateSummary(null)
          return
        }
        throw new Error(`Server error: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.success === false) {
        console.warn(`⚠️ API error: ${data.message}`)
        setDateSummary(null)
      } else {
        // Filter data based on user role
        const filteredData = filterDataByUserRole(data)
        setDateSummary(filteredData)
        console.log(`✅ Date summary fetched for ${date}`)
      }
    } catch (err) {
      console.error('❌ Error fetching date summary:', err)
      setDateSummary(null)
    }
  }

  // Filter data based on user role
  const filterDataByUserRole = (data) => {
    if (isManagerOrTeamLeader) {
      return data // Managers see all data
    }
    
    // Regular employees only see their own data
    const userIdentifier = user?.username || user?.employeeId || user?.email
    
    const filteredData = {
      ...data,
      dailyReports: data.dailyReports?.filter(report => 
        report.engineerId === userIdentifier || 
        report.engineerName === user?.name ||
        report.engineerEmail === user?.email
      ) || [],
      hourlyReports: data.hourlyReports?.filter(report => 
        report.engineerId === userIdentifier || 
        report.engineerName === user?.name ||
        report.engineerEmail === user?.email
      ) || [],
      summary: {
        ...data.summary,
        // Update counts based on filtered data
        totalActivities: (data.dailyReports?.filter(report => 
          report.engineerId === userIdentifier || 
          report.engineerName === user?.name ||
          report.engineerEmail === user?.email
        )?.length || 0) + 
        (data.hourlyReports?.filter(report => 
          report.engineerId === userIdentifier || 
          report.engineerName === user?.name ||
          report.engineerEmail === user?.email
        )?.length || 0)
      }
    }
    
    return filteredData
  }

  // Fetch attendance data (only for managers/team leaders)
  const fetchAttendanceData = async (date) => {
    if (!token || !isManagerOrTeamLeader) return;
    
    try {
      console.log(`👥 Fetching attendance for: ${date}`)
      
      const response = await fetch(`${endpoints.attendance}?date=${date}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Attendance error:', errorText)
        
        if (response.status === 404) {
          console.log(`📭 No attendance data found for ${date}`)
          setAttendanceData(null)
          return
        }
        throw new Error(`Server error: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.success === false) {
        console.warn(`⚠️ API error: ${data.message}`)
        setAttendanceData(null)
      } else {
        setAttendanceData(data)
        console.log(`✅ Attendance data fetched for ${date}`)
      }
    } catch (err) {
      console.error('❌ Error fetching attendance:', err)
      setAttendanceData(null)
    }
  }

  // Fetch available dates (only for managers/team leaders)
  const fetchAvailableDates = async () => {
    if (!token || !isManagerOrTeamLeader) return;
    
    try {
      console.log(`📅 Fetching available dates`)
      
      const response = await fetch(endpoints.availableDates, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setAvailableDates(data.dates || [])
      } else {
        console.warn(`⚠️ Failed to fetch available dates: ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to fetch available dates:', error)
    }
  }

  // Handle date change
  const handleDateChange = (date) => {
    console.log(`📅 Date changed to: ${date}`)
    setSelectedDate(date)
    setLoading(true)
    
    const fetchPromises = [fetchDateSummary(date)]
    if (isManagerOrTeamLeader) {
      fetchPromises.push(fetchAttendanceData(date))
    }
    
    Promise.all(fetchPromises).finally(() => {
      setLoading(false)
    })
  }

  // Handle refresh
  const handleRefresh = () => {
    console.log('🔄 Refreshing all data...')
    setLoading(true)
    
    setActivities([])
    setDateSummary(null)
    setAttendanceData(null)
    
    triggerRefresh()
  }

  // Handle engineer click (only for managers/team leaders)
  const handleEngineerClick = async (identifier, engineerName) => {
    if (!isManagerOrTeamLeader) return;
    
    try {
      setEngineerLoading(true)
      const url = `${endpoints.engineer}/${encodeURIComponent(identifier)}`
      console.log('Fetching engineer info:', url)
      const res = await fetch(url, { 
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        } 
      })
      
      if (!res.ok) {
        console.error('Engineer fetch failed:', res.status)
        
        // Fallback to basic engineer info
        setSelectedEngineer({
          username: engineerName,
          name: engineerName,
          employeeId: identifier,
          role: 'Engineer',
          recentActivity: []
        })
        setEngineerModalOpen(true)
        return
      }
      
      const data = await res.json()
      setSelectedEngineer({ 
        ...data.user, 
        recentActivity: data.recentActivity || [] 
      })
      setEngineerModalOpen(true)
    } catch (e) {
      console.error('Failed to fetch engineer:', e)
      
      // Fallback to basic info
      setSelectedEngineer({
        username: engineerName,
        name: engineerName,
        employeeId: identifier,
        role: 'Engineer',
        recentActivity: []
      })
      setEngineerModalOpen(true)
    } finally {
      setEngineerLoading(false)
    }
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
    if (!t) return ''
    if (t.includes(':')) {
      const parts = t.split(':')
      if (parts.length >= 2) {
        return `${parts[0]}:${parts[1]}`
      }
    }
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
    <>
      <section className="vh-form-shell">
        <header className="vh-form-header">
          <div>
            <p className="vh-form-label">Activity Dashboard</p>
            <h2>
              {isManagerOrTeamLeader 
                ? 'Monitor All Employee Activities' 
                : 'Your Activities Dashboard'}
            </h2>
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginTop: '0.5rem',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div style={{ 
                display: 'flex', 
                gap: '1rem', 
                flexWrap: 'wrap',
                alignItems: 'center'
              }}>
                <div style={{ 
                  background: '#e8f4ff', 
                  padding: '0.5rem 1rem', 
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span>📅</span>
                  <span><strong>Selected Date:</strong> {formatDate(selectedDate)}</span>
                </div>
                {dateSummary && (
                  <div style={{ 
                    background: '#e8f4ff', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span>📊</span>
                    <span><strong>Activities:</strong> {dateSummary.summary?.totalActivities || 0}</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleRefresh}
                disabled={loading}
                style={{
                  padding: '0.5rem 1rem',
                  background: loading ? '#ccc' : '#2ad1ff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.9rem'
                }}
              >
                {loading ? '🔄 Loading...' : '↻ Refresh'}
              </button>
            </div>
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="vh-alert error" style={{ marginBottom: '1rem' }}>
            <p>⚠️ {error}</p>
            <button 
              onClick={() => setError(null)}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: 'inherit', 
                marginLeft: '1rem',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Main Content */}
        <div style={{ 
          marginBottom: '2rem', 
          background: 'white', 
          borderRadius: '12px', 
          padding: '1.5rem', 
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ color: '#092544', margin: 0 }}>Select Date</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  const yesterday = new Date(selectedDate)
                  yesterday.setDate(yesterday.getDate() - 1)
                  handleDateChange(yesterday.toISOString().split('T')[0])
                }}
                style={{
                  padding: '0.5rem',
                  background: '#f0f0f0',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                ← Yesterday
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '1rem'
                }}
              />
              <button
                onClick={() => {
                  const tomorrow = new Date(selectedDate)
                  tomorrow.setDate(tomorrow.getDate() + 1)
                  handleDateChange(tomorrow.toISOString().split('T')[0])
                }}
                style={{
                  padding: '0.5rem',
                  background: '#f0f0f0',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Tomorrow →
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div style={{ 
              textAlign: 'center', 
              padding: '3rem',
              color: '#666'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
              <p>Loading data for {formatDate(selectedDate)}...</p>
            </div>
          )}

          {/* Main Content (No Tabs) */}
          {!loading && (
            <div>
              {dateSummary ? (
                <div>
                  {/* Stats Cards */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginBottom: '2rem'
                  }}>
                    <div style={{ background: '#e8f4ff', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Total Activities</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#092544' }}>
                        {dateSummary.summary?.totalActivities || 0}
                      </div>
                    </div>
                    {isManagerOrTeamLeader && (
                      <>
                        <div style={{ background: '#e8f5e9', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Present</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4CAF50' }}>
                            {dateSummary.summary?.presentCount || 0}
                          </div>
                        </div>
                        <div style={{ background: '#ffebee', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Absent</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#F44336' }}>
                            {dateSummary.summary?.absentCount || 0}
                          </div>
                        </div>
                        <div style={{ background: '#fff3e0', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>On Leave</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#FF9800' }}>
                            {dateSummary.summary?.leaveCount || 0}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Daily Reports */}
                  {dateSummary.dailyReports && dateSummary.dailyReports.length > 0 && (
                    <div style={{ marginBottom: '2rem' }}>
                      <h4 style={{ color: '#092544', marginBottom: '1rem' }}>📅 Daily Reports</h4>
                      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e8eef4' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f3f6f9' }}>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Engineer</th>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Project</th>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Activity</th>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dateSummary.dailyReports.slice(0, 10).map((report, index) => (
                              <tr key={index}>
                                <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                                  <div 
                                    style={{ 
                                      fontWeight: 'bold', 
                                      cursor: isManagerOrTeamLeader ? 'pointer' : 'default', 
                                      color: isManagerOrTeamLeader ? '#1e40af' : 'inherit' 
                                    }}
                                    onClick={() => isManagerOrTeamLeader && handleEngineerClick(
                                      report.engineerId || report.engineerName,
                                      report.engineerName || 'Unknown'
                                    )}
                                  >
                                    {report.engineerName || 'Unknown'}
                                  </div>
                                  {isManagerOrTeamLeader && report.engineerId && <small style={{ color: '#666' }}>ID: {report.engineerId}</small>}
                                </td>
                                <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>{report.projectName || 'N/A'}</td>
                                <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                                  {report.activityTarget?.substring(0, 80) || 'No activity'}
                                </td>
                                <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                                  {report.startTime && report.endTime 
                                    ? `${formatTime(report.startTime)} - ${formatTime(report.endTime)}`
                                    : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Hourly Reports */}
                  {dateSummary.hourlyReports && dateSummary.hourlyReports.length > 0 && (
                    <div style={{ marginBottom: '2rem' }}>
                      <h4 style={{ color: '#092544', marginBottom: '1rem' }}>⏰ Hourly Reports</h4>
                      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e8eef4' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f3f6f9' }}>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Engineer</th>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Project</th>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Activity</th>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dateSummary.hourlyReports.slice(0, 10).map((report, index) => (
                              <tr key={index}>
                                <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                                  <div 
                                    style={{ 
                                      fontWeight: 'bold', 
                                      cursor: isManagerOrTeamLeader ? 'pointer' : 'default', 
                                      color: isManagerOrTeamLeader ? '#1e40af' : 'inherit' 
                                    }}
                                    onClick={() => isManagerOrTeamLeader && handleEngineerClick(
                                      report.engineerId || report.engineerName,
                                      report.engineerName || 'Unknown'
                                    )}
                                  >
                                    {report.engineerName || 'Unknown'}
                                  </div>
                                  {isManagerOrTeamLeader && report.engineerId && <small style={{ color: '#666' }}>ID: {report.engineerId}</small>}
                                </td>
                                <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>{report.projectName || 'N/A'}</td>
                                <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                                  {report.activityTarget?.substring(0, 80) || 'No activity'}
                                </td>
                                <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                                  {report.time ? formatTime(report.time) : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '3rem',
                  color: '#999'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📭</div>
                  <p>No data found for {formatDate(selectedDate)}</p>
                  <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Try selecting a different date or check if reports have been submitted.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Engineer Modal (only for managers/team leaders) */}
      {engineerModalOpen && selectedEngineer && isManagerOrTeamLeader && (
        <div style={{ 
          position: 'fixed', 
          left: 0, 
          top: 0, 
          right: 0, 
          bottom: 0, 
          background: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 2000 
        }}>
          <div style={{ 
            background: 'white', 
            width: '720px', 
            maxWidth: '95%', 
            borderRadius: '8px', 
            padding: '20px', 
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>{selectedEngineer.username || selectedEngineer.name || 'Engineer Details'}</h3>
              <button 
                onClick={() => { 
                  setEngineerModalOpen(false)
                  setSelectedEngineer(null) 
                }} 
                style={{ 
                  padding: '8px 12px', 
                  background: '#ef4444', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px', 
                  cursor: 'pointer' 
                }}
              >
                Close
              </button>
            </div>
            <div style={{ display: 'flex', gap: '20px', flexDirection: window.innerWidth < 768 ? 'column' : 'row' }}>
              <div style={{ flex: 1 }}>
                <p><strong>Employee ID:</strong> {selectedEngineer.employeeId || 'N/A'}</p>
                <p><strong>Role:</strong> {selectedEngineer.role || 'N/A'}</p>
                <p><strong>Phone:</strong> {selectedEngineer.phone || 'N/A'}</p>
                <p><strong>Email:</strong> {selectedEngineer.email || 'N/A'}</p>
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ marginTop: 0 }}>Recent Activity</h4>
                <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                  {(selectedEngineer.recentActivity || []).map((ra, i) => (
                    <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '14px' }}><strong>{ra.type}</strong> — {ra.project || 'N/A'}</div>
                      <div style={{ fontSize: '13px', color: '#666' }}>
                        {ra.date} {ra.time ? `• ${ra.time}` : ''} {ra.leaveReason ? `• ${ra.leaveReason}` : ''}
                      </div>
                    </div>
                  ))}
                  {(!selectedEngineer.recentActivity || selectedEngineer.recentActivity.length === 0) && (
                    <div style={{ color: '#666' }}>No recent activity</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
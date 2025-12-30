import React, { useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import './TimeTracker.css'

const TimeTracker = () => {
  const { token, user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(null)
  const [todaySummary, setTodaySummary] = useState(null)
  const [activities, setActivities] = useState([])
  const [breaks, setBreaks] = useState([])
  const [activeActivity, setActiveActivity] = useState(null)
  const [activeBreak, setActiveBreak] = useState(null)
  const [location, setLocation] = useState(null)
  const [locationError, setLocationError] = useState('')

 const API_BASE = import.meta.env.VITE_API_URL?.replace('/api/activity', '') ?? 'http://localhost:5000'
const API_URL = `${API_BASE}/api/time-tracking`

  // Fetch initial data
  useEffect(() => {
    if (token) {
      fetchTodaySummary()
    }
  }, [token])

  // Get current location
  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported'))
        return
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const lat = position.coords.latitude
            const lng = position.coords.longitude
            
            // Reverse geocode to get location name
            let locationName = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
            
            // Try Google Maps API
            const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
            if (googleApiKey) {
              const response = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}`
              )
              const data = await response.json()
              if (data.results && data.results[0]) {
                locationName = data.results[0].formatted_address
              }
            }
            
            resolve({ lat, lng, name: locationName })
          } catch (error) {
            resolve({ 
              lat: position.coords.latitude, 
              lng: position.coords.longitude,
              name: 'Location obtained'
            })
          }
        },
        (error) => {
          reject(new Error('Location access denied'))
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    })
  }

 const fetchTodaySummary = async () => {
    try {
      // ✅ FIXED: Correct endpoint
      const response = await fetch(`${API_BASE}/api/time-tracking/today-summary`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setTodaySummary(data.data.summary)
          setActivities(data.data.activities || [])
          setBreaks(data.data.breaks || [])
          
          // Set current status
          if (data.data.summary) {
            setCurrentStatus(data.data.summary.status || 'clocked_out')
            if (data.data.summary.status === 'clocked_in') {
              // Check for active activity
              const activeAct = data.data.activities.find(a => !a.end_time)
              if (activeAct) setActiveActivity(activeAct)
            } else if (data.data.summary.status === 'on_break') {
              // Check for active break
              const activeBrk = data.data.breaks.find(b => !b.end_time)
              if (activeBrk) setActiveBreak(activeBrk)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching summary:', error)
    }
  }

  const handleClockIn = async () => {
    setLoading(true)
    setLocationError('')
    
    try {
      const locationData = await getCurrentLocation()
      setLocation(locationData)
      
      const response = await fetch(`${API_URL}/api/time-tracking/clock-in`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          latitude: locationData.lat,
          longitude: locationData.lng,
          locationName: locationData.name
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setCurrentStatus('clocked_in')
        await fetchTodaySummary()
        alert('✅ Clocked in successfully!')
      } else {
        alert(`❌ ${data.message}`)
      }
    } catch (error) {
      console.error('Clock in error:', error)
      setLocationError('Failed to get location. Please enable location services.')
    } finally {
      setLoading(false)
    }
  }

 const handleClockOut = async () => {
    setLoading(true)
    
    try {
      const locationData = await getCurrentLocation()
      
      // ✅ FIXED: Correct endpoint
      const response = await fetch(`${API_BASE}/api/time-tracking/clock-out`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          latitude: locationData.lat,
          longitude: locationData.lng,
          locationName: locationData.name
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setCurrentStatus('clocked_out')
        await fetchTodaySummary()
        alert('✅ Clocked out successfully!')
      } else {
        alert(`❌ ${data.message}`)
      }
    } catch (error) {
      console.error('Clock out error:', error)
      alert('Failed to connect to server. Please check if backend is running.')
    } finally {
      setLoading(false)
    }
  }

  // ✅ FIX ALL OTHER API CALLS SIMILARLY:
  const handleStartActivity = async (projectId, activityType, taskDescription) => {
    setLoading(true)
    
    try {
      const response = await fetch(`${API_BASE}/api/time-tracking/activity/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId,
          activityType,
          taskDescription
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setActiveActivity({
          id: data.data.activityId,
          startTime: data.data.startTime,
          projectId,
          activityType,
          taskDescription
        })
        await fetchTodaySummary()
        alert('⏱️ Activity timer started!')
      } else {
        alert(`❌ ${data.message}`)
      }
    } catch (error) {
      console.error('Start activity error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStopActivity = async () => {
    setLoading(true)
    
    try {
      const response = await fetch(`${API_URL}/api/time-tracking/activity/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      const data = await response.json()
      
      if (data.success) {
        setActiveActivity(null)
        await fetchTodaySummary()
        alert('⏱️ Activity timer stopped!')
      } else {
        alert(`❌ ${data.message}`)
      }
    } catch (error) {
      console.error('Stop activity error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStartBreak = async (breakType) => {
    setLoading(true)
    
    try {
      const response = await fetch(`${API_URL}/api/time-tracking/break/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ breakType })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setActiveBreak({
          id: data.data.breakId,
          breakType,
          startTime: data.data.startTime
        })
        setCurrentStatus('on_break')
        await fetchTodaySummary()
        alert('☕ Break started!')
      } else {
        alert(`❌ ${data.message}`)
      }
    } catch (error) {
      console.error('Start break error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEndBreak = async () => {
    setLoading(true)
    
    try {
      const response = await fetch(`${API_URL}/api/time-tracking/break/end`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      const data = await response.json()
      
      if (data.success) {
        setActiveBreak(null)
        setCurrentStatus('clocked_in')
        await fetchTodaySummary()
        alert('☕ Break ended!')
      } else {
        alert(`❌ ${data.message}`)
      }
    } catch (error) {
      console.error('End break error:', error)
    } finally {
      setLoading(false)
    }
  }

  // Format time
  const formatTime = (timeString) => {
    if (!timeString) return ''
    const date = new Date(timeString)
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDuration = (minutes) => {
    if (!minutes) return '0m'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  return (
    <div className="time-tracker">
      <div className="tracker-header">
        <h2>⏰ Time Tracker</h2>
        <div className="current-status">
          <span className={`status-badge ${currentStatus}`}>
            {currentStatus === 'clocked_in' ? '🟢 On Duty' :
             currentStatus === 'on_break' ? '🟡 On Break' :
             '🔴 Off Duty'}
          </span>
          {location && (
            <span className="location-info">📍 {location.name}</span>
          )}
        </div>
      </div>

      {locationError && (
        <div className="alert error">
          <p>{locationError}</p>
        </div>
      )}

      {/* Main Controls */}
      <div className="tracker-controls">
        {currentStatus === 'clocked_out' ? (
          <button 
            className="btn-clock-in"
            onClick={handleClockIn}
            disabled={loading}
          >
            {loading ? '🔄 Processing...' : '🟢 CLOCK IN'}
          </button>
        ) : (
          <button 
            className="btn-clock-out"
            onClick={handleClockOut}
            disabled={loading}
          >
            {loading ? '🔄 Processing...' : '🔴 CLOCK OUT'}
          </button>
        )}

        {currentStatus === 'clocked_in' && (
          <div className="activity-controls">
            {activeActivity ? (
              <button 
                className="btn-stop-activity"
                onClick={handleStopActivity}
                disabled={loading}
              >
                ⏹️ Stop Activity
              </button>
            ) : (
              <div className="start-activity-form">
                <select 
                  className="activity-select"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleStartActivity(e.target.value, 'work', 'Working on task')
                    }
                  }}
                  disabled={loading}
                >
                  <option value="">Start Activity...</option>
                  <option value="project-001">Project A</option>
                  <option value="project-002">Project B</option>
                  <option value="project-003">Project C</option>
                </select>
              </div>
            )}
          </div>
        )}

        {currentStatus === 'clocked_in' && !activeBreak ? (
          <div className="break-controls">
            <button 
              className="btn-break-lunch"
              onClick={() => handleStartBreak('lunch')}
              disabled={loading}
            >
              🍱 Lunch Break
            </button>
            <button 
              className="btn-break-coffee"
              onClick={() => handleStartBreak('coffee')}
              disabled={loading}
            >
              ☕ Coffee Break
            </button>
          </div>
        ) : currentStatus === 'on_break' && activeBreak ? (
          <button 
            className="btn-end-break"
            onClick={handleEndBreak}
            disabled={loading}
          >
            ⏰ End Break
          </button>
        ) : null}
      </div>

      {/* Today's Summary */}
      {todaySummary && (
        <div className="today-summary">
          <h3>📊 Today's Summary</h3>
          <div className="summary-cards">
            <div className="summary-card">
              <div className="card-label">Total Hours</div>
              <div className="card-value">
                {todaySummary.total_hours || '0.00'} hrs
              </div>
            </div>
            <div className="summary-card">
              <div className="card-label">Overtime</div>
              <div className="card-value">
                {todaySummary.overtime_hours || '0.00'} hrs
              </div>
            </div>
            <div className="summary-card">
              <div className="card-label">Breaks</div>
              <div className="card-value">
                {todaySummary.break_minutes ? `${todaySummary.break_minutes} min` : '0 min'}
              </div>
            </div>
            <div className="summary-card">
              <div className="card-label">Activities</div>
              <div className="card-value">
                {todaySummary.activity_count || 0}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Activity */}
      {activeActivity && (
        <div className="active-activity">
          <h3>⏱️ Active Activity</h3>
          <div className="activity-details">
            <p><strong>Project:</strong> {activeActivity.projectId}</p>
            <p><strong>Started:</strong> {formatTime(activeActivity.startTime)}</p>
            <p><strong>Duration:</strong> {formatDuration(
              Math.round((new Date() - new Date(activeActivity.startTime)) / (1000 * 60))
            )}</p>
          </div>
        </div>
      )}

      {/* Active Break */}
      {activeBreak && (
        <div className="active-break">
          <h3>☕ Active Break</h3>
          <div className="break-details">
            <p><strong>Type:</strong> {activeBreak.breakType}</p>
            <p><strong>Started:</strong> {formatTime(activeBreak.startTime)}</p>
            <p><strong>Duration:</strong> {formatDuration(
              Math.round((new Date() - new Date(activeBreak.startTime)) / (1000 * 60))
            )}</p>
          </div>
        </div>
      )}

      {/* Recent Activities */}
      {activities.length > 0 && (
        <div className="recent-activities">
          <h3>📝 Recent Activities</h3>
          <div className="activities-list">
            {activities.map((activity) => (
              <div key={activity.id} className="activity-item">
                <div className="activity-info">
                  <div className="activity-project">{activity.project_id}</div>
                  <div className="activity-task">{activity.task_description}</div>
                </div>
                <div className="activity-time">
                  <div className="activity-duration">
                    {formatDuration(activity.duration_minutes)}
                  </div>
                  <div className="activity-period">
                    {formatTime(activity.start_time)} - {formatTime(activity.end_time)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Breaks */}
      {breaks.length > 0 && (
        <div className="recent-breaks">
          <h3>☕ Recent Breaks</h3>
          <div className="breaks-list">
            {breaks.map((breakItem) => (
              <div key={breakItem.id} className="break-item">
                <div className="break-type">{breakItem.break_type}</div>
                <div className="break-duration">
                  {formatDuration(breakItem.duration_minutes)}
                </div>
                <div className="break-time">
                  {formatTime(breakItem.start_time)} - {formatTime(breakItem.end_time)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default TimeTracker
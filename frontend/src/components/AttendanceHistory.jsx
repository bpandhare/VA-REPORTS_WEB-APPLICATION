import { useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import './OnboardingForm.css';

export default function AttendanceHistory() {
  const { token, user } = useAuth();
  const [attendanceData, setAttendanceData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewMode, setViewMode] = useState('summary'); // 'summary' or 'details'

  // Get base URL from environment
  const API_BASE = useMemo(() => {
    const envUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    return envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
  }, []);

  // Define endpoints correctly
  const endpoints = useMemo(() => ({
    // Attendance endpoints - CORRECT PATHS
    attendanceRange: `${API_BASE}/api/activity/attendance/range`,
    dateAttendance: `${API_BASE}/api/activity/attendance`,
    dateSummary: `${API_BASE}/api/activity/date-summary`
  }), [API_BASE]);

  // Debug: Log endpoints
  useEffect(() => {
    console.log('🔧 Attendance History Endpoints:', endpoints);
  }, [endpoints]);

  // Fetch attendance data for date range
  const fetchDateRangeAttendance = async (start, end) => {
    if (!token) {
      setError('Please log in to view attendance history');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`📊 Fetching attendance range from ${start} to ${end}`);
      console.log(`🌐 URL: ${endpoints.attendanceRange}?startDate=${start}&endDate=${end}`);

      const response = await fetch(
        `${endpoints.attendanceRange}?startDate=${start}&endDate=${end}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`📊 Response status: ${response.status}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Attendance endpoint not found. Please check backend routes.');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📊 Attendance range data received:', data);

      if (data.success === false) {
        throw new Error(data.message || 'Failed to fetch attendance data');
      }

      setAttendanceData(data);
      console.log(`✅ Loaded attendance data for ${Object.keys(data.dailyData || {}).length} days`);
    } catch (err) {
      console.error('❌ Error fetching date range attendance:', err);
      setError('Unable to fetch attendance history. ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch attendance for specific date
  const fetchDateAttendance = async (date) => {
    if (!token) return;

    try {
      console.log(`📅 Fetching attendance for specific date: ${date}`);
      const response = await fetch(`${endpoints.dateAttendance}?date=${date}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return data;
        }
      }
      return null;
    } catch (error) {
      console.error('Error fetching date attendance:', error);
      return null;
    }
  };

  // Initial fetch
  useEffect(() => {
    if (user && token) {
      fetchDateRangeAttendance(startDate, endDate);
    }
  }, [user, token, startDate, endDate]);

  // Handle date range change
  const handleDateRangeChange = () => {
    if (startDate && endDate) {
      if (new Date(startDate) > new Date(endDate)) {
        setError('Start date cannot be after end date');
        return;
      }
      fetchDateRangeAttendance(startDate, endDate);
    }
  };

  // Handle date click in calendar
  const handleDateClick = async (date) => {
    setSelectedDate(date);
    setViewMode('details');
    
    // If we already have data for this date, use it
    if (attendanceData.dailyData?.[date]) {
      return;
    }
    
    // Otherwise fetch it
    const dateData = await fetchDateAttendance(date);
    if (dateData && attendanceData.dailyData) {
      setAttendanceData(prev => ({
        ...prev,
        dailyData: {
          ...prev.dailyData,
          [date]: dateData
        }
      }));
    }
  };

  // Format functions
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (time) => {
    if (!time) return '';
    if (time.includes(':')) {
      const parts = time.split(':');
      if (parts.length >= 2) {
        return `${parts[0]}:${parts[1]}`;
      }
    }
    return time;
  };

  // Generate date range for calendar view
  const generateDateRange = () => {
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return dates.reverse(); // Show most recent first
  };

  // Calculate percentage
  const calculatePercentage = (count, total) => {
    if (total === 0) return 0;
    return Math.round((count / total) * 100);
  };

  if (!user) {
    return (
      <section className="vh-form-shell">
        <div className="vh-alert error">
          <p>Please log in to view attendance history</p>
        </div>
      </section>
    );
  }

  return (
    <section className="vh-form-shell">
      <header className="vh-form-header">
        <div>
          <p className="vh-form-label">Attendance History</p>
          <h2>Employee Attendance Records</h2>
        </div>
      </header>

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

      {/* Date Range Selector */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ color: '#092544', marginBottom: '1rem' }}>Select Date Range</h3>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
          </div>
          
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
          </div>
          
          <div style={{ alignSelf: 'flex-end' }}>
            <button
              onClick={handleDateRangeChange}
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                background: loading ? '#ccc' : '#2ad1ff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold'
              }}
            >
              {loading ? 'Loading...' : 'View Attendance'}
            </button>
          </div>
        </div>
        
        {attendanceData.dateRange && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            background: '#f8f9fa',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>
              Showing data from <strong>{formatDate(attendanceData.dateRange.startDate)}</strong> to <strong>{formatDate(attendanceData.dateRange.endDate)}</strong>
            </span>
            <span style={{ color: '#666' }}>
              {attendanceData.summary?.totalDays || 0} days with data
            </span>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: 'white',
          borderRadius: '12px',
          marginBottom: '2rem'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <p>Loading attendance data...</p>
        </div>
      )}

      {/* Summary View */}
      {!loading && attendanceData.summary && viewMode === 'summary' && (
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#092544', margin: 0 }}>Attendance Summary</h3>
            <button
              onClick={() => setViewMode('calendar')}
              style={{
                padding: '0.5rem 1rem',
                background: '#f0f0f0',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              📅 Calendar View
            </button>
          </div>

          {/* Summary Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div style={{ background: '#e8f4ff', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Total Days</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#092544' }}>
                {attendanceData.summary.totalDays || 0}
              </div>
            </div>
            <div style={{ background: '#e8f4ff', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Total Activities</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#092544' }}>
                {attendanceData.summary.totalActivities || 0}
              </div>
            </div>
            <div style={{ background: '#e8f5e9', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Present</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4CAF50' }}>
                {attendanceData.summary.presentCount || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                {calculatePercentage(attendanceData.summary.presentCount, attendanceData.summary.totalActivities)}%
              </div>
            </div>
            <div style={{ background: '#ffebee', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Absent</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#F44336' }}>
                {attendanceData.summary.absentCount || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                {calculatePercentage(attendanceData.summary.absentCount, attendanceData.summary.totalActivities)}%
              </div>
            </div>
            <div style={{ background: '#fff3e0', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>On Leave</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#FF9800' }}>
                {attendanceData.summary.leaveCount || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                {calculatePercentage(attendanceData.summary.leaveCount, attendanceData.summary.totalActivities)}%
              </div>
            </div>
          </div>

          {/* Daily Breakdown */}
          {attendanceData.dailyData && Object.keys(attendanceData.dailyData).length > 0 && (
            <div>
              <h4 style={{ color: '#092544', marginBottom: '1rem' }}>Daily Breakdown</h4>
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e8eef4' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f3f6f9' }}>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Employees</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Present</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Absent</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Leave</th>
                      <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(attendanceData.dailyData)
                      .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA))
                      .map(([date, data]) => (
                        <tr key={date}>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7', fontWeight: 'bold' }}>
                            {formatDate(date)}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            {data.summary?.totalEmployees || 0}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7', color: '#4CAF50' }}>
                            {data.summary?.presentCount || 0}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7', color: '#F44336' }}>
                            {data.summary?.absentCount || 0}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7', color: '#FF9800' }}>
                            {data.summary?.leaveCount || 0}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            <button
                              onClick={() => handleDateClick(date)}
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: '#2ad1ff',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                              }}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Calendar View */}
      {!loading && viewMode === 'calendar' && (
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#092544', margin: 0 }}>Calendar View</h3>
            <button
              onClick={() => setViewMode('summary')}
              style={{
                padding: '0.5rem 1rem',
                background: '#f0f0f0',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              📊 Summary View
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '1rem'
          }}>
            {generateDateRange().map((date, index) => {
              const dateStr = date.toISOString().split('T')[0];
              const dayData = attendanceData.dailyData?.[dateStr];
              const isToday = dateStr === new Date().toISOString().split('T')[0];
              
              return (
                <div
                  key={index}
                  onClick={() => handleDateClick(dateStr)}
                  style={{
                    padding: '1rem',
                    background: dayData ? '#f8f9fa' : '#fff',
                    border: `2px solid ${isToday ? '#2ad1ff' : (dayData ? '#e0e0e0' : '#f0f0f0')}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ fontWeight: 'bold', color: '#092544' }}>
                      {formatDate(dateStr)}
                    </div>
                    {isToday && (
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        background: '#2ad1ff',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 'bold'
                      }}>
                        Today
                      </span>
                    )}
                  </div>
                  
                  {dayData ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                          ✓ {dayData.summary?.presentCount || 0}
                        </span>
                        <span style={{ color: '#F44336', fontWeight: 'bold' }}>
                          ✗ {dayData.summary?.absentCount || 0}
                        </span>
                        <span style={{ color: '#FF9800', fontWeight: 'bold' }}>
                          🌴 {dayData.summary?.leaveCount || 0}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>
                        {dayData.summary?.totalEmployees || 0} employees
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '0.5rem', color: '#999' }}>
                      No data available
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Date Details View */}
      {!loading && selectedDate && viewMode === 'details' && attendanceData.dailyData?.[selectedDate] && (
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#092544', margin: 0 }}>
              Attendance Details for {formatDate(selectedDate)}
            </h3>
            <button
              onClick={() => {
                setSelectedDate(null);
                setViewMode('summary');
              }}
              style={{
                padding: '0.5rem 1rem',
                background: '#f0f0f0',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              ← Back to Summary
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div style={{ background: '#e8f4ff', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Total Employees</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#092544' }}>
                {attendanceData.dailyData[selectedDate].summary?.totalEmployees || 0}
              </div>
            </div>
            <div style={{ background: '#e8f5e9', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Present</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4CAF50' }}>
                {attendanceData.dailyData[selectedDate].summary?.presentCount || 0}
              </div>
            </div>
            <div style={{ background: '#ffebee', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Absent</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#F44336' }}>
                {attendanceData.dailyData[selectedDate].summary?.absentCount || 0}
              </div>
            </div>
            <div style={{ background: '#fff3e0', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>On Leave</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#FF9800' }}>
                {attendanceData.dailyData[selectedDate].summary?.leaveCount || 0}
              </div>
            </div>
          </div>

          {/* Employee Details Table */}
          {attendanceData.dailyData[selectedDate].activities?.length > 0 && (
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e8eef4' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f3f6f9' }}>
                    <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Employee</th>
                    <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Project</th>
                    <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Activity</th>
                    <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceData.dailyData[selectedDate].activities.map((activity, index) => (
                    <tr key={index}>
                      <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                        <div style={{ fontWeight: 'bold' }}>{activity.engineerName || 'Unknown'}</div>
                        {activity.engineerId && <small style={{ color: '#666' }}>ID: {activity.engineerId}</small>}
                      </td>
                      <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          background: 
                            activity.status === 'present' ? '#e8f5e9' :
                            activity.status === 'leave' ? '#fff3e0' :
                            activity.status === 'absent' ? '#ffebee' : '#f5f5f5',
                          color:
                            activity.status === 'present' ? '#2e7d32' :
                            activity.status === 'leave' ? '#f57c00' :
                            activity.status === 'absent' ? '#c62828' : '#757575',
                          fontWeight: 'bold'
                        }}>
                          {activity.status?.toUpperCase() || 'UNKNOWN'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                        {activity.project || 'N/A'}
                      </td>
                      <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                        {activity.activityTarget?.substring(0, 60) || 'No activity'}
                      </td>
                      <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                        {activity.startTime && activity.endTime 
                          ? `${formatTime(activity.startTime)} - ${formatTime(activity.endTime)}`
                          : 'N/A'}
                      </td>
                      <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                        {activity.leaveReason || activity.problem || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* No Data State */}
      {!loading && !attendanceData.summary && !error && (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
          <p>No attendance data found for the selected date range</p>
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
            Select a date range and click "View Attendance" to load data
          </p>
        </div>
      )}
    </section>
  );
}
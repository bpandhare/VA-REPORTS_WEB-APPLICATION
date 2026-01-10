import { useMemo, useState, useEffect } from 'react'
import './OnboardingForm.css'
import { useAuth } from './AuthContext'

// Format date for backend (ensure YYYY-MM-DD format)
const formatDateForBackend = (dateValue) => {
  if (!dateValue) return new Date().toISOString().slice(0, 10)

  // If it's already a string in YYYY-MM-DD format, return as is
  if (typeof dateValue === 'string' && dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateValue
  }

  // If it's a Date object or ISO string, extract the date part
  const date = new Date(dateValue)
  return date.toISOString().slice(0, 10)
}

// Generate 3-hour time periods from 9am to 6pm
const generateTimePeriods = () => {
  const periods = []
  
  // 3-hour periods: 9am-12pm, 12pm-3pm, 3pm-6pm
  const periodDefinitions = [
    { startHour: 9, endHour: 12, label: '9am-12pm', name: 'Morning Session' },
    { startHour: 12, endHour: 15, label: '12pm-3pm', name: 'Afternoon Session' },
    { startHour: 15, endHour: 18, label: '3pm-6pm', name: 'Evening Session' }
  ]
  
  return periodDefinitions.map(period => ({
    label: period.label,
    name: period.name,
    startHour: period.startHour,
    endHour: period.endHour
  }))
}

// Check if current time is within allowed period for a specific hour
const isWithinTimePeriod = (startHour, endHour, currentDate = new Date()) => {
  const now = new Date(currentDate)
  const currentHour = now.getHours()
  const currentMinutes = now.getMinutes()

  // Check if current time is within the period
  if (currentHour > startHour && currentHour < endHour) return true
  if (currentHour === startHour && currentMinutes >= 0) return true
  if (currentHour === endHour && currentMinutes === 0) return true

  return false
}

// Check if current time is within the allowed editing window (within the period or up to 30 minutes after)
const isWithinEditingWindow = (startHour, endHour, currentDate = new Date()) => {
  const now = new Date(currentDate)
  const currentHour = now.getHours()
  const currentMinutes = now.getMinutes()

  // Allow editing during the period
  if (isWithinTimePeriod(startHour, endHour, now)) return true

  // Allow editing up to 30 minutes after the period ends
  if (currentHour === endHour && currentMinutes <= 30) return true

  return false
}

// Check if a period is in the future (hasn't started yet)
const isFuturePeriod = (startHour, currentDate = new Date()) => {
  const now = new Date(currentDate)
  const currentHour = now.getHours()
  const currentMinutes = now.getMinutes()

  return currentHour < startHour || (currentHour === startHour && currentMinutes < 0)
}

const createHourlyEntry = () => ({
  timePeriod: '',
  periodName: '',
  hourlyActivity: '',
  hourlyAchieved: '', // NEW: What was actually achieved in this session
  problemFacedByEngineerHourly: '',
  problemResolvedOrNot: '',
  problemOccurStartTime: '',
  problemResolvedEndTime: '',
  onlineSupportRequiredForWhichProblem: '',
  onlineSupportTime: '',
  onlineSupportEndTime: '',
  engineerNameWhoGivesOnlineSupport: '',
  engineerRemark: '',
  projectInchargeRemark: '',
})

const defaultPayload = () => {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)

  return {
    reportDate: date,
    locationType: '',
    projectName: '',
    dailyTargetPlanned: '', // Renamed from dailyTarget for clarity
    dailyTargetAchieved: '', // Will be auto-calculated from hourly sessions
    customerName: '',
    customerPerson: '',
    customerContact: '',
    endCustomerName: '',
    endCustomerPerson: '',
    endCustomerContact: '',
    incharge: '',
    siteLocation: '',
    siteStartDate: '',
    siteEndDate: '',
    hourlyEntries: generateTimePeriods().map(period => ({
      ...createHourlyEntry(),
      timePeriod: period.label,
      periodName: period.name,
      startHour: period.startHour,
      endHour: period.endHour
    }))
  }
}

function HourlyReportForm() {
  const { token, user } = useAuth()
  const [formData, setFormData] = useState(defaultPayload)
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState(null)
  const [dailyTargets, setDailyTargets] = useState([])
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [currentActivePeriod, setCurrentActivePeriod] = useState(null)
  const [existingReports, setExistingReports] = useState([])
  const [editingReport, setEditingReport] = useState(null)
  const [sessionStatus, setSessionStatus] = useState({
    morning: { status: 'pending', canEdit: false },
    afternoon: { status: 'pending', canEdit: false },
    evening: { status: 'pending', canEdit: false }
  })
  const [totalAchieved, setTotalAchieved] = useState('') // Auto-calculated total

  // Calculate total achieved from all hourly entries
  useEffect(() => {
    const calculateTotalAchieved = () => {
      let total = ''
      const achievedEntries = formData.hourlyEntries
        .map(entry => entry.hourlyAchieved?.trim())
        .filter(achieved => achieved && achieved.length > 0)
      
      if (achievedEntries.length > 0) {
        // Combine all hourly achievements into a summary
        total = achievedEntries.join('. ')
        
        // If it's too long, create a summary
        if (total.length > 500) {
          total = achievedEntries.map((achieved, index) => 
            `Session ${index + 1}: ${achieved.substring(0, 100)}${achieved.length > 100 ? '...' : ''}`
          ).join(' | ')
        }
      }
      
      setTotalAchieved(total)
      setFormData(prev => ({ ...prev, dailyTargetAchieved: total }))
    }
    
    calculateTotalAchieved()
  }, [formData.hourlyEntries])

  // Function to refresh existing reports
  const refreshExistingReports = async () => {
    if (!token || !formData.reportDate) return
    
    try {
      const response = await fetch(`${endpoint}/${formData.reportDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      })
      if (response.ok) {
        const reports = await response.json()
        setExistingReports(reports)
      }
    } catch (error) {
      console.error('Failed to refresh existing reports:', error)
    }
  }

  // Update active period and session status every minute
  useEffect(() => {
    const updatePeriodAndStatus = () => {
      const now = new Date()
      const periods = generateTimePeriods()
      
      // Find current active period
      const activePeriod = periods.find(period =>
        isWithinEditingWindow(period.startHour, period.endHour, now)
      )
      setCurrentActivePeriod(activePeriod ? activePeriod.label : null)

      // Update session status
      const status = {
        morning: { status: 'pending', canEdit: false },
        afternoon: { status: 'pending', canEdit: false },
        evening: { status: 'pending', canEdit: false }
      }

      periods.forEach(period => {
        const periodKey = period.name.toLowerCase().replace(' session', '')
        
        // Check if report exists for this period
        const existingReport = existingReports.find(report => report.time_period === period.label)
        
        if (existingReport) {
          status[periodKey] = { 
            status: 'submitted', 
            canEdit: false,
            report: existingReport 
          }
        } else if (isFuturePeriod(period.startHour, now)) {
          status[periodKey] = { status: 'pending', canEdit: false }
        } else if (isWithinEditingWindow(period.startHour, period.endHour, now)) {
          status[periodKey] = { status: 'active', canEdit: true }
        } else {
          // Period has passed but no report submitted
          status[periodKey] = { status: 'missed', canEdit: false }
        }
      })

      setSessionStatus(status)
    }

    updatePeriodAndStatus()
    const interval = setInterval(updatePeriodAndStatus, 60000) // Check every minute
    return () => clearInterval(interval)
  }, [existingReports])

  const endpoint = useMemo(
    () => import.meta.env.VITE_API_URL?.replace('/api/activity', '/api/hourly-report') ?? 'http://localhost:5000/api/hourly-report',
    []
  )

  const dailyTargetsEndpoint = useMemo(
    () => import.meta.env.VITE_API_URL?.replace('/api/activity', '/api/hourly-report/daily-targets') ?? 'http://localhost:5000/api/hourly-report/daily-targets',
    []
  )

  // Auto-fetch daily targets when date changes
  useEffect(() => {
    const fetchDailyTargets = async () => {
      if (!formData.reportDate || !token) return

      setLoadingTargets(true)
      try {
        const response = await fetch(`${dailyTargetsEndpoint}/${formData.reportDate}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        })

        if (response.ok) {
          const targets = await response.json()
          console.log('📋 Loaded daily targets:', targets)
          setDailyTargets(targets)

          if (targets.length > 0 && !formData.projectName) {
            const firstTarget = targets[0]
            console.log('🔄 Auto-filling with:', firstTarget)
            
            setFormData(prev => ({
              ...prev,
              locationType: firstTarget.location_type || '',
              projectName: firstTarget.project_no || '',
              dailyTargetPlanned: firstTarget.daily_target_planned || '',
              // dailyTargetAchieved will be auto-calculated from hourly sessions
              customerName: firstTarget.customer_name || '',
              customerPerson: firstTarget.customer_person || '',
              customerContact: firstTarget.customer_contact || '',
              endCustomerName: firstTarget.end_customer_name || '',
              endCustomerPerson: firstTarget.end_customer_person || '',
              endCustomerContact: firstTarget.end_customer_contact || '',
              incharge: firstTarget.incharge || '',
              siteLocation: firstTarget.site_location || '',
              siteStartDate: firstTarget.site_start_date || '',
              siteEndDate: firstTarget.site_end_date || ''
            }))
          }
        } else {
          console.log('❌ No daily targets found for date:', formData.reportDate)
          setDailyTargets([])
        }
      } catch (error) {
        console.error('Failed to fetch daily targets:', error)
        setDailyTargets([])
      } finally {
        setLoadingTargets(false)
      }
    }

    const fetchExistingReports = async () => {
      if (!token || !formData.reportDate) return
      
      try {
        const response = await fetch(`${endpoint}/${formData.reportDate}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        })

        if (response.ok) {
          const reports = await response.json()
          setExistingReports(reports)
        } else {
          console.error('Failed to fetch existing reports:', response.status)
          setExistingReports([])
        }
      } catch (error) {
        console.error('Failed to fetch existing reports:', error)
        setExistingReports([])
      }
    }

    // Only fetch if token exists
    if (token) {
      fetchDailyTargets()
      fetchExistingReports()
    }
  }, [formData.reportDate, dailyTargetsEndpoint, token, endpoint])

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleHourlyEntryChange = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      hourlyEntries: prev.hourlyEntries.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry
      )
    }))
  }

  const handleDailyTargetSelect = (event) => {
    const selectedId = event.target.value
    console.log('🎯 Selected target ID:', selectedId)
    
    const selectedTarget = dailyTargets.find(target => 
      target.id && target.id.toString() === selectedId.toString()
    )

    if (selectedTarget) {
      console.log('✅ Loading target data:', selectedTarget)
      
      setFormData(prev => ({
        ...prev,
        locationType: selectedTarget.location_type || '',
        projectName: selectedTarget.project_no || '',
        dailyTargetPlanned: selectedTarget.daily_target_planned || '',
        // dailyTargetAchieved will remain empty (to be filled by hourly sessions)
        customerName: selectedTarget.customer_name || '',
        customerPerson: selectedTarget.customer_person || '',
        customerContact: selectedTarget.customer_contact || '',
        endCustomerName: selectedTarget.end_customer_name || '',
        endCustomerPerson: selectedTarget.end_customer_person || '',
        endCustomerContact: selectedTarget.end_customer_contact || '',
        incharge: selectedTarget.incharge || '',
        siteLocation: selectedTarget.site_location || '',
        siteStartDate: selectedTarget.site_start_date || '',
        siteEndDate: selectedTarget.site_end_date || ''
      }))
      
      setAlert({ 
        type: 'success', 
        message: `Loaded daily report: ${selectedTarget.project_no || 'Project'}`
      })
    } else {
      console.log('❌ Target not found:', selectedId)
      setAlert({ 
        type: 'error', 
        message: 'Selected daily report not found. Please try again.' 
      })
    }
  }

  const validateHourlyEntry = (entry) => {
    const errors = []

    // Check if hourly activity is filled
    if (!entry.hourlyActivity.trim()) {
      return errors // Skip validation if no activity entered
    }

    // If problem occurred is Yes, validate related fields
    if (entry.problemResolvedOrNot === 'Yes') {
      if (!entry.problemOccurStartTime) {
        errors.push('Problem occur start time is required when problem occurred')
      }
      if (!entry.problemResolvedEndTime) {
        errors.push('Problem resolved end time is required when problem occurred')
      }
      if (entry.onlineSupportRequiredForWhichProblem && (!entry.onlineSupportTime || !entry.onlineSupportEndTime || !entry.engineerNameWhoGivesOnlineSupport)) {
        errors.push('Online support details are required when support is requested')
      }
    }

    return errors
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    
    if (!token) {
      setAlert({ type: 'error', message: 'Authentication required. Please login again.' })
      return
    }
    
    setSubmitting(true)
    setAlert(null)

    try {
      const now = new Date()
      let submittedCount = 0
      const validationErrors = []

      // Validate and submit each hourly entry (only new ones, skip existing)
      const submitPromises = formData.hourlyEntries.map((entry) => {
        // Only submit entries that have hourly activity filled
        if (!entry.hourlyActivity.trim()) return Promise.resolve()

        // Check if this time period already has a report
        const existingReport = existingReports.find(report => report.time_period === entry.timePeriod)
        if (existingReport) {
          validationErrors.push(`${entry.timePeriod}: Report already exists. Use Edit button to update.`)
          return Promise.resolve()
        }

        // Validate time restrictions - allow editing within the period or up to 30 minutes after
        if (!isWithinEditingWindow(entry.startHour, entry.endHour, now)) {
          validationErrors.push(`${entry.timePeriod}: Can only submit reports within the allocated time period (or up to 30 minutes after)`)
          return Promise.resolve()
        }

        // Validate conditional fields
        const entryErrors = validateHourlyEntry(entry)
        if (entryErrors.length > 0) {
          validationErrors.push(`${entry.timePeriod}: ${entryErrors.join(', ')}`)
          return Promise.resolve()
        }

        submittedCount++

        // Include ALL data from Daily Target in the payload
        const payload = {
          reportDate: formData.reportDate,
          locationType: formData.locationType,
          timePeriod: entry.timePeriod,
          periodName: entry.periodName,
          projectName: formData.projectName,
          dailyTargetPlanned: formData.dailyTargetPlanned,
          dailyTargetAchieved: totalAchieved, // Auto-calculated from all sessions
          hourlyActivity: entry.hourlyActivity,
          hourlyAchieved: entry.hourlyAchieved, // NEW: Session-specific achievement
          problemFacedByEngineerHourly: entry.problemFacedByEngineerHourly,
          problemResolvedOrNot: entry.problemResolvedOrNot,
          problemOccurStartTime: entry.problemOccurStartTime,
          problemResolvedEndTime: entry.problemResolvedEndTime,
          onlineSupportRequiredForWhichProblem: entry.onlineSupportRequiredForWhichProblem,
          onlineSupportTime: entry.onlineSupportTime,
          onlineSupportEndTime: entry.onlineSupportEndTime,
          engineerNameWhoGivesOnlineSupport: entry.engineerNameWhoGivesOnlineSupport,
          engineerRemark: entry.engineerRemark,
          projectInchargeRemark: entry.projectInchargeRemark,
          
          // Daily Target fields
          customerName: formData.customerName,
          customerPerson: formData.customerPerson,
          customerContact: formData.customerContact,
          endCustomerName: formData.endCustomerName,
          endCustomerPerson: formData.endCustomerPerson,
          endCustomerContact: formData.endCustomerContact,
          incharge: formData.incharge,
          siteLocation: formData.siteLocation,
          siteStartDate: formData.siteStartDate,
          siteEndDate: formData.siteEndDate
        }

        console.log('📤 Sending hourly report payload:', payload)

        return fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })
      })

      // If there are validation errors, don't submit
      if (validationErrors.length > 0) {
        throw new Error(`Validation errors:\n${validationErrors.join('\n')}`)
      }

      const responses = await Promise.all(submitPromises)
      const failedCount = responses.filter(response => response && !response.ok).length

      if (failedCount > 0) {
        throw new Error(`Failed to save ${failedCount} hourly report(s). Please retry.`)
      }

      setAlert({
        type: 'success',
        message: `${submittedCount} hourly report(s) saved successfully! Daily Target Achieved has been auto-calculated.`
      })

      // Refresh existing reports and reset only hourly entries
      await refreshExistingReports()
      setFormData(prev => ({
        ...prev,
        hourlyEntries: generateTimePeriods().map(period => ({
          ...createHourlyEntry(),
          timePeriod: period.label,
          periodName: period.name,
          startHour: period.startHour,
          endHour: period.endHour
        }))
      }))
    } catch (error) {
      setAlert({ type: 'error', message: error.message })
    } finally {
      setSubmitting(false)
    }
  }

  // Function to get status badge style
  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'active':
        return { background: '#2ad1ff', color: 'white' }
      case 'submitted':
        return { background: '#06c167', color: 'white' }
      case 'missed':
        return { background: '#ff7a7a', color: 'white' }
      case 'pending':
        return { background: '#8892aa', color: 'white' }
      default:
        return { background: '#f5f5f5', color: '#092544' }
    }
  }

  // Function to get session status text
  const getSessionStatusText = (periodKey) => {
    const status = sessionStatus[periodKey]
    if (!status) return 'Unknown'
    
    switch (status.status) {
      case 'active':
        return 'ACTIVE - Fill now'
      case 'submitted':
        return 'SUBMITTED ✓'
      case 'missed':
        return 'MISSED ✗'
      case 'pending':
        return 'UPCOMING ⏰'
      default:
        return 'Unknown'
    }
  }

  return (
    <section className="vh-form-shell">
      <header className="vh-form-header">
        <div>
          <p className="vh-form-label">Hourly Activity Report</p>
          <h2>Log your activities in 3-hour sessions (9am - 6pm)</h2>
          <p>
            Record your activities in three sessions. <strong>Daily Target Planned</strong> is loaded from your Daily Report, 
            and <strong>Daily Target Achieved</strong> will be auto-calculated from your session achievements.
          </p>
          
          {/* Achievement Summary Card */}
          {totalAchieved && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem', 
              background: '#e6f7ff', 
              borderRadius: '8px',
              border: '1px solid #2ad1ff'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '0.5rem'
              }}>
                <div>
                  <strong style={{ color: '#092544' }}>Today's Achievement Summary</strong>
                  <div style={{ 
                    fontSize: '0.9rem', 
                    color: '#4a5972',
                    marginTop: '0.5rem',
                    lineHeight: '1.4'
                  }}>
                    {totalAchieved.length > 300 ? 
                      `${totalAchieved.substring(0, 300)}...` : 
                      totalAchieved}
                  </div>
                </div>
                <div style={{ 
                  background: '#06c167', 
                  color: 'white',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold'
                }}>
                  {formData.hourlyEntries.filter(e => e.hourlyAchieved?.trim()).length} / 3 sessions
                </div>
              </div>
              <small style={{ color: '#6c757d', display: 'block', marginTop: '0.5rem' }}>
                This will be saved as "Daily Target Achieved" when you submit your reports
              </small>
            </div>
          )}
        </div>
      </header>

      {alert && (
        <div className={`vh-alert ${alert.type}`}>
          <p>{alert.message}</p>
        </div>
      )}

      {/* Session Status Overview */}
      <div style={{ 
        marginBottom: '2rem',
        background: '#f8f9fa',
        padding: '1.5rem',
        borderRadius: '12px',
        border: '1px solid #dee2e6'
      }}>
        <h3 style={{ color: '#092544', marginBottom: '1rem' }}>Today's Session Status</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {Object.entries(sessionStatus).map(([key, status]) => {
            const periodName = key.charAt(0).toUpperCase() + key.slice(1) + ' Session'
            const periodLabel = key === 'morning' ? '9am-12pm' : key === 'afternoon' ? '12pm-3pm' : '3pm-6pm'
            const badgeStyle = getStatusBadgeStyle(status.status)
            
            return (
              <div key={key} style={{
                padding: '1rem',
                background: 'white',
                borderRadius: '8px',
                border: `1px solid ${badgeStyle.background}`,
                textAlign: 'center'
              }}>
                <div style={{ 
                  fontSize: '0.9rem', 
                  color: '#6c757d',
                  marginBottom: '0.5rem'
                }}>
                  {periodName}
                </div>
                <div style={{ 
                  fontSize: '1.2rem', 
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  {periodLabel}
                </div>
                <span style={{
                  background: badgeStyle.background,
                  color: badgeStyle.color,
                  padding: '0.25rem 0.75rem',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold'
                }}>
                  {getSessionStatusText(key)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Display existing hourly reports */}
      {existingReports.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ color: '#092544', marginBottom: '1rem' }}>Submitted Reports</h3>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {existingReports.map((report) => {
              const periodKey = report.period_name?.toLowerCase().replace(' session', '') || 
                              (report.time_period === '9am-12pm' ? 'morning' : 
                               report.time_period === '12pm-3pm' ? 'afternoon' : 'evening')
              const status = sessionStatus[periodKey]
              const canEdit = status?.canEdit || false
              
              return (
                <div
                  key={report.id}
                  style={{
                    border: `1px solid ${canEdit ? '#2ad1ff' : '#d5e0f2'}`,
                    borderRadius: '12px',
                    padding: '1rem',
                    background: canEdit ? '#f0f9ff' : '#f9f9f9',
                    opacity: canEdit ? 1 : 0.9
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div>
                      <h4 style={{ margin: 0, color: '#092544' }}>
                        {report.time_period} - {report.period_name || 'Session'}
                        {canEdit && (
                          <span style={{
                            background: '#2ad1ff',
                            color: 'white',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            marginLeft: '0.5rem'
                          }}>
                            EDITABLE
                          </span>
                        )}
                      </h4>
                      <small style={{ color: '#6c757d' }}>
                        Submitted at: {new Date(report.created_at || report.submitted_at).toLocaleTimeString()}
                      </small>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setEditingReport(report)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#2ad1ff',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#4a5972' }}>
                    <p style={{ margin: '0.25rem 0' }}><strong>Project:</strong> {report.project_name || 'N/A'}</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Planned:</strong> {report.daily_target_planned?.substring(0, 100) || 'N/A'}...</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Achieved:</strong> {report.hourly_achieved?.substring(0, 100) || report.daily_target_achieved?.substring(0, 100) || 'N/A'}...</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Activity:</strong> {report.hourly_activity?.substring(0, 100)}...</p>
                    {report.problem_faced_by_engineer_hourly && (
                      <p style={{ margin: '0.25rem 0' }}><strong>Problem:</strong> {report.problem_faced_by_engineer_hourly}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Edit form for selected report */}
      {editingReport && (
        <div style={{
          border: '2px solid #2ad1ff',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
          background: '#f0f9ff'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: '#092544' }}>
              Edit Report: {editingReport.time_period}
            </h3>
            <button
              type="button"
              onClick={() => setEditingReport(null)}
              style={{
                padding: '0.5rem 1rem',
                background: '#f5f5f5',
                color: '#092544',
                border: '1px solid #d5e0f2',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Cancel Edit
            </button>
          </div>

          <div className="vh-grid">
            <label className="vh-span-2">
              <span>Session Activity *</span>
              <textarea
                rows={3}
                value={editingReport.hourly_activity || ''}
                onChange={(e) => setEditingReport({...editingReport, hourly_activity: e.target.value})}
                placeholder="Describe your activities during this 3-hour session..."
                required
              />
            </label>

            <label className="vh-span-2">
              <span>Session Achievement *</span>
              <textarea
                rows={3}
                value={editingReport.hourly_achieved || editingReport.daily_target_achieved || ''}
                onChange={(e) => setEditingReport({...editingReport, hourly_achieved: e.target.value})}
                placeholder="What did you actually achieve in this session?"
                required
              />
            </label>

            <label className="vh-span-2">
              <span>Problems Faced During Session</span>
              <textarea
                rows={2}
                value={editingReport.problem_faced_by_engineer_hourly || ''}
                onChange={(e) => setEditingReport({...editingReport, problem_faced_by_engineer_hourly: e.target.value})}
                placeholder="Describe any problems faced during this session..."
              />
            </label>

            <label>
              <span>Problem Resolved or Not</span>
              <select
                value={editingReport.problem_resolved_or_not || ''}
                onChange={(e) => setEditingReport({...editingReport, problem_resolved_or_not: e.target.value})}
              >
                <option value="">Select</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>

            {editingReport.problem_resolved_or_not === 'Yes' && (
              <>
                <label>
                  <span>Problem Occur Start Time *</span>
                  <input
                    type="time"
                    value={editingReport.problem_occur_start_time || ''}
                    onChange={(e) => setEditingReport({...editingReport, problem_occur_start_time: e.target.value})}
                    required
                  />
                </label>

                <label>
                  <span>Problem Resolved End Time *</span>
                  <input
                    type="time"
                    value={editingReport.problem_resolved_end_time || ''}
                    onChange={(e) => setEditingReport({...editingReport, problem_resolved_end_time: e.target.value})}
                    required
                  />
                </label>

                <label className="vh-span-2">
                  <span>Online Support Required for Which Problem</span>
                  <textarea
                    rows={2}
                    value={editingReport.online_support_required_for_which_problem || ''}
                    onChange={(e) => setEditingReport({...editingReport, online_support_required_for_which_problem: e.target.value})}
                    placeholder="Describe which problem required online support..."
                  />
                </label>

                {editingReport.online_support_required_for_which_problem && (
                  <>
                    <label>
                      <span>Online Support Time *</span>
                      <input
                        type="time"
                        value={editingReport.online_support_time || ''}
                        onChange={(e) => setEditingReport({...editingReport, online_support_time: e.target.value})}
                        required
                      />
                    </label>

                    <label>
                      <span>Online Support End Time *</span>
                      <input
                        type="time"
                        value={editingReport.online_support_end_time || ''}
                        onChange={(e) => setEditingReport({...editingReport, online_support_end_time: e.target.value})}
                        required
                      />
                    </label>

                    <label className="vh-span-2">
                      <span>Engineer Name Who Gives Online Support *</span>
                      <input
                        type="text"
                        value={editingReport.engineer_name_who_gives_online_support || ''}
                        onChange={(e) => setEditingReport({...editingReport, engineer_name_who_gives_online_support: e.target.value})}
                        placeholder="Enter engineer name providing support"
                        required
                      />
                    </label>
                  </>
                )}
              </>
            )}

            <label className="vh-span-2">
              <span>Engineer Remark</span>
              <textarea
                rows={2}
                value={editingReport.engineer_remark || ''}
                onChange={(e) => setEditingReport({...editingReport, engineer_remark: e.target.value})}
                placeholder="Additional remarks from engineer..."
              />
            </label>

            <label className="vh-span-2">
              <span>Project Incharge Remark</span>
              <textarea
                rows={2}
                value={editingReport.project_incharge_remark || ''}
                onChange={(e) => setEditingReport({...editingReport, project_incharge_remark: e.target.value})}
                placeholder="Remarks from project incharge..."
              />
            </label>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <button
              type="button"
              onClick={async () => {
                if (!token) {
                  setAlert({ type: 'error', message: 'Authentication required. Please login again.' })
                  return
                }
                
                setSubmitting(true)
                try {
                  // Format the data with correct field names for the backend
                  const updateData = {
                    reportDate: formatDateForBackend(editingReport.report_date || editingReport.reportDate),
                    locationType: editingReport.location_type || editingReport.locationType,
                    timePeriod: editingReport.time_period || editingReport.timePeriod,
                    periodName: editingReport.period_name || editingReport.periodName,
                    projectName: editingReport.project_name || editingReport.projectName,
                    dailyTargetPlanned: editingReport.daily_target_planned || editingReport.dailyTargetPlanned,
                    dailyTargetAchieved: editingReport.daily_target_achieved || editingReport.dailyTargetAchieved,
                    hourlyActivity: editingReport.hourly_activity || editingReport.hourlyActivity,
                    hourlyAchieved: editingReport.hourly_achieved || editingReport.hourlyAchieved,
                    problemFacedByEngineerHourly: editingReport.problem_faced_by_engineer_hourly || editingReport.problemFacedByEngineerHourly,
                    problemResolvedOrNot: editingReport.problem_resolved_or_not || editingReport.problemResolvedOrNot,
                    problemOccurStartTime: editingReport.problem_occur_start_time || editingReport.problemOccurStartTime,
                    problemResolvedEndTime: editingReport.problem_resolved_end_time || editingReport.problemResolvedEndTime,
                    onlineSupportRequiredForWhichProblem: editingReport.online_support_required_for_which_problem || editingReport.onlineSupportRequiredForWhichProblem,
                    onlineSupportTime: (editingReport.online_support_time || editingReport.onlineSupportTime) || null,
                    onlineSupportEndTime: (editingReport.online_support_end_time || editingReport.onlineSupportEndTime) || null,
                    engineerNameWhoGivesOnlineSupport: editingReport.engineer_name_who_gives_online_support || editingReport.engineerNameWhoGivesOnlineSupport,
                    engineerRemark: editingReport.engineer_remark || editingReport.engineerRemark,
                    projectInchargeRemark: editingReport.project_incharge_remark || editingReport.projectInchargeRemark,
                  }

                  const response = await fetch(`${endpoint}/${editingReport.id}`, {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify(updateData),
                  })

                  if (!response.ok) {
                    throw new Error('Unable to update hourly report. Please retry.')
                  }

                  setAlert({ type: 'success', message: 'Session report updated successfully!' })

                  // Refresh existing reports
                  const refreshResponse = await fetch(`${endpoint}/${formData.reportDate}`, {
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json'
                    },
                  })
                  if (refreshResponse.ok) {
                    const reports = await refreshResponse.json()
                    setExistingReports(reports)
                  }

                  setEditingReport(null)
                } catch (error) {
                  setAlert({ type: 'error', message: error.message })
                } finally {
                  setSubmitting(false)
                }
              }}
              disabled={submitting}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#2ad1ff',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '0.95rem',
              }}
            >
              {submitting ? 'Updating…' : 'Update Report'}
            </button>
          </div>
        </div>
      )}

      <form className="vh-form" onSubmit={handleSubmit}>
        {/* Date Selection and Daily Report Selection */}
        <div className="vh-grid">
          <label>
            <span>Report Date *</span>
            <input
              type="date"
              name="reportDate"
              value={formData.reportDate}
              onChange={handleChange}
              required
            />
            <small style={{ color: '#6c757d', marginTop: '0.25rem', display: 'block' }}>
              Select date to load Daily Target Report
            </small>
          </label>

          <label className="vh-span-2">
            <span>Select Daily Target Report *</span>
            <select
              onChange={handleDailyTargetSelect}
              disabled={loadingTargets || dailyTargets.length === 0}
              value={dailyTargets.find(t => t.project_no === formData.projectName)?.id || ''}
              required
            >
              <option value="">
                {loadingTargets ? 'Loading daily reports...' : 
                 dailyTargets.length === 0 ? 'No daily reports found for this date' : 
                 'Select a daily report to load planned targets'}
              </option>
              {dailyTargets.map(target => (
                <option key={target.id} value={target.id}>
                  {target.project_no} - Planned: {target.daily_target_planned?.substring(0, 50) || 'No target set'}...
                </option>
              ))}
            </select>
            {dailyTargets.length > 0 && !loadingTargets && (
              <small style={{ color: '#06c167', marginTop: '0.25rem', display: 'block' }}>
                ✓ Found {dailyTargets.length} daily report(s) for {formData.reportDate}
              </small>
            )}
            {!token && (
              <small style={{ color: '#ff7a7a', marginTop: '0.25rem', display: 'block' }}>
                ⚠️ Please login to load daily reports
              </small>
            )}
          </label>
        </div>

        {/* Daily Report Information (Read-only, loaded from Daily Target) */}
        {formData.projectName && (
          <div style={{ 
            marginTop: '1.5rem',
            padding: '1.5rem',
            background: '#f0f9ff',
            borderRadius: '12px',
            border: '1px solid #2ad1ff'
          }}>
            <h3 style={{ color: '#092544', marginBottom: '1rem' }}>Loaded Daily Report Information</h3>
            
            <div className="vh-grid">
              <label>
                <span>Location Type</span>
                <input
                  type="text"
                  value={formData.locationType || 'Not loaded'}
                  readOnly
                  style={{ background: '#e6f7ff' }}
                />
              </label>

              <label className="vh-span-2">
                <span>Project Name / Project No.</span>
                <input
                  type="text"
                  value={formData.projectName || 'Select a daily report first'}
                  readOnly
                  style={{ background: '#e6f7ff' }}
                />
              </label>

              <label className="vh-span-2">
                <span>Daily Target Planned by Site Engineer *</span>
                <textarea
                  rows={3}
                  value={formData.dailyTargetPlanned || 'No planned target set'}
                  readOnly
                  style={{ background: '#e6f7ff' }}
                  required
                />
                <small style={{ color: '#6c757d', display: 'block', marginTop: '0.25rem' }}>
                  This is what was planned for today. Fill what you actually achieve in each session below.
                </small>
              </label>

              <label className="vh-span-2">
                <span>Daily Target Achieved (Auto-calculated)</span>
                <textarea
                  rows={3}
                  value={totalAchieved || 'Will be calculated from your session achievements'}
                  readOnly
                  style={{ background: totalAchieved ? '#e6f7ff' : '#f5f5f5' }}
                  placeholder="This will be automatically calculated from your session achievements"
                />
                <small style={{ 
                  color: totalAchieved ? '#06c167' : '#6c757d', 
                  display: 'block', 
                  marginTop: '0.25rem' 
                }}>
                  {totalAchieved ? '✓ Auto-calculated from your session achievements' : 'Fill session achievements below to auto-calculate'}
                </small>
              </label>

              <label className="vh-span-2">
                <span>Customer Name</span>
                <input
                  type="text"
                  value={formData.customerName || 'Not loaded'}
                  readOnly
                  style={{ background: '#e6f7ff' }}
                />
              </label>

              <label className="vh-span-2">
                <span>End Customer Name</span>
                <input
                  type="text"
                  value={formData.endCustomerName || 'Not loaded'}
                  readOnly
                  style={{ background: '#e6f7ff' }}
                />
              </label>

              <label>
                <span>Incharge</span>
                <input
                  type="text"
                  value={formData.incharge || 'Not loaded'}
                  readOnly
                  style={{ background: '#e6f7ff' }}
                />
              </label>

              <label>
                <span>Site Location</span>
                <input
                  type="text"
                  value={formData.siteLocation || 'Not loaded'}
                  readOnly
                  style={{ background: '#e6f7ff' }}
                />
              </label>

              <label>
                <span>Site Start Date</span>
                <input
                  type="date"
                  value={formData.siteStartDate || ''}
                  readOnly
                  style={{ background: '#e6f7ff' }}
                />
              </label>

              <label>
                <span>Site End Date</span>
                <input
                  type="date"
                  value={formData.siteEndDate || ''}
                  readOnly
                  style={{ background: '#e6f7ff' }}
                />
              </label>
            </div>
            
            <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#6c757d' }}>
              <p>ℹ️ This information is automatically loaded from your Daily Target Report.</p>
              <p>ℹ️ All this data will be included with your hourly session reports.</p>
            </div>
          </div>
        )}

        {/* Session Reports - Only show when not editing */}
        {!editingReport && (
          <div style={{ marginTop: '2rem' }}>
            <h3 style={{ color: '#092544', marginBottom: '1rem' }}>New Session Reports (9am - 6pm)</h3>
            <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Current active session: <strong>{currentActivePeriod || 'None'}</strong><br/>
              You can fill and submit reports during each 3-hour session or up to 30 minutes after it ends.
            </p>

            {formData.hourlyEntries.map((entry, index) => {
              const periodKey = entry.periodName.toLowerCase().replace(' session', '')
              const currentSessionStatus = sessionStatus[periodKey]
              const canEdit = currentSessionStatus?.canEdit || false
              const isSubmitted = currentSessionStatus?.status === 'submitted'
              const isActive = currentSessionStatus?.status === 'active'

              if (isSubmitted) {
                return null // Don't show form for submitted sessions
              }

              return (
                <div
                  key={index}
                  style={{
                    border: `1px solid ${isActive ? '#2ad1ff' : '#d5e0f2'}`,
                    borderRadius: '12px',
                    padding: '1.5rem',
                    marginBottom: '1.5rem',
                    background: isActive ? '#f0f9ff' : '#f9f9f9',
                    opacity: canEdit ? 1 : 0.7
                  }}
                >
                  <h4 style={{
                    color: '#092544',
                    marginBottom: '1rem',
                    marginTop: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    {entry.periodName} ({entry.timePeriod})
                    {isActive && (
                      <span style={{
                        background: '#2ad1ff',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.8rem'
                      }}>
                        ACTIVE - Fill now
                      </span>
                    )}
                    {!canEdit && (
                      <span style={{
                        background: '#ff7a7a',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.8rem'
                      }}>
                        LOCKED
                      </span>
                    )}
                  </h4>

                  <div className="vh-grid">
                    <label className="vh-span-2">
                      <span>Session Activity (What you did) *</span>
                      <textarea
                        rows={3}
                        value={entry.hourlyActivity}
                        onChange={(e) => handleHourlyEntryChange(index, 'hourlyActivity', e.target.value)}
                        placeholder={
                          canEdit
                            ? `Describe your activities during ${entry.timePeriod}...`
                            : `Can only fill during ${entry.timePeriod}`
                        }
                        required
                        disabled={!canEdit}
                      />
                      <small style={{ color: '#6c757d', display: 'block', marginTop: '0.25rem' }}>
                        Describe the work you performed in this session
                      </small>
                    </label>

                    <label className="vh-span-2">
                      <span>Session Achievement (What you accomplished) *</span>
                      <textarea
                        rows={3}
                        value={entry.hourlyAchieved}
                        onChange={(e) => handleHourlyEntryChange(index, 'hourlyAchieved', e.target.value)}
                        placeholder={
                          canEdit
                            ? `What did you actually achieve in ${entry.timePeriod}?`
                            : `Can only fill during ${entry.timePeriod}`
                        }
                        required
                        disabled={!canEdit}
                      />
                      <small style={{ 
                        color: entry.hourlyAchieved ? '#06c167' : '#6c757d', 
                        display: 'block', 
                        marginTop: '0.25rem' 
                      }}>
                        {entry.hourlyAchieved ? '✓ Contributes to Daily Target Achieved' : 'Fill this to contribute to Daily Target Achieved'}
                      </small>
                    </label>

                    <label className="vh-span-2">
                      <span>Problems Faced During Session</span>
                      <textarea
                        rows={2}
                        value={entry.problemFacedByEngineerHourly}
                        onChange={(e) => handleHourlyEntryChange(index, 'problemFacedByEngineerHourly', e.target.value)}
                        placeholder="Describe any problems faced during this session..."
                        disabled={!canEdit}
                      />
                    </label>

                    <label>
                      <span>Problem Resolved or Not</span>
                      <select
                        value={entry.problemResolvedOrNot}
                        onChange={(e) => handleHourlyEntryChange(index, 'problemResolvedOrNot', e.target.value)}
                        disabled={!canEdit}
                      >
                        <option value="">Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </label>

                    {entry.problemResolvedOrNot === 'Yes' && (
                      <>
                        <label>
                          <span>Problem Occur Start Time *</span>
                          <input
                            type="time"
                            value={entry.problemOccurStartTime}
                            onChange={(e) => handleHourlyEntryChange(index, 'problemOccurStartTime', e.target.value)}
                            disabled={!canEdit}
                            required
                          />
                        </label>

                        <label>
                          <span>Problem Resolved End Time *</span>
                          <input
                            type="time"
                            value={entry.problemResolvedEndTime}
                            onChange={(e) => handleHourlyEntryChange(index, 'problemResolvedEndTime', e.target.value)}
                            disabled={!canEdit}
                            required
                          />
                        </label>

                        <label className="vh-span-2">
                          <span>Online Support Required for Which Problem</span>
                          <textarea
                            rows={2}
                            value={entry.onlineSupportRequiredForWhichProblem}
                            onChange={(e) => handleHourlyEntryChange(index, 'onlineSupportRequiredForWhichProblem', e.target.value)}
                            placeholder="Describe which problem required online support..."
                            disabled={!canEdit}
                          />
                        </label>

                        {entry.onlineSupportRequiredForWhichProblem && (
                          <>
                            <label>
                              <span>Online Support Time *</span>
                              <input
                                type="time"
                                value={entry.onlineSupportTime}
                                onChange={(e) => handleHourlyEntryChange(index, 'onlineSupportTime', e.target.value)}
                                disabled={!canEdit}
                                required
                              />
                            </label>

                            <label>
                              <span>Online Support End Time *</span>
                              <input
                                type="time"
                                value={entry.onlineSupportEndTime}
                                onChange={(e) => handleHourlyEntryChange(index, 'onlineSupportEndTime', e.target.value)}
                                disabled={!canEdit}
                                required
                              />
                            </label>

                            <label className="vh-span-2">
                              <span>Engineer Name Who Gives Online Support *</span>
                              <input
                                type="text"
                                value={entry.engineerNameWhoGivesOnlineSupport}
                                onChange={(e) => handleHourlyEntryChange(index, 'engineerNameWhoGivesOnlineSupport', e.target.value)}
                                placeholder="Enter engineer name providing support"
                                disabled={!canEdit}
                                required
                              />
                            </label>
                          </>
                        )}
                      </>
                    )}

                    <label className="vh-span-2">
                      <span>Engineer Remark</span>
                      <textarea
                        rows={2}
                        value={entry.engineerRemark}
                        onChange={(e) => handleHourlyEntryChange(index, 'engineerRemark', e.target.value)}
                        placeholder="Additional remarks from engineer..."
                        disabled={!canEdit}
                      />
                    </label>

                    <label className="vh-span-2">
                      <span>Project Incharge Remark</span>
                      <textarea
                        rows={2}
                        value={entry.projectInchargeRemark}
                        onChange={(e) => handleHourlyEntryChange(index, 'projectInchargeRemark', e.target.value)}
                        placeholder="Remarks from project incharge..."
                        disabled={!canEdit}
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Form Actions - Only show when not editing */}
        {!editingReport && (
          <div className="vh-form-actions">
            <button 
              type="submit" 
              disabled={submitting || !formData.projectName || !currentActivePeriod}
              style={{
                position: 'relative'
              }}
            >
              {submitting ? 'Saving…' : (
                <>
                  Submit {currentActivePeriod || 'Session'} Report
                  {(!formData.projectName || !currentActivePeriod) && (
                    <span style={{
                      position: 'absolute',
                      top: '-25px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#ff7a7a',
                      color: 'white',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap'
                    }}>
                      {!formData.projectName ? '⚠️ Select a daily report first' : '⚠️ Only active sessions can be submitted'}
                    </span>
                  )}
                </>
              )}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setFormData(defaultPayload())}
              disabled={submitting}
            >
              Reset form
            </button>
          </div>
        )}
      </form>
    </section>
  )
}

export default HourlyReportForm
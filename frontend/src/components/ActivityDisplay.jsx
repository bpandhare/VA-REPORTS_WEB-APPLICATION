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
  const [activeTab, setActiveTab] = useState('summary')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [hourlyReports, setHourlyReports] = useState([])
  const [hourlyModalOpen, setHourlyModalOpen] = useState(false)
  const [selectedHourlyReport, setSelectedHourlyReport] = useState(null)
  const [editingHourlyReport, setEditingHourlyReport] = useState(null)
  
  const hasFetchedInitial = useRef(false)
  
  // Get base URL from environment
  const API_BASE = useMemo(() => {
    const envUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    return envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl
  }, [])

  // Define endpoints - ADDED HOURLY REPORTS ENDPOINTS
 // Replace these endpoints in your endpoints object:
const endpoints = useMemo(() => ({
  activities: `${API_BASE}/api/activity/activities`,
  stats: `${API_BASE}/api/activity/stats`,
  dateSummary: `${API_BASE}/api/activity/date-summary`,
  availableDates: `${API_BASE}/api/activity/available-dates`,
  attendance: `${API_BASE}/api/daily-target/attendance`,
  attendanceAll: `${API_BASE}/api/daily-target/attendance-all`,
  engineer: `${API_BASE}/api/activity/engineer`,
  profile: `${API_BASE}/api/auth/profile`,
  currentUser: `${API_BASE}/api/daily-target/current-user`,
  employees: `${API_BASE}/api/daily-target/employees`,
  
  // Hourly Reports Endpoints (using hourly-report route)
  hourlyReports: `${API_BASE}/api/hourly-report/all`, 
  hourlyReportById: `${API_BASE}/api/hourly-report/id`,
  updateHourlyReport: `${API_BASE}/api/hourly-report`,
}), [API_BASE])

  // Debug endpoints
  useEffect(() => {
    console.log('🔧 API Endpoints:', endpoints)
  }, [endpoints])

  // Initial data fetch
  useEffect(() => {
    if (!user || !token) return;
    
    console.log('🚀 Fetching data...', { user: user?.username, refreshTrigger })
    
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        await fetchAvailableDates()
        await Promise.all([
          fetchDateSummary(selectedDate),
          fetchAttendanceData(selectedDate),
          fetchRecentActivities(),
          fetchHourlyReports(selectedDate) // NEW: Fetch hourly reports
        ])
      } catch (err) {
        console.error('❌ Initial load failed:', err)
        setError('Failed to load initial data. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
  }, [user, token, selectedDate, refreshTrigger])

  // Listen for hourly report edits from HourlyReportForm via localStorage
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'hourlyReportEdited') {
        console.log('📢 Hourly report edited detected, triggering refresh...')
        triggerRefresh()
        localStorage.removeItem('hourlyReportEdited')
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Watch for editingHourlyReport changes to debug state updates
  useEffect(() => {
    if (editingHourlyReport) {
      console.log('🎯 editingHourlyReport state updated:')
      console.log('   Engineer:', editingHourlyReport.engineerName)
      console.log('   Activities:', editingHourlyReport.activities?.length || 0)
      console.log('   Modal should show EDIT form now')
    } else {
      console.log('⬜ editingHourlyReport is NULL - showing VIEW form')
    }
  }, [editingHourlyReport])

  // Function to trigger refresh
  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  // NEW: Fetch hourly reports for selected date
  const fetchHourlyReports = async (date, options = {}) => {
    if (!token) return;
    
    try {
      console.log(`📊 Fetching hourly reports for: ${date}`)
      console.log(`👤 User role: ${user?.role}`)
      
      // Determine which endpoint to use based on user role
      const isManager = user?.role && (user.role.toLowerCase().includes('manager') || 
                       user.role.toLowerCase().includes('team leader') || 
                       user.role.toLowerCase().includes('group leader'))
      
      // Use all reports endpoint for managers, personal endpoint for employees
      const endpoint = isManager 
        ? `${endpoints.hourlyReports}/${date}`
        : `${API_BASE}/api/hourly-report/${date}`
      
      console.log(`📡 Using endpoint: ${endpoint}`)
      console.log(`👨‍💼 Access level: ${isManager ? 'Manager (All Reports)' : 'Employee (Own Reports)'}`)
      
      const response = await fetch(endpoint, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Hourly reports error:', errorText)
        
        if (response.status === 404) {
          console.log(`📭 No hourly reports found for ${date}`)
          setHourlyReports([])
          return
        }
        throw new Error(`Server error: ${response.status}`)
      }
      
      const data = await response.json()
      console.log(`✅ Raw hourly reports response:`, data)
      
      // Helper function to parse unplanned activities from hourly_activity text
      const parseUnplannedActivities = (hourlyActivityText) => {
        const unplanned = []
        if (!hourlyActivityText) return unplanned
        
        const lines = hourlyActivityText.split('\n')
        let inUnplannedSection = false
        
        for (const line of lines) {
          if (line.includes('--- Other/Unplanned Activities ---')) {
            inUnplannedSection = true
            continue
          }
          
          if (inUnplannedSection && line.trim()) {
            // Parse unplanned activity format: [UNPLANNED X] Activity (Reason: xxx) [Priority: yyy]
            const match = line.match(/\[UNPLANNED \d+\]\s+(.+?)(?:\s*\(Reason:\s*(.+?)\))?(?:\s*\[Priority:\s*(.+?)\])?$/)
            if (match) {
              unplanned.push({
                activity: match[1].trim(),
                reason: match[2] ? match[2].trim() : '',
                priority: match[3] ? match[3].trim() : 'Normal'
              })
            } else if (line.trim() && !line.startsWith('---')) {
              // If it's just a line without the format, treat it as an activity
              unplanned.push({
                activity: line.trim(),
                reason: '',
                priority: 'Normal'
              })
            }
          }
        }
        
        return unplanned
      }
      
      // Handle different response formats
      let reportsArray = []
      if (Array.isArray(data)) {
        reportsArray = data
      } else if (data.reports && Array.isArray(data.reports)) {
        reportsArray = data.reports
      } else if (data.success && Array.isArray(data.data)) {
        reportsArray = data.data
      }
      
      console.log(`📊 Found ${reportsArray.length} raw hourly report entries`)

      // If server returned no reports but caller asked to preserve existing data, do nothing
      if ((reportsArray.length === 0 || !reportsArray) && options.preserveIfEmpty) {
        console.log('ℹ️ No reports returned but preserveIfEmpty=true — keeping existing hourlyReports')
        return
      }
      
      // Helper: convert time string like '9am-1pm' or '09:00-13:00' to minutes difference
      const parseTimeToken = (tok) => {
        if (!tok) return null
        tok = tok.trim().toLowerCase()
        // Handle formats like '09:30' or '9:30'
        let m = tok.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
        if (m) {
          let hh = parseInt(m[1], 10)
          const mm = parseInt(m[2] || '0', 10)
          const ampm = m[3]
          if (ampm) {
            if (ampm === 'pm' && hh !== 12) hh += 12
            if (ampm === 'am' && hh === 12) hh = 0
          }
          return hh * 60 + mm
        }

        // Handle '9am' or '1pm' already matched, otherwise try 24h HH:MM-HH:MM split
        return null
      }

      const parseDailyTargetRangeMinutes = (dailyTarget) => {
        if (!dailyTarget) return null
        // Try to find two time tokens separated by - or to
        const parts = dailyTarget.split(/[-–—to]+/i).map(p => p.trim()).filter(Boolean)
        if (parts.length >= 2) {
          const start = parseTimeToken(parts[0])
          const end = parseTimeToken(parts[1])
          if (start != null && end != null) {
            const diff = end - start
            if (diff >= 0) return diff
            // handle overnight
            return (24 * 60 - start) + end
          }
        }

        // Try pattern HH:MM-HH:MM directly
        const match = dailyTarget.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/)
        if (match) {
          const [sh, sm] = match[1].split(':').map(Number)
          const [eh, em] = match[2].split(':').map(Number)
          const start = sh * 60 + sm
          const end = eh * 60 + em
          return end >= start ? end - start : (24 * 60 - start) + end
        }

        return null
      }

      const isAchieved = (val) => {
        if (val === true) return true
        if (!val) return false
        const s = String(val).toLowerCase()
        return s === 'yes' || s === 'true' || s === 'achieved' || s === 'completed' || s === 'done' || s === '1'
      }

      if (isManager) {
        // For managers: Group reports by user
        const groupedByUser = {}
        reportsArray.forEach((report) => {
          const userId = report.user_id || `user-${report.employee_name}`
          if (!groupedByUser[userId]) {
            groupedByUser[userId] = {
              id: report.id || `report-${userId}`,
              user_id: report.user_id,
              engineerName: report.employee_name || report.username || 'Unknown',
              employeeId: report.employee_id || 'N/A',
              submittedAt: report.created_at || report.report_date,
              createdAt: report.created_at,
              editedAt: report.edited_at || null,
              editedBy: report.edited_by || null,
              activities: [],
              unplannedActivities: [],
              totalHours: 0,
              isEditable: true // Managers can edit
            }
          }
          
          // Parse unplanned activities from hourly_activity field
          const unplanned = parseUnplannedActivities(report.hourly_activity)
          if (unplanned.length > 0 && groupedByUser[userId].unplannedActivities.length === 0) {
            groupedByUser[userId].unplannedActivities = unplanned
          }
          
          // Add this entry as an activity
          groupedByUser[userId].activities.push({
            id: report.id,
            timePeriod: report.time_period,
            activity: report.hourly_activity,
            problem: report.problem_faced_by_engineer_hourly,
            resolved: report.problem_resolved_or_not,
            projectName: report.project_name,
            dailyTarget: report.daily_target,
            targetAchieved: report.target_achieved || 'not-decided',
            achievementReason: report.achievement_reason || '',
            reportDate: report.report_date,
            createdAt: report.created_at
          })
          
          groupedByUser[userId].totalHours++
        })
        
        // Convert to array and compute status/totalHours
        const processedReports = Object.values(groupedByUser).map(report => {
          // Determine if all planned activities achieved
          const allAchieved = (report.activities || []).length > 0 && (report.activities || []).every(a => isAchieved(a.targetAchieved))

          // Try compute total hours from report.dailyTarget or activities' dailyTarget
          let minutes = null
          minutes = parseDailyTargetRangeMinutes(report.dailyTarget || report.daily_target)
          if (minutes == null) {
            // fallback: look into activities
            for (const a of report.activities || []) {
              minutes = parseDailyTargetRangeMinutes(a.dailyTarget || a.daily_target)
              if (minutes != null) break
            }
          }

          const totalHours = minutes != null ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${report.totalHours}h`

          return {
            ...report,
            totalHours,
            status: allAchieved ? 'COMPLETED' : 'IN PROGRESS'
          }
        })
        
        setHourlyReports(processedReports)
        console.log(`✅ Manager view: ${processedReports.length} unique engineers`)
      } else {
        // For employees: Show their own reports grouped by date/time_period
        const groupedByPeriod = {}
        reportsArray.forEach((report) => {
          const periodKey = report.time_period || 'General'
          if (!groupedByPeriod[periodKey]) {
            groupedByPeriod[periodKey] = {
              id: report.id || `report-${periodKey}`,
              user_id: report.user_id,
              engineerName: user?.username || 'You',
              employeeId: user?.employee_id || user?.employeeId || 'N/A',
              submittedAt: report.created_at || report.report_date,
              createdAt: report.created_at,
              editedAt: report.edited_at || null,
              editedBy: report.edited_by || null,
              timePeriod: periodKey,
              activities: [],
              unplannedActivities: [],
              totalHours: 0,
              isEditable: true // Employees can edit their own
            }
          }
          
          // Parse unplanned activities from hourly_activity field
          const unplanned = parseUnplannedActivities(report.hourly_activity)
          if (unplanned.length > 0 && groupedByPeriod[periodKey].unplannedActivities.length === 0) {
            groupedByPeriod[periodKey].unplannedActivities = unplanned
          }
          
          groupedByPeriod[periodKey].activities.push({
            id: report.id,
            timePeriod: report.time_period,
            activity: report.hourly_activity,
            problem: report.problem_faced_by_engineer_hourly,
            resolved: report.problem_resolved_or_not,
            projectName: report.project_name,
            dailyTarget: report.daily_target,
            targetAchieved: report.target_achieved || 'not-decided',
            achievementReason: report.achievement_reason || '',
            reportDate: report.report_date,
            createdAt: report.created_at
          })
          
          groupedByPeriod[periodKey].totalHours++
        })
        
        const processedReports = Object.values(groupedByPeriod).map(report => {
          const allAchieved = (report.activities || []).length > 0 && (report.activities || []).every(a => isAchieved(a.targetAchieved))

          let minutes = null
          minutes = parseDailyTargetRangeMinutes(report.dailyTarget || report.daily_target)
          if (minutes == null) {
            for (const a of report.activities || []) {
              minutes = parseDailyTargetRangeMinutes(a.dailyTarget || a.daily_target)
              if (minutes != null) break
            }
          }

          const totalHours = minutes != null ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${report.totalHours}h`

          return {
            ...report,
            totalHours,
            status: allAchieved ? 'COMPLETED' : 'IN PROGRESS'
          }
        })
        
        setHourlyReports(processedReports)
        console.log(`✅ Employee view: ${processedReports.length} time periods with ${reportsArray.length} total entries`)
      }
    } catch (err) {
      console.error('❌ Error fetching hourly reports:', err)
      setHourlyReports([])
    }
  }

  // NEW: View hourly report details
  const viewHourlyReport = async (reportOrId, engineerName) => {
    // If an object with activities is passed, use it directly
    if (reportOrId && typeof reportOrId === 'object' && reportOrId.activities) {
      console.log('✅ Viewing report object:', reportOrId.engineerName, 'with', reportOrId.activities.length, 'activities')
      setSelectedHourlyReport(reportOrId)
      setHourlyModalOpen(true)
      return
    }

    // If an id (number/string) is passed, fetch that report from the API
    const id = reportOrId
    if (!id) {
      setError('Report data not found')
      return
    }

    try {
      console.log('📡 Fetching hourly report by id:', id)
      const res = await fetch(`${endpoints.hourlyReportById}/${id}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      })
      if (!res.ok) {
        const txt = await res.text()
        console.error('❌ Failed to fetch report by id:', txt)
        setError('Failed to fetch report details')
        return
      }
      const data = await res.json()
      // API may return report object as data or data.report
      const report = data.report || data || null
      if (!report) {
        setError('Report not found')
        return
      }
      // If API doesn't include engineerName, use provided engineerName
      if (!report.engineerName && engineerName) report.engineerName = engineerName
      setSelectedHourlyReport(report)
      setHourlyModalOpen(true)
    } catch (err) {
      console.error('❌ Error fetching report by id:', err)
      setError('Failed to fetch report details')
    }
  }

  // NEW: Start editing hourly report
  const startEditHourlyReport = (report) => {
    console.log('📋 Starting edit for report:', report)
    console.log('📋 Report activities:', report.activities)
    if (!report || !report.activities) {
      console.error('❌ Report or activities missing:', report)
      setError('Report data is incomplete')
      return
    }
    console.log('🔄 Setting editingHourlyReport state now...')
    setEditingHourlyReport({
      ...report,
      activities: [...report.activities]
    })
    console.log('✅ Edit mode activated, editingHourlyReport state set')
    // Ensure modal is open when edit is started (cover Edit from table and View->Edit paths)
    setHourlyModalOpen(true)
    // Force a small delay to ensure React re-renders
    setTimeout(() => {
      console.log('✅ Edit mode should be visible now')
    }, 100)
  }

  // NEW: Update hourly report activity
  const updateHourlyActivity = (index, field, value) => {
    if (!editingHourlyReport) return;
    
    setEditingHourlyReport(prev => {
      const updatedActivities = [...prev.activities]
      if (updatedActivities[index]) {
        updatedActivities[index] = {
          ...updatedActivities[index],
          [field]: value
        }
      }
      return {
        ...prev,
        activities: updatedActivities
      }
    })
  }

  // NEW: Add new activity row
  const addNewActivity = () => {
    if (!editingHourlyReport) return;
    
    setEditingHourlyReport(prev => ({
      ...prev,
      activities: [
        ...prev.activities,
        {
          timePeriod: '',
          activity: '',
          problem: '',
          resolved: 'no',
          projectName: prev.projectName || prev.project_name || prev.dailyTarget || '',
          dailyTarget: prev.dailyTarget || prev.daily_target || 'not-decided',
          reportDate: selectedDate
        }
      ]
    }))
  }

  // NEW: Remove activity row
  const removeActivity = (index) => {
    if (!editingHourlyReport) return;
    
    setEditingHourlyReport(prev => ({
      ...prev,
      activities: prev.activities.filter((_, i) => i !== index)
    }))
  }

  // NEW: Save edited hourly report
  const saveHourlyReport = async () => {
    if (!editingHourlyReport || !token) return;
    
    try {
      setLoading(true)
      
      // Helper: Convert ISO date to YYYY-MM-DD for database
      const formatDateForDB = (dateStr) => {
        if (!dateStr) return new Date().toISOString().split('T')[0]
        try {
          const d = new Date(dateStr)
          return d.toISOString().split('T')[0]
        } catch (e) {
          return dateStr.split('T')[0] // Already in YYYY-MM-DD format
        }
      }
      
      // Validate that we have activities with data to update
      if (!editingHourlyReport.activities || editingHourlyReport.activities.length === 0) {
        setError('No activities to save.')
        return
      }
      
      // Validate that required fields are filled
      const emptyActivities = editingHourlyReport.activities.filter(a => !a.timePeriod || !a.activity)
      if (emptyActivities.length > 0) {
        const missingFields = emptyActivities.map((a, idx) => {
          const missing = []
          if (!a.timePeriod) missing.push('Time Period')
          if (!a.activity) missing.push('Activity')
          return `Activity ${editingHourlyReport.activities.indexOf(a) + 1}: ${missing.join(', ')}`
        }).join('; ')
        setError(`Please fill all required fields: ${missingFields}`)
        return
      }
      
      // Separate activities into updates (with ID) and creates (without ID)
      const activitiesToUpdate = editingHourlyReport.activities.filter(a => a.id)
      const activitiesToCreate = editingHourlyReport.activities.filter(a => !a.id)
      
      console.log(`📝 Saving: ${activitiesToUpdate.length} updates, ${activitiesToCreate.length} new activities`)
      
      // Before creating new activities, check for conflicting reports already present in hourlyReports
      const formatDateForCompare = (d) => {
        if (!d) return ''
        try {
          return new Date(d).toISOString().split('T')[0]
        } catch { return d }
      }

      const findConflictingReport = (activity) => {
        const actDate = formatDateForCompare(activity.reportDate || selectedDate)
        for (const group of (hourlyReports || [])) {
          const groupMatchesUser = (editingHourlyReport.user_id && group.user_id && group.user_id === editingHourlyReport.user_id) ||
                                   (editingHourlyReport.engineerName && group.engineerName && group.engineerName === editingHourlyReport.engineerName)
          if (!group.activities || group.activities.length === 0) continue
          for (const act of group.activities) {
            const gDate = formatDateForCompare(act.reportDate || group.reportDate || selectedDate)
            if (act.timePeriod === activity.timePeriod && gDate === actDate && groupMatchesUser) {
              return group
            }
          }
        }
        return null
      }

      // Check for conflicts and abort with clear message if any
      const conflicts = []
      activitiesToCreate.forEach(a => {
        const conflictGroup = findConflictingReport(a)
        if (conflictGroup) conflicts.push({ activity: a, group: conflictGroup })
      })

      if (conflicts.length > 0) {
        console.warn('❗ Conflicting hourly report(s) detected:', conflicts)
        const first = conflicts[0]
        const msg = `Another hourly report already exists for ${first.activity.timePeriod} on ${first.activity.reportDate || selectedDate}. Please edit that report instead.`
        setError(msg)
        // Open existing report for editing to help the user
        try {
          startEditHourlyReport(first.group)
        } catch (e) {
          console.warn('Failed to open conflicting report for edit:', e)
        }
        setLoading(false)
        return
      }

      // Handle updates (existing activities with IDs)
      const updatePromises = activitiesToUpdate.map(async (activity) => {
        const updateData = {
          reportDate: formatDateForDB(activity.reportDate || selectedDate),
          timePeriod: activity.timePeriod || '',
          projectName: activity.projectName || activity.project_name || '',
          dailyTarget: activity.dailyTarget || editingHourlyReport.dailyTarget || '',
          hourlyActivity: activity.activity || activity.hourlyActivity || '',
          problem_faced_by_engineer_hourly: activity.problem || activity.problemFaced || '',
          problem_resolved_or_not: activity.resolved || activity.problemResolvedOrNot || 'no',
          edited_at: new Date().toISOString(),
          edited_by: user?.username || user?.name || user?.id || 'Unknown'
        }
        
        const response = await fetch(`${endpoints.updateHourlyReport}/${activity.id}`, {
          method: 'PUT',
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateData)
        })
        
        if (!response.ok) {
          const errText = await response.text()
          console.error('❌ Activity update failed:', errText)
          throw new Error(`Failed to update activity: ${errText}`)
        }
        
        return response.json()
      })
      
      // Handle creates (new activities without IDs)
      const createPromises = activitiesToCreate.map(async (activity) => {
        // Ensure required fields exist; backend validates projectName and dailyTarget
        const projectNameVal = activity.projectName || activity.project_name || editingHourlyReport.projectName || editingHourlyReport.project_name || 'N/A'
        const dailyTargetVal = activity.dailyTarget || editingHourlyReport.dailyTarget || editingHourlyReport.daily_target || 'not-decided'

        if (!activity.projectName && !activity.project_name && !editingHourlyReport.projectName && !editingHourlyReport.project_name) {
          console.warn('⚠️ create activity missing projectName; using fallback "N/A"')
        }
        if (!activity.dailyTarget && !editingHourlyReport.dailyTarget && !editingHourlyReport.daily_target) {
          console.warn('⚠️ create activity missing dailyTarget; using fallback "not-decided"')
        }

        const createData = {
          reportDate: formatDateForDB(activity.reportDate || selectedDate),
          timePeriod: activity.timePeriod || '',
          projectName: projectNameVal,
          dailyTarget: dailyTargetVal,
          hourlyActivity: activity.activity || activity.hourlyActivity || '',
          problem_faced_by_engineer_hourly: activity.problem || activity.problemFaced || '',
          problem_resolved_or_not: activity.resolved || activity.problemResolvedOrNot || 'no',
          user_id: editingHourlyReport.user_id,
          employee_id: editingHourlyReport.employeeId,
          employee_name: editingHourlyReport.engineerName
        }
        
        const response = await fetch(endpoints.updateHourlyReport, {
          method: 'POST',
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(createData)
        })
        
        if (!response.ok) {
          const errText = await response.text()
          console.error('❌ Activity create failed:', errText)
          throw new Error(`Failed to create activity: ${errText}`)
        }
        
        return response.json()
      })
      
      // Execute all updates and creates in parallel
      const allPromises = [...updatePromises, ...createPromises]
      const results = await Promise.all(allPromises)
      console.log('✅ All activities saved:', results)
      
      // Refresh data - wait for fetch to complete before using new data
      console.log('🔄 Refreshing hourly reports for date:', selectedDate)
      await fetchHourlyReports(selectedDate, { preserveIfEmpty: true })
      await fetchAttendanceData(selectedDate)
      
      // Wait a moment for state to update
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // After refresh, the hourlyReports state should be updated
      // Force re-fetch to get fresh data
      const reportDate = editingHourlyReport?.reportDate || selectedDate
      const isDateDifferent = reportDate !== selectedDate

      // Keep a copy of editing info before clearing state so we can broadcast reliably
      const savedEditing = { ...(editingHourlyReport || {}) }

      // Optimistic UI update: mark the report as edited in local state so it remains visible
      try {
        const nowISO = new Date().toISOString()
        const editorName = user?.username || user?.name || 'Unknown'
        const updatedForUI = {
          ...savedEditing,
          editedAt: nowISO,
          editedBy: editorName
        }

        // Update selectedHourlyReport if modal is showing this report
        setSelectedHourlyReport(prev => {
          if (!prev) return prev
          if (prev.id && savedEditing.id && prev.id === savedEditing.id) return { ...prev, ...updatedForUI }
          if (prev.user_id && savedEditing.user_id && prev.user_id === savedEditing.user_id) return { ...prev, ...updatedForUI }
          return prev
        })

        // Update hourlyReports list
        setHourlyReports(prev => {
          if (!Array.isArray(prev)) return prev
          return prev.map(r => {
            if (savedEditing.id && r.id && r.id === savedEditing.id) {
              return { ...r, editedAt: nowISO, editedBy: editorName }
            }
            if (savedEditing.user_id && r.user_id && r.user_id === savedEditing.user_id) {
              return { ...r, editedAt: nowISO, editedBy: editorName }
            }
            if (savedEditing.employeeId && r.employeeId && r.employeeId === savedEditing.employeeId) {
              return { ...r, editedAt: nowISO, editedBy: editorName }
            }
            return r
          })
        })
      } catch (uiErr) {
        console.warn('⚠️ Optimistic UI update failed:', uiErr)
      }

      // 🔥 CRITICAL: Notify ManagerDashboard to refresh via localStorage
      console.log('📢 Broadcasting hourly report update to ManagerDashboard...')
      localStorage.setItem('hourlyReportEdited', JSON.stringify({
        timestamp: Date.now(),
        reportDate: reportDate,
        userId: savedEditing?.user_id,
        reportId: savedEditing?.id
      }))

      setEditingHourlyReport(null)
      
      // Show success message with date info
      if (isDateDifferent) {
        const switchDate = window.confirm(
          `✅ Report updated successfully!\n\n` +
          `This report is for ${reportDate}, but you're viewing ${selectedDate}.\n\n` +
          `Click OK to view the updated report on ${reportDate}.`
        )
        if (switchDate) {
          setSelectedDate(reportDate)
        }
      } else {
        alert('✅ Report updated successfully!')
      }
      
      // Clear modal and selection to ensure fresh state
      setHourlyModalOpen(false)
      setSelectedHourlyReport(null)
      
      setError(null)
    } catch (err) {
      console.error('❌ Error saving report:', err)

      // Try to parse JSON error body if backend returned JSON string
      let parsed = null
      try {
        if (typeof err === 'string') parsed = JSON.parse(err)
        else if (err && err.message) {
          // sometimes err.message contains JSON
          try { parsed = JSON.parse(err.message) } catch(_) { parsed = null }
        }
      } catch (e) {
        parsed = null
      }

      // Handle specific conflict message from backend: Another hourly report already exists for <period> on <date>
      const conflictMsg = (parsed && parsed.message) || (err && err.message) || ''
      const conflictMatch = conflictMsg.match(/Another hourly report already exists for\s+([^\s]+)\s+on\s+(\d{4}-\d{2}-\d{2})/i)
      if (conflictMatch) {
        const conflictPeriod = conflictMatch[1]
        const conflictDate = conflictMatch[2]
        console.warn('⚠️ Backend reports conflict:', { conflictPeriod, conflictDate })

        setError(`A report already exists for ${conflictPeriod} on ${conflictDate}. Opening that report for edit.`)

        try {
          // Refresh reports for the conflicting date (preserve if server returns empty)
          await fetchHourlyReports(conflictDate, { preserveIfEmpty: true })

          // Try to find the conflicting group in hourlyReports
          const found = (hourlyReports || []).find(g => {
            if (!g.activities) return false
            // match by timePeriod and date inside activities
            return g.activities.some(a => {
              const aDate = (a.reportDate || a.report_date || conflictDate).split('T')[0]
              return String(a.timePeriod || a.time_period || '').toLowerCase() === String(conflictPeriod).toLowerCase() && aDate === conflictDate
            })
          })

          if (found) {
            // Open existing report in edit mode
            startEditHourlyReport(found)
          } else {
            console.warn('⚠️ Could not locate conflicting report in refreshed hourlyReports')
          }
        } catch (e) {
          console.error('❌ Error handling conflict:', e)
        }

        setLoading(false)
        return
      }

      // Generic error handling
      setError(`Failed to save changes: ${conflictMsg || (err && err.message) || String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  // NEW: Calculate total hours
  const calculateTotalHours = (activities) => {
    let totalMinutes = 0
    
    activities.forEach(activity => {
      if (activity.startTime && activity.endTime) {
        const start = timeToMinutes(activity.startTime)
        const end = timeToMinutes(activity.endTime)
        if (end > start) {
          totalMinutes += (end - start)
        }
      }
    })
    
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}h ${minutes}m`
  }

  // Helper: Convert time to minutes
  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + (minutes || 0)
  }

  // Helper: Format time for API
  const formatTimeForAPI = (timeStr) => {
    // Ensure time is in HH:MM format
    if (!timeStr.includes(':')) return '00:00'
    
    const [hours, minutes] = timeStr.split(':')
    return `${hours.padStart(2, '0')}:${(minutes || '00').padStart(2, '0')}`
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
        setDateSummary(data)
        console.log(`✅ Date summary fetched for ${date}`)
      }
    } catch (err) {
      console.error('❌ Error fetching date summary:', err)
      setDateSummary(null)
    }
  }

  // Fetch attendance data
  const fetchAttendanceData = async (date) => {
    if (!token) return;
    
    try {
      console.log(`👥 Fetching attendance for: ${date}`)
      
      const endpoint = (user?.role === 'Manager' || user?.role === 'Team Leader') 
        ? `${endpoints.attendanceAll}/${date}` 
        : `${endpoints.attendance}/${date}`;
      
      console.log(`🔍 Using endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
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
          setAttendanceData({
            success: true,
            date: date,
            summary: {
              total: 0,
              present: 0,
              absent: 0,
              on_leave: 0,
              pending_approval: 0
            },
            attendance: []
          });
          return;
        }
        throw new Error(`Server error: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.success === false) {
        console.warn(`⚠️ API error: ${data.message}`)
        setAttendanceData({
          success: true,
          date: date,
          summary: {
            total: 0,
            present: 0,
            absent: 0,
            on_leave: 0,
            pending_approval: 0
          },
          attendance: []
        });
      } else {
        const processedData = processAttendanceData(data, date);
        setAttendanceData(processedData);
        console.log(`✅ Attendance data fetched for ${date}`, processedData.summary);
      }
    } catch (err) {
      console.error('❌ Error fetching attendance:', err)
      setAttendanceData({
        success: false,
        date: date,
        summary: {
          total: 0,
          present: 0,
          absent: 0,
          on_leave: 0,
          pending_approval: 0
        },
        attendance: [],
        error: err.message
      });
    }
  }

  // Process attendance data
  const processAttendanceData = (data, date) => {
    console.log(`🔄 Processing attendance data for ${date}`, data);
    
    if (user?.role === 'Manager' || user?.role === 'Team Leader') {
      return processManagerAttendance(data, date);
    } else {
      return processUserAttendance(data, date);
    }
  }

  // Process manager attendance data
  const processManagerAttendance = (data, date) => {
    if (!data.attendance || !Array.isArray(data.attendance)) {
      return {
        success: true,
        date: date,
        summary: data.summary || {
          total: 0,
          present: 0,
          absent: 0,
          on_leave: 0,
          pending_approval: 0
        },
        attendance: [],
        presentEmployees: [],
        absentEmployees: [],
        leaveEmployees: [],
        activities: []
      };
    }
    
    const presentEmployees = [];
    const absentEmployees = [];
    const leaveEmployees = [];
    const onTimeEmployees = [];
    const activities = [];
    
    data.attendance.forEach(record => {
      const employeeName = record.userName || record.username || 'Unknown';
      let status = record.status || 'absent';
      
      if (status === 'on_leave' && record.details?.leaveStatus === 'rejected') {
        console.log(`⚠️ Adjusting ${employeeName}: rejected leave → absent`);
        status = 'absent';
      }
      
      if (status === 'present') {
        presentEmployees.push(employeeName);
      } else if (status === 'absent') {
        absentEmployees.push(employeeName);
      } else if (status === 'on_leave') {
        leaveEmployees.push(employeeName);
      }

      // Determine if the employee has submitted their report on time.
      // Business rule: having an hourly report or daily_target_achieved counts as on-time.
      const onTime = Boolean(
        record.details?.hasHourlyReport ||
        record.details?.daily_target_achieved ||
        record.details?.hourlyReportId ||
        record.details?.hourlyReportSubmittedAt
      )
      if (onTime) onTimeEmployees.push(employeeName)
      
      const activityType = record.details?.hasHourlyReport 
        ? 'Hourly Report' 
        : (record.details?.locationType === 'office' ? 'Office Report' : 
           record.details?.locationType === 'site' ? 'Site Report' : 
           status === 'on_leave' ? 'Leave' : 'No Report');
      
      activities.push({
        engineerName: employeeName,
        engineerId: record.employeeId || record.userId,
        status: status,
        project: record.details?.customerName || record.details?.siteLocation || 
                 (record.details?.hasHourlyReport ? 'Hourly Activities' : 'N/A'),
        activityTarget: record.details?.daily_target_achieved || 
                       record.details?.hourly_achieved ||
                       (status === 'on_leave' ? `On ${record.details?.leaveType || 'Leave'}` : activityType),
        startTime: record.details?.inTime || '00:00',
        endTime: record.details?.outTime || '00:00',
        details: record.details,
        hasHourlyReport: record.details?.hasHourlyReport || false,
        hourlyReportId: record.details?.hourlyReportId, // NEW: Store hourly report ID
        onTime: onTime
      });
    });
    
    const summary = {
      total: data.attendance.length,
      present: presentEmployees.length,
      absent: absentEmployees.length,
      on_leave: leaveEmployees.length,
      on_time: onTimeEmployees.length,
      pending_approval: data.attendance.filter(r => r.status === 'pending_approval').length || 0
    };
    
    return {
      success: true,
      date: date,
      summary: summary,
      attendance: data.attendance,
      presentEmployees,
      absentEmployees,
      leaveEmployees,
      activities,
      note: "Hourly reports count as Present. Rejected leaves are marked as Absent."
    };
  };

  // Process user attendance data
  const processUserAttendance = (data, date) => {
    const status = data.status || 'absent';
    const details = data.details || {};
    
    let finalStatus = status;
    if (status === 'on_leave' && details.leaveStatus === 'rejected') {
      console.log(`⚠️ User has rejected leave → marked as absent`);
      finalStatus = 'absent';
    }
    
    const onTime = Boolean(
      details.hasHourlyReport ||
      details.daily_target_achieved ||
      details.hourlyReportId ||
      details.hourlyReportSubmittedAt
    )

    const activities = [{
      engineerName: user?.username || user?.name || 'You',
      engineerId: user?.employeeId || user?.id,
      status: finalStatus,
      project: details.customerName || details.siteLocation || 
              (finalStatus === 'on_leave' ? `On ${details.leaveType || 'Leave'}` : 'N/A'),
      activityTarget: details.daily_target_achieved || 
                     (finalStatus === 'on_leave' ? `On ${details.leaveType || 'Leave'}` : 'Daily Report'),
      startTime: details.inTime || '00:00',
      endTime: details.outTime || '00:00',
      details: details,
      hasHourlyReport: details.hasHourlyReport || false,
      hourlyReportId: details.hourlyReportId, // NEW: Store hourly report ID
      onTime: onTime
    }];
    
    const summary = {
      total: 1,
      present: finalStatus === 'present' ? 1 : 0,
      absent: finalStatus === 'absent' ? 1 : 0,
      on_leave: finalStatus === 'on_leave' ? 1 : 0,
      on_time: onTime ? 1 : 0,
      pending_approval: finalStatus === 'pending_approval' ? 1 : 0
    };
    
    const presentEmployees = finalStatus === 'present' ? [user?.username || 'You'] : [];
    const absentEmployees = finalStatus === 'absent' ? [user?.username || 'You'] : [];
    const leaveEmployees = finalStatus === 'on_leave' ? [user?.username || 'You'] : [];
    
    return {
      success: true,
      date: date,
      summary: summary,
      status: finalStatus,
      details: details,
      presentEmployees,
      absentEmployees,
      leaveEmployees,
      activities,
      note: data.note || (finalStatus === 'absent' ? 'No daily report or approved leave found' : null)
    };
  }

  // Fetch available dates
  const fetchAvailableDates = async () => {
    if (!token) return;
    
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

  // Fetch recent activities
  const fetchRecentActivities = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${endpoints.activities}?limit=20&page=1`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.activities)) {
          setActivities(data.activities);
        } else if (Array.isArray(data)) {
          setActivities(data);
        } else {
          setActivities([]);
        }
      } else {
        setActivities([]);
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
      setActivities([]);
    }
  };

  // Handle date change
  const handleDateChange = (date) => {
    console.log(`📅 Date changed to: ${date}`)
    setSelectedDate(date)
    setLoading(true)
    
    Promise.all([
      fetchDateSummary(date),
      fetchAttendanceData(date),
      fetchHourlyReports(date) // NEW: Fetch hourly reports for new date
    ]).finally(() => {
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
    setHourlyReports([]) // NEW: Clear hourly reports
    
    triggerRefresh()
  }

  // Handle engineer click
  const handleEngineerClick = async (identifier, engineerName) => {
    if (!(user?.role === 'Manager' || user?.role === 'Team Leader')) return;
    
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

  // NEW: Handle hourly report click in attendance table
  const handleHourlyReportClick = (activity) => {
    if (activity.hasHourlyReport && activity.hourlyReportId) {
      viewHourlyReport(activity.hourlyReportId, activity.engineerName)
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

  // Get status display color and text
  const getStatusDisplay = (status, details) => {
    if (status === 'on_leave' && details?.leaveStatus === 'rejected') {
      return {
        text: 'ABSENT (Rejected Leave)',
        bgColor: '#ffebee',
        textColor: '#c62828',
        borderColor: '#ef5350'
      };
    }
    
    switch (status) {
      case 'present':
        return {
          text: 'PRESENT',
          bgColor: '#e8f5e9',
          textColor: '#2e7d32',
          borderColor: '#4caf50'
        };
      case 'on_leave':
        return {
          text: 'ON LEAVE',
          bgColor: '#fff3e0',
          textColor: '#f57c00',
          borderColor: '#ff9800'
        };
      case 'absent':
        return {
          text: 'ABSENT',
          bgColor: '#ffebee',
          textColor: '#c62828',
          borderColor: '#ef5350'
        };
      case 'pending_approval':
        return {
          text: 'PENDING APPROVAL',
          bgColor: '#e3f2fd',
          textColor: '#1565c0',
          borderColor: '#2196f3'
        };
      default:
        return {
          text: 'UNKNOWN',
          bgColor: '#f5f5f5',
          textColor: '#757575',
          borderColor: '#bdbdbd'
        };
    }
  };

  // NEW: Check if user can edit report
  const canEditReport = (report) => {
    // Allow edit for everyone (anytime) — remove UI-level restrictions.
    // Note: backend should still enforce any required security rules if needed.
    return true;
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
              {user?.role === 'Manager' || user?.role === 'Team Leader' 
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
                {attendanceData && (
                  <div style={{ 
                    background: '#e8f4ff', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span>📊</span>
                    <span><strong>Attendance:</strong> 
                      Present: {attendanceData.summary?.present || 0} | 
                      Absent: {attendanceData.summary?.absent || 0} | 
                      Leave: {attendanceData.summary?.on_leave || 0}
                    </span>
                  </div>
                )}
                {/* NEW: Hourly Reports Count */}
                {hourlyReports.length > 0 && (
                  <div style={{ 
                    background: '#e8f5e9', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span>📝</span>
                    <span><strong>Hourly Reports:</strong> {hourlyReports.length}</span>
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

          {/* Tab Navigation - ADDED HOURLY REPORTS TAB */}
          <div style={{ 
            display: 'flex', 
            borderBottom: '1px solid #e0e0e0',
            marginBottom: '1.5rem',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => setActiveTab('summary')}
              style={{
                padding: '0.75rem 1.5rem',
                background: activeTab === 'summary' ? '#2ad1ff' : 'transparent',
                color: activeTab === 'summary' ? 'white' : '#666',
                border: 'none',
                borderBottom: activeTab === 'summary' ? '2px solid #2ad1ff' : 'none',
                cursor: 'pointer',
                fontWeight: activeTab === 'summary' ? 'bold' : 'normal'
              }}
            >
              📊 Summary
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              style={{
                padding: '0.75rem 1.5rem',
                background: activeTab === 'attendance' ? '#2ad1ff' : 'transparent',
                color: activeTab === 'attendance' ? 'white' : '#666',
                border: 'none',
                borderBottom: activeTab === 'attendance' ? '2px solid #2ad1ff' : 'none',
                cursor: 'pointer',
                fontWeight: activeTab === 'attendance' ? 'bold' : 'normal'
              }}
            >
              👥 Attendance
            </button>
            <button
              onClick={() => setActiveTab('hourly-reports')}
              style={{
                padding: '0.75rem 1.5rem',
                background: activeTab === 'hourly-reports' ? '#2ad1ff' : 'transparent',
                color: activeTab === 'hourly-reports' ? 'white' : '#666',
                border: 'none',
                borderBottom: activeTab === 'hourly-reports' ? '2px solid #2ad1ff' : 'none',
                cursor: 'pointer',
                fontWeight: activeTab === 'hourly-reports' ? 'bold' : 'normal'
              }}
            >
              📝 Hourly Reports
            </button>
            <button
              onClick={() => setActiveTab('activities')}
              style={{
                padding: '0.75rem 1.5rem',
                background: activeTab === 'activities' ? '#2ad1ff' : 'transparent',
                color: activeTab === 'activities' ? 'white' : '#666',
                border: 'none',
                borderBottom: activeTab === 'activities' ? '2px solid #2ad1ff' : 'none',
                cursor: 'pointer',
                fontWeight: activeTab === 'activities' ? 'bold' : 'normal'
              }}
            >
              📋 All Activities
            </button>
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

          {/* Attendance Tab */}
          {!loading && activeTab === 'attendance' && (
            <div>
              {attendanceData ? (
                <div>
                  {/* Attendance Stats */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '1rem',
                    marginBottom: '2rem'
                  }}>
                    <div style={{ 
                      background: '#e8f4ff', 
                      padding: '1rem', 
                      borderRadius: '8px', 
                      textAlign: 'center',
                      border: '2px solid #2ad1ff'
                    }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Total</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#092544' }}>
                        {attendanceData.summary?.total || 0}
                      </div>
                    </div>
                    <div style={{ 
                      background: '#e8f5e9', 
                      padding: '1rem', 
                      borderRadius: '8px', 
                      textAlign: 'center',
                      border: '2px solid #4CAF50'
                    }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Present</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2e7d32' }}>
                        {attendanceData.summary?.present || 0}
                      </div>
                    </div>
                    <div style={{ 
                      background: '#ffebee', 
                      padding: '1rem', 
                      borderRadius: '8px', 
                      textAlign: 'center',
                      border: '2px solid #F44336'
                    }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>Absent</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#c62828' }}>
                        {attendanceData.summary?.absent || 0}
                        {attendanceData.attendance?.some(a => 
                          a.status === 'on_leave' && a.details?.leaveStatus === 'rejected'
                        ) && ' *'}
                      </div>
                      {attendanceData.attendance?.some(a => 
                        a.status === 'on_leave' && a.details?.leaveStatus === 'rejected'
                      ) && (
                        <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.25rem' }}>
                          * Includes rejected leaves
                        </div>
                      )}
                    </div>
                    <div style={{ 
                      background: '#fff3e0', 
                      padding: '1rem', 
                      borderRadius: '8px', 
                      textAlign: 'center',
                      border: '2px solid #FF9800'
                    }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>On Leave</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f57c00' }}>
                        {attendanceData.summary?.on_leave || 0}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.25rem' }}>
                        (Approved leaves only)
                      </div>
                    </div>
                  </div>

                  {/* Information Box */}
                  <div style={{ 
                    background: '#e3f2fd', 
                    padding: '1rem', 
                    borderRadius: '8px',
                    marginBottom: '1.5rem',
                    borderLeft: '4px solid #2196f3'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <div style={{ fontSize: '1.2rem' }}>ℹ️</div>
                      <div>
                        <strong>Attendance Logic:</strong>
                        <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, fontSize: '0.9rem' }}>
                          <li><strong>Present:</strong> Submitted daily report (office/site) OR hourly report</li>
                          <li><strong>On Leave:</strong> Approved leave application</li>
                          <li><strong>Absent:</strong> No report OR Rejected leave</li>
                          <li><strong>Pending:</strong> Leave waiting for approval</li>
                        </ul>
                        <div style={{ fontSize: '0.85rem', color: '#1565c0', marginTop: '0.5rem' }}>
                          📝 <strong>Note:</strong> Hourly reports automatically mark you as present for the day.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Present Employees */}
                  {attendanceData.presentEmployees && attendanceData.presentEmployees.length > 0 && (
                    <div style={{ marginBottom: '2rem' }}>
                      <h4 style={{ color: '#2e7d32', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>✅</span> Present Employees ({attendanceData.presentEmployees.length})
                      </h4>
                      <div style={{ 
                        display: 'flex', 
                        flexWrap: 'wrap', 
                        gap: '0.5rem',
                        padding: '1rem',
                        background: '#f1f8e9',
                        borderRadius: '8px',
                        border: '1px solid #c8e6c9'
                      }}>
                        {attendanceData.presentEmployees.map((emp, index) => (
                          <span key={index} style={{
                            padding: '0.5rem 1rem',
                            background: '#4CAF50',
                            color: 'white',
                            borderRadius: '20px',
                            fontSize: '0.9rem',
                            fontWeight: '500'
                          }}>
                            {emp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detailed Attendance Table with Hourly Report Links */}
                  {attendanceData.activities && attendanceData.activities.length > 0 && (
                    <div style={{ marginBottom: '2rem' }}>
                      <h4 style={{ color: '#092544', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>📋</span> Detailed Attendance
                      </h4>
                      <div style={{ 
                        overflowX: 'auto', 
                        borderRadius: '8px', 
                        border: '1px solid #e8eef4',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                      }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f3f6f9' }}>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Engineer</th>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Status</th>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Project/Reason</th>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Activity</th>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Time</th>
                              <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {attendanceData.activities.map((activity, index) => {
                              const statusDisplay = getStatusDisplay(activity.status, activity.details);
                              const isRejectedLeave = activity.status === 'on_leave' && activity.details?.leaveStatus === 'rejected';
                              
                              return (
                                <tr key={index} style={isRejectedLeave ? { background: '#fff5f5' } : {}}>
                                  <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                                    <div 
                                      style={{ fontWeight: 'bold' }}
                                      onClick={() => handleEngineerClick(
                                        activity.engineerId || activity.engineerName,
                                        activity.engineerName || 'Unknown'
                                      )}
                                    >
                                      {activity.engineerName || 'Unknown'}
                                    </div>
                                    {activity.engineerId && <small style={{ color: '#666' }}>ID: {activity.engineerId}</small>}
                                  </td>
                                  <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                                    <span style={{
                                      padding: '0.25rem 0.75rem',
                                      borderRadius: '4px',
                                      fontSize: '0.8rem',
                                      background: statusDisplay.bgColor,
                                      color: statusDisplay.textColor,
                                      fontWeight: 'bold',
                                      border: `1px solid ${statusDisplay.borderColor}`,
                                      display: 'inline-block'
                                    }}>
                                      {statusDisplay.text}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                                    {activity.hasHourlyReport ? (
                                      <div>
                                        <span style={{ color: '#2e7d32', fontWeight: '500', cursor: 'pointer' }}
                                              onClick={() => handleHourlyReportClick(activity)}>
                                          📊 Hourly Activities
                                        </span>
                                        {activity.details?.siteLocation && (
                                          <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                            Location: {activity.details.siteLocation}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      activity.project || 'N/A'
                                    )}
                                  </td>
                                  <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                                    {activity.hasHourlyReport ? (
                                      <div>
                                        <span style={{ color: '#2e7d32', cursor: 'pointer' }}
                                              onClick={() => handleHourlyReportClick(activity)}>
                                          ✅ Hourly Report Submitted
                                        </span>
                                        {activity.activityTarget && (
                                          <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                                            {activity.activityTarget.substring(0, 80)}...
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      activity.activityTarget?.substring(0, 60) || 'No activity'
                                    )}
                                  </td>
                                  <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                                    {activity.startTime && activity.endTime 
                                      ? `${formatTime(activity.startTime)} - ${formatTime(activity.endTime)}`
                                      : 'N/A'}
                                  </td>
                                  <td style={{ padding: '0.75rem', border: '1px solid #eef3f7', fontSize: '0.85rem' }}>
                                    {activity.hasHourlyReport ? (
                                      <div>
                                        <span style={{ color: '#2e7d32', cursor: 'pointer' }}
                                              onClick={() => handleHourlyReportClick(activity)}>
                                          ✅ Click to view hourly report
                                        </span>
                                      </div>
                                    ) : activity.status === 'on_leave' ? (
                                      <span style={{ color: '#f57c00' }}>✅ Approved Leave</span>
                                    ) : activity.status === 'present' ? (
                                      <span style={{ color: '#2e7d32' }}>✅ Daily Report Submitted</span>
                                    ) : activity.status === 'absent' ? (
                                      <span style={{ color: '#c62828' }}>❌ No Report</span>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            })}
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
                  <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>👥</div>
                  <p>No attendance data found for {formatDate(selectedDate)}</p>
                  <button
                    onClick={() => fetchAttendanceData(selectedDate)}
                    style={{
                      marginTop: '1rem',
                      padding: '0.5rem 1rem',
                      background: '#2ad1ff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* NEW: Hourly Reports Tab */}
          {!loading && activeTab === 'hourly-reports' && (
            <div>
              <div style={{ 
                background: '#e8f5e9', 
                padding: '1rem', 
                borderRadius: '8px',
                marginBottom: '1.5rem',
                borderLeft: '4px solid #4CAF50'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ fontSize: '1.2rem' }}>📝</div>
                  <div>
                    <strong>
                      {user?.role && (user.role.toLowerCase().includes('manager') || 
                                      user.role.toLowerCase().includes('team leader') ||
                                      user.role.toLowerCase().includes('group leader'))
                        ? `All Hourly Reports for ${formatDate(selectedDate)}`
                        : `Your Hourly Reports for ${formatDate(selectedDate)}`
                      }
                    </strong>
                    <div style={{ fontSize: '0.9rem', color: '#2e7d32', marginTop: '0.25rem' }}>
                      Total Reports: {hourlyReports.length} | 
                      {user?.role && (user.role.toLowerCase().includes('manager') || 
                                      user.role.toLowerCase().includes('team leader') ||
                                      user.role.toLowerCase().includes('group leader'))
                        ? ' Click on any report to view and edit'
                        : ' Click on any report to view and edit your details'
                      }
                    </div>
                  </div>
                </div>
              </div>

              {!(user?.role && (user.role.toLowerCase().includes('manager') || 
                               user.role.toLowerCase().includes('team leader') ||
                               user.role.toLowerCase().includes('group leader'))) && hourlyReports.length > 0 && (
                <div style={{ 
                  background: '#e3f2fd', 
                  padding: '0.75rem 1rem', 
                  borderRadius: '4px',
                  marginBottom: '1rem',
                  borderLeft: '3px solid #2196F3',
                  fontSize: '0.9rem',
                  color: '#1565c0'
                }}>
                  💡 <strong>Tip:</strong> You can edit and update any of your reports below. Click the ✏️ Edit button to make changes.
                </div>
              )}

              {hourlyReports.length > 0 ? (
                <div style={{ 
                  overflowX: 'auto', 
                  borderRadius: '8px', 
                  border: '1px solid #e8eef4',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f3f6f9' }}>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Engineer</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Submitted At</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Activities Count</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Total Hours</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Status</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hourlyReports.map((report, index) => (
                        <tr key={index}>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            <div style={{ fontWeight: 'bold' }}>
                              {report.engineerName || report.username || 'Unknown'}
                            </div>
                            {report.employeeId && (
                              <small style={{ color: '#666' }}>ID: {report.employeeId}</small>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            {report.editedAt ? (
                              <div>
                                <div style={{
                                  padding: '0.25rem 0.5rem',
                                  background: '#fff3e0',
                                  color: '#e65100',
                                  borderRadius: '4px',
                                  fontSize: '0.85rem',
                                  fontWeight: '600',
                                  marginBottom: '0.25rem'
                                }}>
                                  ✏️ EDITED
                                </div>
                                <small style={{ color: '#666', display: 'block' }}>
                                  {new Date(report.editedAt).toLocaleString()}
                                </small>
                                {report.editedBy && (
                                  <small style={{ color: '#999', display: 'block', fontSize: '0.75rem' }}>
                                    by {report.editedBy}
                                  </small>
                                )}
                              </div>
                            ) : (
                              <div>
                                {report.submittedAt ? formatDate(report.submittedAt) : 'N/A'}
                                {report.createdAt && (
                                  <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                    {new Date(report.createdAt).toLocaleTimeString()}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              background: '#e3f2fd',
                              color: '#1565c0',
                              borderRadius: '20px',
                              fontSize: '0.9rem',
                              fontWeight: '500'
                            }}>
                              {report.activities?.length || 0} activities
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              background: '#e8f5e9',
                              color: '#2e7d32',
                              borderRadius: '20px',
                              fontSize: '0.9rem',
                              fontWeight: '500'
                            }}>
                              {report.totalHours || '0h'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              background: '#e8f5e9',
                              color: '#2e7d32',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              fontWeight: 'bold'
                            }}>
                              COMPLETED
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => viewHourlyReport(report)}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  background: '#2ad1ff',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem'
                                }}
                              >
                                👁️ View
                              </button>
                              {canEditReport(report) && (
                                <button
                                  onClick={() => startEditHourlyReport(report)}
                                  style={{
                                    padding: '0.5rem 0.75rem',
                                    background: '#4CAF50',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem'
                                  }}
                                >
                                  ✏️ Edit
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '3rem',
                  color: '#999'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📝</div>
                  <p>No hourly reports found for {formatDate(selectedDate)}</p>
                  <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
                    Hourly reports submitted on this date will appear here
                  </p>
                  <div style={{ 
                    marginTop: '2rem', 
                    padding: '1rem', 
                    background: '#f5f5f5', 
                    borderRadius: '4px',
                    fontSize: '0.85rem'
                  }}>
                    <p style={{ margin: '0.5rem 0' }}>
                      <strong>Debug Info:</strong>
                    </p>
                    <p style={{ margin: '0.25rem 0', color: '#666' }}>
                      📅 Date: {selectedDate}
                    </p>
                    <p style={{ margin: '0.25rem 0', color: '#666' }}>
                      👤 User: {user?.username || 'Unknown'}
                    </p>
                    <p style={{ margin: '0.25rem 0', color: '#666' }}>
                      🔑 Role: {user?.role || 'Unknown'}
                    </p>
                    <button 
                      onClick={() => {
                        console.log('📊 Debug Info:', {
                          selectedDate,
                          hourlyReports,
                          user,
                          token: token ? 'Present' : 'Missing'
                        })
                        alert('Check browser console (F12) for debug info')
                      }}
                      style={{
                        marginTop: '0.75rem',
                        padding: '0.5rem 1rem',
                        background: '#2ad1ff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      🐛 Show Debug Info
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Activities Tab */}
          {!loading && activeTab === 'activities' && (
            <div>
              {activities.length > 0 ? (
                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e8eef4' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f3f6f9' }}>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Engineer</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Date</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Project</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Activity</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Status</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activities.slice(0, 20).map((a, index) => {
                        const statusDisplay = getStatusDisplay(a.status, a);
                        return (
                          <tr key={index}>
                            <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                              {a.engineerName || a.username || 'N/A'}
                            </td>
                            <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                              {formatDate(a.date || a.reportDate)}
                            </td>
                            <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                              {a.project || a.projectName || 'N/A'}
                            </td>
                            <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                              {a.activityTarget?.substring(0, 60) || a.dailyTargetAchieved?.substring(0, 60) || 'No activity'}
                            </td>
                            <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                              <span style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                background: statusDisplay.bgColor,
                                color: statusDisplay.textColor,
                                fontWeight: 'bold'
                              }}>
                                {statusDisplay.text}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                              {a.startTime && a.endTime 
                                ? `${formatTime(a.startTime)} - ${formatTime(a.endTime)}`
                                : formatTime(a.time) || 'N/A'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '3rem',
                  color: '#999'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📝</div>
                  <p>No activities found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Engineer Modal */}
      {engineerModalOpen && selectedEngineer && (
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

      {/* NEW: Hourly Report Modal */}
      {(() => {
        const showModal = hourlyModalOpen && (selectedHourlyReport || editingHourlyReport)
        if (showModal) {
          console.log('🟢 Modal OPEN - State:')
          console.log('  - selectedHourlyReport:', selectedHourlyReport ? 'YES (' + selectedHourlyReport.engineerName + ')' : 'NO')
          console.log('  - editingHourlyReport:', editingHourlyReport ? 'YES (EDIT MODE)' : 'NO')
          console.log('  - editingHourlyReport.activities count:', editingHourlyReport?.activities?.length || 0)
          console.log('  - Will show:', editingHourlyReport ? 'EDIT FORM' : 'VIEW FORM')
        }
        return showModal
      })() && (
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
          zIndex: 2000,
          padding: '1rem'
        }}>
          <div style={{ 
            background: 'white', 
            width: '900px', 
            maxWidth: '95%', 
            maxHeight: '90vh',
            borderRadius: '8px', 
            padding: '20px', 
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>
                {editingHourlyReport ? '✏️ Edit Hourly Report' : '📝 Hourly Report Details'}
              </h3>
              <button 
                onClick={() => { 
                  setHourlyModalOpen(false)
                  setSelectedHourlyReport(null)
                  setEditingHourlyReport(null)
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
            
            {/* Report Header */}
            <div style={{ 
              background: '#f8f9fa', 
              padding: '1rem', 
              borderRadius: '6px',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <strong>Engineer:</strong> {editingHourlyReport?.engineerName || selectedHourlyReport?.engineerName}
                </div>
                <div>
                  <strong>Date:</strong> {formatDate(editingHourlyReport?.date || selectedHourlyReport?.date)}
                </div>
                <div>
                  <strong>Total Hours:</strong> {editingHourlyReport?.totalHours || selectedHourlyReport?.totalHours}
                </div>
                {(editingHourlyReport?.editedAt || selectedHourlyReport?.editedAt) && (
                  <div style={{
                    padding: '0.5rem',
                    background: '#fff3e0',
                    borderRadius: '4px',
                    borderLeft: '3px solid #ff9800'
                  }}>
                    <strong style={{ color: '#e65100' }}>✏️ Last Edited:</strong>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>
                      {new Date(editingHourlyReport?.editedAt || selectedHourlyReport?.editedAt).toLocaleString()}
                    </div>
                    {(editingHourlyReport?.editedBy || selectedHourlyReport?.editedBy) && (
                      <div style={{ fontSize: '0.85rem', color: '#999' }}>
                        by {editingHourlyReport?.editedBy || selectedHourlyReport?.editedBy}
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <strong>Status:</strong> 
                  <span style={{
                    marginLeft: '0.5rem',
                    padding: '0.25rem 0.75rem',
                    background: '#e8f5e9',
                    color: '#2e7d32',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    fontWeight: '500'
                  }}>
                    COMPLETED
                  </span>
                </div>
              </div>
            </div>
            
            {editingHourlyReport ? (
              (() => {
                console.log('📝 RENDERING EDIT FORM - editingHourlyReport is SET')
                console.log('  engineerName:', editingHourlyReport?.engineerName)
                console.log('  activities length:', editingHourlyReport?.activities?.length)
                return (
              /* Edit Mode */
              <div>
                <h4 style={{ marginBottom: '1rem', color: '#092544' }}>Edit Hourly Activities</h4>
                
                <div style={{ 
                  overflowX: 'auto',
                  marginBottom: '1.5rem'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f3f6f9' }}>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Time Period</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Activity</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Problem Faced</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Resolved?</th>
                        <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingHourlyReport.activities.map((activity, index) => (
                        <tr key={index} style={{ background: (!activity.timePeriod || !activity.activity) ? '#fff3cd' : 'transparent' }}>
                          <td style={{ padding: '0.5rem', border: '1px solid #eef3f7' }}>
                            <input
                              type="text"
                              value={activity.timePeriod || ''}
                              onChange={(e) => updateHourlyActivity(index, 'timePeriod', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: (!activity.timePeriod ? '2px solid #ff6b6b' : '1px solid #ddd'),
                                borderRadius: '4px',
                                fontSize: '0.9rem'
                              }}
                              placeholder="e.g., 09:00-10:00"
                            />
                          </td>
                          <td style={{ padding: '0.5rem', border: '1px solid #eef3f7' }}>
                            <textarea
                              value={activity.activity || ''}
                              onChange={(e) => updateHourlyActivity(index, 'activity', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: (!activity.activity ? '2px solid #ff6b6b' : '1px solid #ddd'),
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                minHeight: '60px',
                                resize: 'vertical'
                              }}
                              placeholder="Describe the hourly activity"
                            />
                          </td>
                          <td style={{ padding: '0.5rem', border: '1px solid #eef3f7' }}>
                            <textarea
                              value={activity.problem || ''}
                              onChange={(e) => updateHourlyActivity(index, 'problem', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                minHeight: '60px',
                                resize: 'vertical'
                              }}
                              placeholder="Any problems faced?"
                            />
                          </td>
                          <td style={{ padding: '0.5rem', border: '1px solid #eef3f7' }}>
                            <select
                              value={activity.resolved || 'no'}
                              onChange={(e) => updateHourlyActivity(index, 'resolved', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '0.9rem'
                              }}
                            >
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                            </select>
                          </td>
                          <td style={{ padding: '0.5rem', border: '1px solid #eef3f7' }}>
                            <button
                              onClick={() => removeActivity(index)}
                              style={{
                                padding: '0.5rem 0.75rem',
                                background: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={addNewActivity}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#2ad1ff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    ＋ Add New Activity
                  </button>
                  
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      onClick={() => {
                        setEditingHourlyReport(null)
                        if (selectedHourlyReport) {
                          setHourlyModalOpen(true)
                        }
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveHourlyReport}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        background: loading ? '#ccc' : '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      {loading ? 'Saving...' : '💾 Save Changes'}
                    </button>
                  </div>
                </div>
                
                <div style={{ 
                  marginTop: '1rem',
                  padding: '0.75rem',
                  background: '#fff3e0',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  color: '#f57c00'
                }}>
                  <strong>Note:</strong> All changes are saved immediately. You can edit project names, activities, times, achievements, and remarks.
                </div>
              </div>
                )
              })()
            ) : (
              (() => {
                console.log('📖 RENDERING VIEW FORM - editingHourlyReport is NOT set')
                console.log('  selectedReport:', selectedHourlyReport?.engineerName)
                return (
              /* View Mode */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ margin: 0, color: '#092544' }}>Activities</h4>
                  {canEditReport(selectedHourlyReport) && (
                    <button
                      onClick={() => startEditHourlyReport(selectedHourlyReport)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      ✏️ Edit Report
                    </button>
                  )}
                </div>
                
                {selectedHourlyReport.activities && selectedHourlyReport.activities.length > 0 ? (
                  <div style={{ 
                    overflowX: 'auto',
                    borderRadius: '6px',
                    border: '1px solid #e8eef4'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f3f6f9' }}>
                          <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>#</th>
                          <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Time Period</th>
                          <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Activity</th>
                          <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Problem Faced</th>
                          <th style={{ padding: '0.75rem', border: '1px solid #e8eef4', textAlign: 'left' }}>Resolved?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedHourlyReport.activities.map((activity, index) => (
                          <tr key={index}>
                            <td style={{ padding: '0.75rem', border: '1px solid #eef3f7', fontWeight: 'bold' }}>
                              {index + 1}
                            </td>
                            <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                              {activity.timePeriod || 'N/A'}
                            </td>
                            <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                              {activity.activity || 'N/A'}
                            </td>
                            <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                              {activity.problem || 'No problem recorded'}
                            </td>
                            <td style={{ padding: '0.75rem', border: '1px solid #eef3f7' }}>
                              {activity.resolved === 'yes' || activity.resolved === true ? '✓ Yes' : '✗ No'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '2rem',
                    color: '#999'
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📝</div>
                    <p>No activities found in this report</p>
                  </div>
                )}
                
                {/* Display Unplanned Activities */}
                {selectedHourlyReport.unplannedActivities && selectedHourlyReport.unplannedActivities.length > 0 && (
                  <div style={{
                    marginTop: '2rem',
                    padding: '1rem',
                    background: '#f9f3f0',
                    borderRadius: '6px',
                    border: '2px solid #ff8a65'
                  }}>
                    <h5 style={{ color: '#d84315', margin: '0 0 1rem 0' }}>
                      Other/Unplanned Activities
                    </h5>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr',
                      gap: '0.75rem'
                    }}>
                      {selectedHourlyReport.unplannedActivities.map((activity, index) => (
                        <div key={index} style={{
                          padding: '0.75rem',
                          background: 'white',
                          border: '1px solid #ff8a65',
                          borderRadius: '4px',
                          borderLeft: '4px solid #ff8a65'
                        }}>
                          <div style={{ marginBottom: '0.25rem' }}>
                            <strong>Activity {index + 1}:</strong> {activity.activity}
                          </div>
                          {activity.reason && (
                            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>
                              <strong>Reason:</strong> {activity.reason}
                            </div>
                          )}
                          {activity.priority && activity.priority !== 'Normal' && (
                            <div style={{ 
                              fontSize: '0.85rem',
                              display: 'inline-block',
                              background: activity.priority === 'Critical' ? '#ff5252' : activity.priority === 'High' ? '#ff9800' : '#4caf50',
                              color: 'white',
                              padding: '0.125rem 0.5rem',
                              borderRadius: '12px'
                            }}>
                              Priority: {activity.priority}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedHourlyReport.remarks && (
                  <div style={{ 
                    marginTop: '1.5rem',
                    padding: '1rem',
                    background: '#f8f9fa',
                    borderRadius: '6px',
                    borderLeft: '4px solid #2ad1ff'
                  }}>
                    <strong>General Remarks:</strong>
                    <p style={{ marginTop: '0.5rem', color: '#555' }}>
                      {selectedHourlyReport.remarks}
                    </p>
                  </div>
                )}
              </div>
                )
              })()
            )}
          </div>
        </div>
      )}
    </>
  )
}
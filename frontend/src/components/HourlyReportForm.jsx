
import { useMemo, useState, useEffect } from 'react'
import './OnboardingForm.css'
import { useAuth } from './AuthContext'
import { getAssignedProjects } from '../services/api'

const DEBUG = false
const log = (...args) => { if (DEBUG) console.log(...args) }

// Format date for backend (ensure YYYY-MM-DD format)
const formatDateForBackend = (dateValue) => {
  if (!dateValue) return new Date().toISOString().slice(0, 10)

  if (typeof dateValue === 'string' && dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateValue
  }

  const date = new Date(dateValue)
  return date.toISOString().slice(0, 10)
}

// Generate time periods: 9am-1pm and 2pm-4pm for manager analysis after 4pm
const generateTimePeriods = () => {
  const periodDefinitions = [
    { startHour: 9, endHour: 13, label: '9am-1pm', name: 'Morning Session' },
    { startHour: 14, endHour: 16, label: '2pm-4pm', name: 'Afternoon Session' }
  ]
  
  return periodDefinitions.map(period => ({
    label: period.label,
    name: period.name,
    startHour: period.startHour,
    endHour: period.endHour
  }))
}

// Check if current time is within allowed period for a specific hour
// Current logic in isWithinTimePeriod:
const isWithinTimePeriod = (startHour, endHour, currentDate = new Date()) => {
  const now = new Date(currentDate)
  const currentHour = now.getHours()
  const currentMinutes = now.getMinutes()

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

  if (isWithinTimePeriod(startHour, endHour, now)) return true

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

// Helper to get today's date in YYYY-MM-DD format (local time, not UTC)
const getTodayDateString = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const createHourlyEntry = () => ({
  timePeriod: '',
  periodName: '',
  hourlyActivity: '',
    hourlyActivityEntries: ['', '', ''], // 3 mandatory planned activities
  unplannedActivities: [], // NEW: Array for unplanned/other activities
  hourlyAchieved: '',
  hourlyAchievedEntries: [], // Start with empty array - user must click + to add
  problemFacedByEngineerHourly: '',
  problemFacedEntries: [''], // Array for multiple problems
  problemFaced: 'No', // New field: "Problem Faced?" with Yes/No
  problemResolvedOrNot: '',
  problemOccurStartTime: '',
  problemResolvedEndTime: '',
  reasonIfNotResolved: '', // New field: Reason if problem not resolved
  onlineSupportRequiredForWhichProblem: '',
  onlineSupportTime: '',
  onlineSupportEndTime: '',
  engineerNameWhoGivesOnlineSupport: ''
})

const defaultPayload = () => {
  // Use local date, not UTC date from ISO string
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const date = `${year}-${month}-${day}`
  log('defaultPayload date (local):', date)

  return {
    reportDate: date,
    locationType: '',
    projectName: '',
    dailyTargetPlanned: '',
    dailyTargetAchieved: '',
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
  const [currentActivePeriod, setCurrentActivePeriod] = useState(null)
  const [existingReports, setExistingReports] = useState([])
  const [editingReport, setEditingReport] = useState(null)
  const [sessionStatus, setSessionStatus] = useState({
    morning: { status: 'pending', canEdit: false },
    afternoon: { status: 'pending', canEdit: false },
    evening: { status: 'pending', canEdit: false }
  })
  const [totalAchieved, setTotalAchieved] = useState('')
  const [projectList, setProjectList] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [highlightedReportId, setHighlightedReportId] = useState(null)
  
  // Daily plans related states
  const [dailyPlans, setDailyPlans] = useState([])
  const [selectedPlanForActivity, setSelectedPlanForActivity] = useState({})
  const [planProgress, setPlanProgress] = useState({})
  const [planAchievementStatus, setPlanAchievementStatus] = useState({}) // New: Track achievement status for each plan-activity link

  // Function to load daily plans
  const loadDailyPlans = () => {
    if (!user?.id) {
      log('No user ID available')
      return []
    }
    
    try {
      log('Loading daily plans for user', user.id)
      
      // Try multiple sources for daily plans
      let plans = []
      
      // 1. Check localStorage for saved daily plans
      const savedPlansKey = `daily-plans-${user.id}`
      const savedPlans = localStorage.getItem(savedPlansKey)
      
      if (savedPlans) {
        try {
          const parsedPlans = JSON.parse(savedPlans)
          log('Found saved plans in localStorage')
          
          // Check if plans are for today
          const today = new Date().toISOString().slice(0, 10)
          const planDate = parsedPlans.date || ''
          
          if (planDate === today || planDate === formData.reportDate || !planDate) {
            plans = parsedPlans.plans || []
            log(`Loaded ${plans.length} plans from localStorage`)
          }
        } catch (e) {
          console.error('Error parsing saved plans:', e)
        }
      }
      
      // 2. If no plans from localStorage, try to parse from dailyTargetPlanned
      if (plans.length === 0 && formData.dailyTargetPlanned) {
        log('Parsing plans from dailyTargetPlanned')
        const dailyTarget = formData.dailyTargetPlanned
        const planLines = dailyTarget.split('\n')
        
        plans = planLines
          .map((line, index) => {
            const match = line.match(/^\d+\.\s*(.+)/)
            const text = match ? match[1].trim() : line.trim()
            
            // Skip empty lines
            if (!text) return null
            
            return {
              id: index + 1,
              text: text,
              activities: [],
              completed: false
            }
          })
          .filter(plan => plan !== null)
        
        log(`Parsed ${plans.length} plans from dailyTargetPlanned`)
      }
      
      // 3. If still no plans, check session storage
      if (plans.length === 0) {
        const sessionPlansKey = `daily-report-session-${user.id}`
        const sessionData = sessionStorage.getItem(sessionPlansKey)
        
        if (sessionData) {
          try {
            const parsedData = JSON.parse(sessionData)
            const targetDate = formData.reportDate || new Date().toISOString().slice(0, 10)
            
            if (parsedData.date === targetDate && parsedData.dailyTargetPlanned) {
              const dailyTarget = parsedData.dailyTargetPlanned
              const planLines = dailyTarget.split('\n')
              
              plans = planLines
                .map((line, index) => {
                  const match = line.match(/^\d+\.\s*(.+)/)
                  const text = match ? match[1].trim() : line.trim()
                  if (!text) return null
                  
                  return {
                    id: index + 1,
                    text: text,
                    activities: [],
                    completed: false
                  }
                })
                .filter(plan => plan !== null)
              
              log(`Loaded ${plans.length} plans from sessionStorage`)
            }
          } catch (e) {
            console.error('Error parsing session plans:', e)
          }
        }
      }
      
      // 4. If still no plans, create some default plans based on selected project
      if (plans.length === 0 && formData.projectName) {
        log('Creating default plans based on project')
        const defaultPlans = [
          { id: 1, text: 'Complete project setup and configuration', activities: [], completed: false },
          { id: 2, text: 'Test and validate system components', activities: [], completed: false },
          { id: 3, text: 'Document work and prepare reports', activities: [], completed: false }
        ]
        
        // Save default plans to localStorage for this user
        const plansToSave = {
          date: formData.reportDate || new Date().toISOString().slice(0, 10),
          plans: defaultPlans
        }
        
        try {
          localStorage.setItem(savedPlansKey, JSON.stringify(plansToSave))
          log('Saved default plans to localStorage')
        } catch (e) {
          console.error('Error saving default plans:', e)
        }
        
        plans = defaultPlans
      }
      
      log(`Total plans loaded for user ${user.id}: ${plans.length}`)
      return plans
      
    } catch (error) {
      console.error('Error loading daily plans:', error)
      return []
    }
  }

  // Update the useEffect that loads plans
  useEffect(() => {
    const loadPlansForUser = () => {
      if (!user?.id) {
        console.log('⏳ Waiting for user data...')
        return
      }
      
      console.log('👤 User changed, loading plans for:', user.id)
      const plans = loadDailyPlans()
      console.log('📋 Plans loaded:', plans)
      
      if (plans.length > 0) {
        setDailyPlans(plans)
        
        // Initialize progress tracking
        const progress = {}
        plans.forEach(plan => {
          progress[plan.id] = {
            completedActivities: 0,
            totalActivities: 0,
            isCompleted: false
          }
        })
        setPlanProgress(progress)
        
        // Show success message
        setAlert({
          type: 'success',
          message: `Loaded ${plans.length} daily plan(s) for ${user.name || 'user'}`
        })
        
        // Auto-clear after 3 seconds
        setTimeout(() => {
          setAlert(prev => prev?.type === 'success' && prev.message.includes('daily plan') ? null : prev)
        }, 3000)
      } else {
        console.log('📭 No plans found for user')
        setDailyPlans([])
        setPlanProgress({})
      }
    }
    
    loadPlansForUser()
  }, [user?.id, formData.reportDate, formData.projectName])

  // Update the auto-load daily plans useEffect
  useEffect(() => {
    const autoLoadDailyPlans = () => {
      if (!formData.dailyTargetPlanned && user?.id) {
        const savedPlans = loadDailyPlans()
        if (savedPlans.length > 0) {
          setDailyPlans(savedPlans)
          
          // Also set the dailyTargetPlanned from loaded plans
          const dailyTarget = savedPlans
            .map((plan, index) => `${index + 1}. ${plan.text}`)
            .join('\n')
          
          if (dailyTarget && !formData.dailyTargetPlanned) {
            setFormData(prev => ({
              ...prev,
              dailyTargetPlanned: dailyTarget
            }))
            
            setAlert({
              type: 'success',
              message: `Auto-filled daily target from ${savedPlans.length} saved plan(s)`
            })
          }
        }
      }
    }
    
    autoLoadDailyPlans()
  }, [formData.reportDate, user?.id, formData.dailyTargetPlanned])

  // Function to link activity to a plan
  const linkActivityToPlan = (sessionIndex, activityIndex, planId) => {
    if (!planId) {
      // Remove the link if planId is empty
      const key = `${sessionIndex}-${activityIndex}`
      setSelectedPlanForActivity(prev => {
        const newState = { ...prev }
        delete newState[key]
        return newState
      })
      
      // Also remove achievement status for this link
      setPlanAchievementStatus(prev => {
        const newState = { ...prev }
        delete newState[key]
        return newState
      })
      return
    }
    
    const key = `${sessionIndex}-${activityIndex}`
    setSelectedPlanForActivity(prev => ({
      ...prev,
      [key]: planId
    }))
    
    // Initialize achievement status as 'No' (default)
    setPlanAchievementStatus(prev => ({
      ...prev,
      [key]: 'No'
    }))
    
    // Update the plan's activities
    const activityText = formData.hourlyEntries[sessionIndex]?.hourlyActivityEntries?.[activityIndex] || ''
    if (activityText.trim()) {
      setDailyPlans(prev => prev.map(plan => {
        if (plan.id === planId) {
          const activities = [...new Set([...plan.activities, activityText])]
          return { ...plan, activities }
        }
        return plan
      }))
    }
  }

  // Function to update achievement status for a plan-activity link
  const updatePlanAchievementStatus = (sessionIndex, activityIndex, status) => {
    const key = `${sessionIndex}-${activityIndex}`
    setPlanAchievementStatus(prev => ({
      ...prev,
      [key]: status
    }))
    // NOTE: Do NOT auto-add achievement entries. Users should click the + button to add achievements.
  }

  // Function to track plan completion
 // Update the checkPlanCompletion function:
const checkPlanCompletion = (planId) => {
  const plan = dailyPlans.find(p => p.id === planId)
  if (!plan) return false
  
  // Find all activities linked to this plan
  const linkedActivities = Object.entries(selectedPlanForActivity)
    .filter(([key, pId]) => pId === planId)
    .map(([key]) => {
      const [sessionIndex, activityIndex] = key.split('-').map(Number)
      const activity = formData.hourlyEntries[sessionIndex]?.hourlyActivityEntries?.[activityIndex] || ''
      const achievementStatus = planAchievementStatus[key] || 'No'
      return {
        key,
        activity: activity.trim(),
        isAchieved: achievementStatus === 'Yes'
      }
    })
    .filter(item => item.activity)
  
  log(`Plan ${planId} linked activities:`, linkedActivities)
  
  // Count completed activities
  const completedActivities = linkedActivities.filter(item => item.isAchieved).length
  const totalActivities = linkedActivities.length
  
  // Update progress
  const progress = {
    completedActivities: completedActivities,
    totalActivities: totalActivities,
    isCompleted: totalActivities > 0 && completedActivities === totalActivities
  }
  
  log(`Plan ${planId} progress:`, progress)
  
  setPlanProgress(prev => ({
    ...prev,
    [planId]: progress
  }))
  
  return progress.isCompleted
}

// Update the getPlanProgressDisplay function:
const getPlanProgressDisplay = (planId) => {
  const progress = planProgress[planId]
  log(`Getting progress display for plan ${planId}:`, progress)
  
  if (!progress) {
    return { 
      text: 'No activities linked', 
      color: '#6c757d' 
    }
  }
  
  if (progress.totalActivities === 0) {
    return { 
      text: 'No activities linked', 
      color: '#6c757d' 
    }
  }
  
  const percentage = Math.round((progress.completedActivities / progress.totalActivities) * 100)
  
  if (progress.isCompleted) {
    return { 
      text: `✓ Completed (${progress.completedActivities}/${progress.totalActivities})`, 
      color: '#06c167' 
    }
  }
  
  return { 
    text: `In progress (${progress.completedActivities}/${progress.totalActivities})`, 
    color: '#2ad1ff',
    percentage 
  }
}
  // Check plan completion whenever activities, achievements, or achievement status changes
  useEffect(() => {
    dailyPlans.forEach(plan => {
      checkPlanCompletion(plan.id)
    })
  }, [formData.hourlyEntries, selectedPlanForActivity, planAchievementStatus])

  // Function to get plan progress display
 

  // Calculate total achieved from all hourly entries
  useEffect(() => {
    const calculateTotalAchieved = () => {
      let total = ''
      const allAchievedEntries = []
      
      formData.hourlyEntries.forEach(entry => {
        if (entry.hourlyAchievedEntries) {
          entry.hourlyAchievedEntries.forEach(achieved => {
            if (achieved && achieved.trim()) {
              allAchievedEntries.push(achieved.trim())
            }
          })
        }
      })
      
      if (allAchievedEntries.length > 0) {
        // Format without "Achieved X: " prefix for cleaner display
        total = allAchievedEntries
          .map((achieved, index) => `${index + 1}. ${achieved}`)
          .join('\n')
      }
      
      setTotalAchieved(total)
      setFormData(prev => ({ ...prev, dailyTargetAchieved: total }))
    }
    
    calculateTotalAchieved()
  }, [formData.hourlyEntries])

  // Function to refresh existing reports
 // Update the refreshExistingReports function:

const refreshExistingReports = async () => {
  if (!token || !formData.reportDate) {
    console.log('❌ Cannot refresh reports: No token or date');
    return;
  }

  try {
      log('Refreshing existing reports for date:', formData.reportDate);
      
      // Ensure we send only the date part (YYYY-MM-DD), not the full ISO string
      let cleanDate = formData.reportDate;
      if (cleanDate.includes('T')) {
        cleanDate = cleanDate.split('T')[0];
      }
      
    const url = `${endpoint}/${cleanDate}`;
    console.log('📡 Fetching reports from:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.error('Failed to refresh existing reports:', response.status)
      return
    }

    const reports = await response.json()
    const normalized = Array.isArray(reports) ? reports : (reports.reports || [])
    log('Refreshed reports count:', normalized.length)
    setExistingReports(normalized)

    // If we recently highlighted a report, scroll to it and add a temporary highlight
    if (highlightedReportId) {
      setTimeout(() => {
        const el = document.querySelector(`[data-report-id="${highlightedReportId}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          const prev = el.style.boxShadow
          el.style.boxShadow = '0 0 0 4px rgba(42,209,255,0.25)'
          setTimeout(() => { el.style.boxShadow = prev || '' }, 3000)
          // clear highlight state
          setHighlightedReportId(null)
        }
      }, 150)
    }
  } catch (error) {
    console.error('❌ Failed to refresh existing reports:', error)
  }
}

// Function to clear a specific session's form
const clearSessionForm = (sessionIndex) => {
  setFormData(prev => ({
    ...prev,
    hourlyEntries: prev.hourlyEntries.map((hourlyEntry, idx) => 
      idx === sessionIndex
        ? {
            ...createHourlyEntry(),
            timePeriod: hourlyEntry.timePeriod,
            periodName: hourlyEntry.periodName,
            startHour: hourlyEntry.startHour,
            endHour: hourlyEntry.endHour
          }
        : hourlyEntry
    )
  }));
  
  // Also clear any plan links for this session
  Object.keys(selectedPlanForActivity).forEach(key => {
    const [sessionIdx] = key.split('-').map(Number);
    if (sessionIdx === sessionIndex) {
      delete selectedPlanForActivity[key];
      delete planAchievementStatus[key];
    }
  });
};
// Update the endpoint constant:


  // Helper function to process report data
  // Update the processReportForEditing function:
const processReportForEditing = (report) => {
  console.log('📋 Processing report for editing:', report);
  
  // Find the corresponding session index
  const sessionIndex = formData.hourlyEntries.findIndex(
    entry => entry.timePeriod === report.time_period
  );
  
  if (sessionIndex === -1) {
    console.error('❌ Session not found for time period:', report.time_period);
    return;
  }
  
  // Parse activities
  const parseActivities = (activityString) => {
    if (!activityString) return [''];
    
    const activities = [];
    const lines = activityString.split('\n');
    
    lines.forEach(line => {
      if (line.trim()) {
        // Remove "Activity X: " prefix if present
        const cleanLine = line.replace(/Activity \d+:\s*/i, '').trim();
        if (cleanLine) {
          activities.push(cleanLine);
        }
      }
    });
    
    return activities.length > 0 ? activities : [''];
  };
  
  // Parse achievements
  const parseAchievements = (achievementString) => {
    if (!achievementString) return [];
    
    const achievements = [];
    const lines = achievementString.split('\n');
    
    lines.forEach(line => {
      if (line.trim()) {
        // Remove "Achieved X: " prefix if present
        const cleanLine = line.replace(/Achieved \d+:\s*/i, '').trim();
        if (cleanLine) {
          achievements.push(cleanLine);
        }
      }
    });
    
    return achievements;
  };
  
  // Parse problems
  const parseProblems = (problemString) => {
    if (!problemString) return [''];
    
    const problems = [];
    const lines = problemString.split('\n');
    
    lines.forEach(line => {
      if (line.trim()) {
        // Remove "Problem X: " prefix if present
        const cleanLine = line.replace(/Problem \d+:\s*/i, '').trim();
        if (cleanLine) {
          problems.push(cleanLine);
        }
      }
    });
    
    return problems.length > 0 ? problems : [''];
  };
  
  // Update the form data
  setFormData(prev => {
    const updatedEntries = [...prev.hourlyEntries];
    
    // Clear all entries first
    updatedEntries.forEach((entry, index) => {
      updatedEntries[index] = {
        ...createHourlyEntry(),
        timePeriod: entry.timePeriod,
        periodName: entry.periodName,
        startHour: entry.startHour,
        endHour: entry.endHour
      };
    });
    
    // Now populate the specific session
    const parsedActivities = parseActivities(report.hourly_activity)
    const parsedAchievements = parseAchievements(report.hourly_achieved)
    // Ensure at least 3 planned activity slots
    while (parsedActivities.length < 3) parsedActivities.push('')
    // Ensure achievements length matches activities
    while (parsedAchievements.length < parsedActivities.length) parsedAchievements.push('')

    updatedEntries[sessionIndex] = {
      ...updatedEntries[sessionIndex],
      hourlyActivity: report.hourly_activity || '',
      hourlyActivityEntries: parsedActivities,
      hourlyAchieved: report.hourly_achieved || '',
      hourlyAchievedEntries: parsedAchievements,
      problemFacedByEngineerHourly: report.problem_faced_by_engineer_hourly || '',
      problemFacedEntries: parseProblems(report.problem_faced_by_engineer_hourly),
      problemFaced: report.problem_faced || 'No',
      problemResolvedOrNot: report.problem_resolved_or_not || '',
      problemOccurStartTime: report.problem_occur_start_time || '',
      problemResolvedEndTime: report.problem_resolved_end_time || '',
      reasonIfNotResolved: report.reason_if_not_resolved || '',
      onlineSupportRequiredForWhichProblem: report.online_support_required_for_which_problem || '',
      onlineSupportTime: report.online_support_time || '',
      onlineSupportEndTime: report.online_support_end_time || '',
      engineerNameWhoGivesOnlineSupport: report.engineer_name_who_gives_online_support || ''
    };
    
    return {
      ...prev,
      // DO NOT change reportDate - keep it as today's date for the form
      // This allows View Activities to show all today's reports
      projectName: report.project_name || prev.projectName,
      dailyTargetPlanned: report.daily_target || prev.dailyTargetPlanned,
      dailyTargetAchieved: report.daily_target_achieved || prev.dailyTargetAchieved,
      hourlyEntries: updatedEntries
    };
  });
  
  console.log('✅ Report processed for editing');
};

// Add this function to scroll to editing section
const scrollToEditingSection = () => {
  setTimeout(() => {
    const editingElements = document.querySelectorAll('[style*="EDITING MODE"], [style*="border: 2px solid #ffc107"]');
    if (editingElements.length > 0) {
      editingElements[0].scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, 100);
};
  // Function to load report for editing
  // Update the loadReportForEditing function:
const loadReportForEditing = async (reportId) => {
  if (!token) {
    setAlert({ type: 'error', message: 'Authentication required. Please login again.' });
    return;
  }
  
  try {
    log('Loading report for editing:', reportId);
    
    // Use the API endpoint for fetching a single report by id
    const url = `${endpoint}/id/${reportId}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to load report: ${response.status}`);
    }
    
    const report = await response.json();
    console.log('📝 Report loaded for editing:', report);
    
    // Process the report for editing
    processReportForEditing(report);
    
    // Set editing mode
    const sessionIndex = formData.hourlyEntries.findIndex(
      entry => entry.timePeriod === report.time_period
    );
    
    if (sessionIndex !== -1) {
      setEditingReport({
        id: report.id,
        timePeriod: report.time_period,
        sessionIndex: sessionIndex,
        isFilled: report.hourly_activity || report.hourly_achieved || report.problem_faced_by_engineer_hourly,
        originalDate: report.report_date  // Store original date for reference
      });
      
      setAlert({
        type: 'info',
        message: `Now editing ${report.time_period} report from ${report.report_date}. Make your changes and click "Update Report".`
      });
      
      // Scroll to the editing section
      scrollToEditingSection();
      
      // Refresh existing reports to show the report being edited
      await refreshExistingReports();
    } else {
      setAlert({
        type: 'error',
        message: `Could not find ${report.time_period} session in form. Please refresh the page.`
      });
    }
    
  } catch (error) {
    console.error('Error loading report for editing:', error);
    setAlert({
      type: 'error',
      message: 'Failed to load report for editing. Please try again.'
    });
  }
};

  // Function to cancel editing
  const cancelEditing = () => {
    setEditingReport(null)
    setFormData(defaultPayload())
    setAlert({
      type: 'info',
      message: 'Editing cancelled. You can now create new reports.'
    })
  }

  // Update active period and session status every minute
  useEffect(() => {
    const updatePeriodAndStatus = () => {
      const now = new Date()
      const periods = generateTimePeriods()
      
      const activePeriod = periods.find(period =>
        isWithinEditingWindow(period.startHour, period.endHour, now)
      )
      setCurrentActivePeriod(activePeriod ? activePeriod.label : null)

      const status = {
        morning: { status: 'pending', canEdit: false },
        afternoon: { status: 'pending', canEdit: false },
        evening: { status: 'pending', canEdit: false }
      }

     
      periods.forEach(period => {
  const periodKey = period.name.toLowerCase().replace(' session', '')
  
 // In the updatePeriodAndStatus function, replace this logic:

// Current (WRONG):
if (isFuturePeriod(period.startHour, now)) {
  status[periodKey] = { status: 'pending', canEdit: false }
} else if (isWithinEditingWindow(period.startHour, period.endHour, now)) {
  status[periodKey] = { status: 'active', canEdit: true }
} else {
  status[periodKey] = { status: 'missed', canEdit: false }
}

// With this (CORRECT):
const existingReport = existingReports.find(report => report.time_period === period.label)
if (existingReport) {
  // Report exists - check if it was submitted within time
  const reportTime = new Date(existingReport.created_at || existingReport.updated_at)
  const reportHour = reportTime.getHours()
  const reportMinutes = reportTime.getMinutes()
  
  // Check if report was submitted within session or grace period
  const wasSubmittedOnTime = (
    (reportHour >= period.startHour && reportHour < period.endHour) || // During session
    (reportHour === period.endHour && reportMinutes <= 30) // Within 30 min after
  )
  
  status[periodKey] = { 
    status: wasSubmittedOnTime ? 'submitted' : 'late',
    canEdit: false, // Can't edit old reports unless admin
    isFilled: existingReport.hourly_activity || existingReport.hourly_achieved
  }
} else {
  // No report yet - check current status
  if (isFuturePeriod(period.startHour, now)) {
    status[periodKey] = { status: 'pending', canEdit: false }
  } else if (isWithinEditingWindow(period.startHour, period.endHour, now)) {
    status[periodKey] = { status: 'active', canEdit: true }
  } else {
    status[periodKey] = { status: 'missed', canEdit: false }
  }
}
})

      setSessionStatus(status)
    }

    updatePeriodAndStatus()
    const interval = setInterval(updatePeriodAndStatus, 60000)
    return () => clearInterval(interval)
  }, [existingReports])

  const endpoint = useMemo(
    () => import.meta.env.VITE_API_URL?.replace('/api/activity', '/api/hourly-report') ?? 'http://localhost:5000/api/hourly-report',
    []
  )

  // Function to enable editing for any report (admin/supervisor override)
const enableEditingForReport = (reportId) => {
  if (!token) return
  
  // Ask for confirmation
  const confirmEdit = window.confirm(
    "Are you sure you want to edit this report? This will allow modifications even if the session has ended."
  )
  
  if (confirmEdit) {
    loadReportForEditing(reportId)
    setAlert({
      type: 'warning',
      message: 'Editing mode enabled. You can now modify this report.'
    })
  }
}


// Function to delete a report
const deleteReport = async (reportId) => {
  if (!token) return
  
  const confirmDelete = window.confirm(
    "Are you sure you want to delete this report? This action cannot be undone."
  )
  
  if (!confirmDelete) return
  
  try {
    const response = await fetch(`${endpoint}/${reportId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    
    if (response.ok) {
      await refreshExistingReports()
      setAlert({
        type: 'success',
        message: 'Report deleted successfully!'
      })
    } else {
      throw new Error('Failed to delete report')
    }
  } catch (error) {
    console.error('Error deleting report:', error)
    setAlert({
      type: 'error',
      message: 'Failed to delete report. Please try again.'
    })
  }
}
  // Add this function to fetch project details
  const fetchProjectDetails = async (projectId) => {
    if (!token || !projectId) return
    
    try {
      // Adjust this endpoint based on your API
      const response = await fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const projectData = await response.json()
        
        // Update form with project details including daily target
        setFormData(prev => ({
          ...prev,
          dailyTargetPlanned: projectData.daily_target || projectData.target || '',
          customerName: projectData.customer_name || '',
          incharge: projectData.project_incharge || '',
          siteLocation: projectData.site_location || ''
        }))
      }
    } catch (error) {
      console.error('Error fetching project details:', error)
    }
  }

  // Update the fetchAssignedProjects function
  const fetchAssignedProjects = async () => {
    if (!token) {
      console.log('❌ No token available')
      return
    }
    
    setLoadingProjects(true)
    try {
      console.log('🔍 Starting to fetch assigned projects...')
      
      const response = await getAssignedProjects()
      console.log('📦 Full API Response:', response)
      
      if (response && response.data) {
        console.log('📊 Response data:', response.data)
        
        let projects = []
        
        if (Array.isArray(response.data.projects)) {
          projects = response.data.projects
          console.log('✅ Found projects in response.data.projects')
        } else if (Array.isArray(response.data.assignments)) {
          projects = response.data.assignments
          console.log('✅ Found projects in response.data.assignments')
        } else if (Array.isArray(response.data)) {
          projects = response.data
          console.log('✅ Found projects in response.data (root level)')
        }
        
        // Check if projects have daily_targets or similar field
        const projectsWithTargets = projects.map(project => {
          // Extract daily target from available fields
          const dailyTarget = 
            project.daily_target || 
            project.dailyTargetPlanned || 
            project.target || 
            project.daily_plan || 
            ''
          
          return {
            ...project,
            dailyTargetPlanned: dailyTarget
          }
        })
        
        console.log(`📋 Loaded ${projectsWithTargets.length} projects with targets:`, projectsWithTargets)
        
        setProjectList(projectsWithTargets)
        
        // Auto-select first project if available
        if (projectsWithTargets.length > 0 && !formData.projectName) {
          const firstProject = projectsWithTargets[0]
          console.log('🚀 Auto-selecting first project:', firstProject)
          
          setFormData(prev => ({
            ...prev,
            projectName: firstProject.project_no || firstProject.name || firstProject.project_name || '',
            dailyTargetPlanned: firstProject.dailyTargetPlanned || '',
            customerName: firstProject.customer || firstProject.customer_name || '',
            incharge: firstProject.incharge || firstProject.project_incharge || '',
            siteLocation: firstProject.site_location || firstProject.location || ''
          }))
        }
      } else {
        console.log('❌ No data in response')
      }
    } catch (error) {
      console.error('❌ Error fetching assigned projects:', error)
      
      // Fallback: Use hardcoded projects with daily targets
      const fallbackProjects = [
        { 
          id: 1, 
          name: 'NEW_PROJECT[+29]', 
          project_no: 'NEW_PROJECT[+29]', 
          dailyTargetPlanned: 'Complete module installation and testing',
          customer: 'ABC Corporation',
          incharge: 'Project Manager',
          site_location: 'Main Site',
          status: 'active'
        },
        { 
          id: 2, 
          name: 'VDP #24', 
          project_no: 'VDP #24', 
          dailyTargetPlanned: 'System configuration and user training',
          customer: 'XYZ Industries',
          incharge: 'Site Manager',
          site_location: 'Site #24',
          status: 'active'
        }
      ]
      
      console.log('🔄 Using fallback projects:', fallbackProjects)
      setProjectList(fallbackProjects)
      
      if (!formData.projectName && fallbackProjects.length > 0) {
        setFormData(prev => ({
          ...prev,
          projectName: fallbackProjects[0].project_no || fallbackProjects[0].name || '',
          dailyTargetPlanned: fallbackProjects[0].dailyTargetPlanned || ''
        }))
      }
    } finally {
      setLoadingProjects(false)
    }
  }

  // And update the fetchExistingReports function to use the correct endpoint:
  const fetchExistingReports = async () => {
    if (!token || !formData.reportDate) return
    
    try {
      // Ensure reportDate is YYYY-MM-DD format, not ISO datetime
      let cleanDate = formData.reportDate
      if (cleanDate.includes('T')) {
        cleanDate = cleanDate.split('T')[0]
      }
      
      const url = `${endpoint}/${cleanDate}`
      log('Fetching reports from date:', cleanDate)

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const reports = await response.json()
        log('Reports fetched:', Array.isArray(reports) ? reports.length : (reports.reports || []).length)
        setExistingReports(Array.isArray(reports) ? reports : (reports.reports || []))
      } else {
        console.error('Failed to fetch existing reports:', response.status)
        setExistingReports([])
      }
    } catch (error) {
      console.error('Failed to fetch existing reports:', error)
      setExistingReports([])
    }
  }

  // Fetch assigned projects for the employee
  useEffect(() => {
    if (token) {
      fetchAssignedProjects()
      fetchExistingReports()
    }
  }, [formData.reportDate, token, endpoint])

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
    
    // If problemFaced is changed to "No", reset related fields
    if (field === 'problemFaced' && value === 'No') {
      setFormData(prev => ({
        ...prev,
        hourlyEntries: prev.hourlyEntries.map((entry, i) => {
          if (i === index) {
            return {
              ...entry,
              problemFaced: 'No',
              problemResolvedOrNot: '',
              problemOccurStartTime: '',
              problemResolvedEndTime: '',
              reasonIfNotResolved: '',
              onlineSupportRequiredForWhichProblem: '',
              onlineSupportTime: '',
              onlineSupportEndTime: '',
              engineerNameWhoGivesOnlineSupport: '',
              problemFacedEntries: [''] // Reset problem entries
            }
          }
          return entry
        })
      }))
    }
    
    // If problemResolvedOrNot is changed to "Yes", reset reason field
    if (field === 'problemResolvedOrNot' && value === 'Yes') {
      setFormData(prev => ({
        ...prev,
        hourlyEntries: prev.hourlyEntries.map((entry, i) => {
          if (i === index) {
            return {
              ...entry,
              problemResolvedOrNot: 'Yes',
              reasonIfNotResolved: '', // Clear reason when resolved
              problemOccurStartTime: entry.problemOccurStartTime || '',
              problemResolvedEndTime: entry.problemResolvedEndTime || ''
            }
          }
          return entry
        })
      }))
    }
    
    // If problemResolvedOrNot is changed to "No", reset time fields
    if (field === 'problemResolvedOrNot' && value === 'No') {
      setFormData(prev => ({
        ...prev,
        hourlyEntries: prev.hourlyEntries.map((entry, i) => {
          if (i === index) {
            return {
              ...entry,
              problemResolvedOrNot: 'No',
              problemOccurStartTime: '',
              problemResolvedEndTime: '',
              onlineSupportRequiredForWhichProblem: '',
              onlineSupportTime: '',
              onlineSupportEndTime: '',
              engineerNameWhoGivesOnlineSupport: '',
              reasonIfNotResolved: entry.reasonIfNotResolved || '' // Keep reason if already entered
            }
          }
          return entry
        })
      }))
    }
  }

  // Add new activity entry
  const addActivityEntry = (sessionIndex) => {
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      // Ensure we have the array
      if (!session.hourlyActivityEntries) {
        session.hourlyActivityEntries = ['']
      }
      
      // Add new empty entry
      session.hourlyActivityEntries.push('')
      // Keep achievements array in sync
      if (!session.hourlyAchievedEntries) session.hourlyAchievedEntries = []
      session.hourlyAchievedEntries.push('')
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

  // Update activity entry
  const updateActivityEntry = (sessionIndex, activityIndex, value) => {
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      // Ensure we have the array
      if (!session.hourlyActivityEntries) {
        session.hourlyActivityEntries = ['']
      }
      
      // Update entry
      session.hourlyActivityEntries[activityIndex] = value
      
      // Ensure achievements array exists and has at least same length
      if (!session.hourlyAchievedEntries) session.hourlyAchievedEntries = []
      while (session.hourlyAchievedEntries.length < session.hourlyActivityEntries.length) {
        session.hourlyAchievedEntries.push('')
      }

      // Update hourlyActivity field for backward compatibility
      session.hourlyActivity = session.hourlyActivityEntries
        .filter(entry => entry.trim())
        .map((entry, idx) => `Activity ${idx + 1}: ${entry}`)
        .join('\n')
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

  // Add unplanned/other activity entry
  const addUnplannedActivityEntry = (sessionIndex) => {
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      // Ensure we have the array
      if (!session.unplannedActivities) {
        session.unplannedActivities = []
      }
      
      // Add new empty entry
      session.unplannedActivities.push({
        activity: '',
        reason: '',
        priority: 'Normal'
      })
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

  // Update unplanned activity entry
  const updateUnplannedActivityEntry = (sessionIndex, activityIndex, field, value) => {
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      // Ensure we have the array
      if (!session.unplannedActivities) {
        session.unplannedActivities = []
      }
      
      // Update entry
      if (!session.unplannedActivities[activityIndex]) {
        session.unplannedActivities[activityIndex] = {
          activity: '',
          reason: '',
          priority: 'Normal'
        }
      }
      
      session.unplannedActivities[activityIndex][field] = value
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

  // Remove unplanned activity entry
  const removeUnplannedActivityEntry = (sessionIndex, activityIndex) => {
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      if (session.unplannedActivities) {
        session.unplannedActivities.splice(activityIndex, 1)
      }
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

// Add this function near the other helper functions
const getSessionStatus = (period, now = new Date()) => {
  const { startHour, endHour, label } = period
  const currentHour = now.getHours()
  const currentMinutes = now.getMinutes()
  const isToday = formData.reportDate === getTodayDateString()
  
  // Check existing report first
  const existingReport = existingReports.find(report => report.time_period === label)
  
  if (existingReport) {
    const canEdit = isWithinEditingWindow(startHour, endHour, now)
    return {
      status: canEdit ? 'editable' : 'submitted',
      canEdit,
      report: existingReport
    }
  }
  
  // No existing report
  if (!isToday) {
    return { status: 'missed', canEdit: false }
  }
  
  if (currentHour < startHour) {
    return { status: 'pending', canEdit: false }
  }
  
  // Check if within active period (including 30-minute grace)
  if (currentHour >= startHour) {
    if (currentHour < endHour || (currentHour === endHour && currentMinutes <= 30)) {
      return { status: 'active', canEdit: true }
    }
  }
  
  // Check if it's past the grace period but still today
  if (currentHour > endHour || (currentHour === endHour && currentMinutes > 30)) {
    // Check if we're still within working hours (before 6:30 PM)
    if (currentHour < 18 || (currentHour === 18 && currentMinutes <= 30)) {
      return { status: 'missed', canEdit: false }
    }
  }
  
  return { status: 'missed', canEdit: false }
}
  // Remove activity entry
  const removeActivityEntry = (sessionIndex, activityIndex) => {
    const key = `${sessionIndex}-${activityIndex}`
    
    // Remove plan link and achievement status
    setSelectedPlanForActivity(prev => {
      const newState = { ...prev }
      delete newState[key]
      return newState
    })
    
    setPlanAchievementStatus(prev => {
      const newState = { ...prev }
      delete newState[key]
      return newState
    })
    
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      if (!session.hourlyActivityEntries || session.hourlyActivityEntries.length <= 1) {
        return prev
      }
      
      // Remove the entry
      session.hourlyActivityEntries = session.hourlyActivityEntries.filter((_, idx) => idx !== activityIndex)
      // Also remove corresponding achievement entry if present
      if (session.hourlyAchievedEntries && session.hourlyAchievedEntries.length > activityIndex) {
        session.hourlyAchievedEntries.splice(activityIndex, 1)
      }
      
      // Update hourlyActivity field for backward compatibility
      session.hourlyActivity = session.hourlyActivityEntries
        .filter(entry => entry.trim())
        .map((entry, idx) => `Activity ${idx + 1}: ${entry}`)
        .join('\n')
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

  // Add new achievement entry
  const addAchievedEntry = (sessionIndex) => {
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      // Ensure we have the array
      if (!session.hourlyAchievedEntries) {
        session.hourlyAchievedEntries = ['']
      }
      
      // Add new empty entry
      session.hourlyAchievedEntries.push('')
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

  // Update achievement entry
  const updateAchievedEntry = (sessionIndex, achievedIndex, value) => {
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      // Ensure we have the array
      if (!session.hourlyAchievedEntries) {
        session.hourlyAchievedEntries = ['']
      }
      
      // Update entry
      session.hourlyAchievedEntries[achievedIndex] = value
      
      // Update hourlyAchieved field - store WITHOUT prefix for cleaner data
      session.hourlyAchieved = session.hourlyAchievedEntries
        .filter(entry => entry.trim())
        .join('\n') // Just join with newline, no prefix
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

  // Remove achievement entry
  const removeAchievedEntry = (sessionIndex, achievedIndex) => {
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      if (!session.hourlyAchievedEntries || session.hourlyAchievedEntries.length <= 1) {
        return prev
      }
      
      // Remove the entry
      session.hourlyAchievedEntries = session.hourlyAchievedEntries.filter((_, idx) => idx !== achievedIndex)
      
      // Update hourlyAchieved field for backward compatibility
      session.hourlyAchieved = session.hourlyAchievedEntries
        .filter(entry => entry.trim())
        .map((entry, idx) => `Achieved ${idx + 1}: ${entry}`)
        .join('\n')
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

  // Add new problem entry
  const addProblemEntry = (sessionIndex) => {
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      // Ensure we have the array
      if (!session.problemFacedEntries) {
        session.problemFacedEntries = ['']
      }
      
      // Add new empty entry
      session.problemFacedEntries.push('')
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

  // Update problem entry
  const updateProblemEntry = (sessionIndex, problemIndex, value) => {
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      // Ensure we have the array
      if (!session.problemFacedEntries) {
        session.problemFacedEntries = ['']
      }
      
      // Update entry
      session.problemFacedEntries[problemIndex] = value
      
      // Update problemFacedByEngineerHourly field for backward compatibility
      session.problemFacedByEngineerHourly = session.problemFacedEntries
        .filter(entry => entry.trim())
        .map((entry, idx) => `Problem ${idx + 1}: ${entry}`)
        .join('\n')
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

  // Remove problem entry
  const removeProblemEntry = (sessionIndex, problemIndex) => {
    setFormData(prev => {
      const updatedEntries = [...prev.hourlyEntries]
      const session = { ...updatedEntries[sessionIndex] }
      
      if (!session.problemFacedEntries || session.problemFacedEntries.length <= 1) {
        return prev
      }
      
      // Remove the entry
      session.problemFacedEntries = session.problemFacedEntries.filter((_, idx) => idx !== problemIndex)
      
      // Update problemFacedByEngineerHourly field for backward compatibility
      session.problemFacedByEngineerHourly = session.problemFacedEntries
        .filter(entry => entry.trim())
        .map((entry, idx) => `Problem ${idx + 1}: ${entry}`)
        .join('\n')
      
      updatedEntries[sessionIndex] = session
      return { ...prev, hourlyEntries: updatedEntries }
    })
  }

  const validateHourlyEntry = (entry) => {
    const errors = []

    // Check if any activity is entered
    const hasActivity = entry.hourlyActivityEntries?.some(activity => activity.trim()) || 
                       entry.hourlyActivity?.trim()
    
    if (!hasActivity) {
      return errors // No validation if no activities
    }

    // If problem faced is Yes, check resolution
    if (entry.problemFaced === 'Yes') {
      if (!entry.problemResolvedOrNot) {
        errors.push('Problem Resolved or Not is required when problem faced is Yes')
      }
      
      if (entry.problemResolvedOrNot === 'Yes') {
        if (!entry.problemOccurStartTime) {
          errors.push('Problem occur start time is required when problem is resolved')
        }
        if (!entry.problemResolvedEndTime) {
          errors.push('Problem resolved end time is required when problem is resolved')
        }
        if (entry.onlineSupportRequiredForWhichProblem && (!entry.onlineSupportTime || !entry.onlineSupportEndTime || !entry.engineerNameWhoGivesOnlineSupport)) {
          errors.push('Online support details are required when support is requested')
        }
      }
      
      // If problem is not resolved, check if reason is provided
      if (entry.problemResolvedOrNot === 'No') {
        if (!entry.reasonIfNotResolved?.trim()) {
          errors.push('Reason for not resolving the problem is required when problem is not resolved')
        }
      }
    }

    return errors
  }

  useEffect(() => {
    console.log('🔍 Form Data Updated:', {
      reportDate: formData.reportDate,
      projectName: formData.projectName,
      dailyTargetPlanned: formData.dailyTargetPlanned,
      hourlyEntries: formData.hourlyEntries.map(e => ({
        timePeriod: e.timePeriod,
        problemFaced: e.problemFaced,
        problemResolvedOrNot: e.problemResolvedOrNot,
        reasonIfNotResolved: e.reasonIfNotResolved
      }))
    })
  }, [formData])

  useEffect(() => {
    const now = new Date()
    console.log('🕒 Current time:', now.toLocaleTimeString())
    console.log('📅 Current date:', now.toISOString().slice(0, 10))
    
    const activeEntry = formData.hourlyEntries.find(entry => 
      isWithinEditingWindow(entry.startHour, entry.endHour, now)
    )
    console.log('🔍 Current active session:', activeEntry ? activeEntry.timePeriod : 'None')
  }, [formData.hourlyEntries])

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!token) {
      setAlert({ type: 'error', message: 'Authentication required. Please login again.' });
      return;
    }
    
    setSubmitting(true);
    setAlert(null);

    try {
      const now = new Date();
      console.log('🕒 Current time for validation:', now.toLocaleTimeString());
      
      let entry;
      let sessionIndex;
      
      if (editingReport) {
        // Editing existing report
        sessionIndex = editingReport.sessionIndex;
        entry = formData.hourlyEntries[sessionIndex];
        console.log('✏️ Editing existing report for:', entry.timePeriod, 'ID:', editingReport.id);
      } else {
        // Creating new report
        // First, validate only the CURRENT ACTIVE session
        const currentActiveEntry = formData.hourlyEntries.find(entry => 
          isWithinEditingWindow(entry.startHour, entry.endHour, now)
        );
    
        console.log('🔍 Found active entry:', currentActiveEntry);
        
        if (!currentActiveEntry) {
          throw new Error('No active session found. You can only submit reports during active sessions (or up to 30 minutes after).');
        }
        
        entry = currentActiveEntry;
        sessionIndex = formData.hourlyEntries.indexOf(entry);
        
        // IMPORTANT: Always refresh existing reports before checking for duplicates
        await refreshExistingReports();
        
        // Check if this time period already has a report for today (case-insensitive)
        const existingReportForPeriod = existingReports.find(report => {
          if (!report.time_period || !report.report_date) return false;
          
          const reportDate = new Date(report.report_date).toISOString().slice(0, 10);
          const currentDate = formData.reportDate || new Date().toISOString().slice(0, 10);
          
          const reportTimePeriod = report.time_period.toLowerCase().replace(/\s+/g, '');
          const entryTimePeriod = entry.timePeriod.toLowerCase().replace(/\s+/g, '');
          
          console.log('🔍 Duplicate check:');
          console.log('  Report date:', reportDate);
          console.log('  Current date:', currentDate);
          console.log('  Report time period:', reportTimePeriod);
          console.log('  Entry time period:', entryTimePeriod);
          
          return reportDate === currentDate && reportTimePeriod === entryTimePeriod;
        });
        
        console.log('🔍 Found existing report for period:', existingReportForPeriod);
        
   // In the handleSubmit function, update this section:
if (existingReportForPeriod) {
  // Check if the report has data (is filled)
  const isReportFilled = existingReportForPeriod.hourly_activity || 
                        existingReportForPeriod.hourly_achieved || 
                        existingReportForPeriod.problem_faced_by_engineer_hourly;
  
  // Store the existing report ID for easy access
  const existingReportId = existingReportForPeriod.id;
  
  setAlert({
    type: 'warning',
    message: `Report for ${entry.timePeriod} already exists for ${formData.reportDate}. ${
      isReportFilled 
        ? 'This report already contains data.'
        : 'This report appears to be empty.'
    } Click "Edit Report" to view/modify it.`,
    existingReportId: existingReportId, // Add report ID to alert
    existingReportTimePeriod: entry.timePeriod // Add time period
  });
  
  setSubmitting(false);
  return;
}
      }

      // Validate all required fields
      const validationErrors = [];
      
      // Check date
      const formattedDate = formatDateForBackend(formData.reportDate);
      log('Formatted date:', formattedDate);
      if (!formattedDate || formattedDate === 'Invalid Date') {
        validationErrors.push('Report Date is required');
      }
      
      // Check time period
      log('Time period:', entry.timePeriod?.trim());
      if (!entry.timePeriod?.trim()) {
        validationErrors.push('Time Period is required');
      }
      
      // Check project name
      log('Project name:', formData.projectName?.trim());
      if (!formData.projectName?.trim()) {
        validationErrors.push('Project Name is required');
      }
      
      // Check daily target planned (always provide a default)
      const dailyTargetPlanned = formData.dailyTargetPlanned?.trim() || "Auto-generated from hourly session activities";
      log('Daily target planned:', dailyTargetPlanned);
      if (!dailyTargetPlanned) {
        validationErrors.push('Daily Target Planned is required');
      }
      
      // Check if at least one activity is entered (check both string and array)
      const hasActivityFromString = entry.hourlyActivity?.trim();
      const hasActivityFromArray = entry.hourlyActivityEntries?.some(activity => activity?.trim());
      const hasActivity = hasActivityFromString || hasActivityFromArray;
      log('Activity string:', entry.hourlyActivity);
      log('Activity entries:', entry.hourlyActivityEntries);
      log('Has activity (either source):', hasActivity);
      if (!hasActivity) {
        validationErrors.push('At least one Activity is required');
      }

      log('Validation errors:', validationErrors);
      
      if (validationErrors.length > 0) {
        throw new Error(`Validation errors:\n${validationErrors.join('\n')}`);
      }

      // Entry-specific validation
      const entryErrors = validateHourlyEntry(entry);
      if (entryErrors.length > 0) {
        throw new Error(`${entry.timePeriod}: ${entryErrors.join(', ')}`);
      }

      // Format activities with numbering
      let formattedActivities = '';
      if (entry.hourlyActivityEntries && entry.hourlyActivityEntries.length > 0) {
        formattedActivities = entry.hourlyActivityEntries
          .filter(activity => activity?.trim())
          .map((activity, idx) => `Activity ${idx + 1}: ${activity}`)
          .join('\n');
      } else if (entry.hourlyActivity?.trim()) {
        // Use existing hourlyActivity if entries array is not filled
        formattedActivities = entry.hourlyActivity;
      }

      // Add unplanned activities if any
      if (entry.unplannedActivities && entry.unplannedActivities.length > 0) {
        const unplannedList = entry.unplannedActivities
          .filter(act => act?.activity?.trim())
          .map((act, idx) => {
            let text = `[UNPLANNED ${idx + 1}] ${act.activity}`;
            if (act.reason?.trim()) {
              text += ` (Reason: ${act.reason})`;
            }
            if (act.priority && act.priority !== 'Normal') {
              text += ` [Priority: ${act.priority}]`;
            }
            return text;
          })
          .join('\n');
        
        if (unplannedList) {
          formattedActivities = formattedActivities 
            ? `${formattedActivities}\n\n--- Other/Unplanned Activities ---\n${unplannedList}`
            : `--- Other/Unplanned Activities ---\n${unplannedList}`;
        }
      }

      // Format achievements - ONLY if entries exist (empty array = no achievements)
      let formattedAchievements = '';
      if (entry.hourlyAchievedEntries && Array.isArray(entry.hourlyAchievedEntries) && entry.hourlyAchievedEntries.length > 0) {
        formattedAchievements = entry.hourlyAchievedEntries
          .filter(achieved => achieved?.trim()) // Only keep non-empty
          .map((achieved) => achieved.trim()) // Just the achievement text, no prefix
          .join('\n');
      } else if (entry.hourlyAchieved?.trim()) {
        // Fallback to string field if array is empty
        formattedAchievements = entry.hourlyAchieved;
      }

      // Format problems with numbering
      let formattedProblems = '';
      if (entry.problemFacedEntries && entry.problemFacedEntries.length > 0) {
        formattedProblems = entry.problemFacedEntries
          .filter(problem => problem?.trim())
          .map((problem, idx) => `Problem ${idx + 1}: ${problem}`)
          .join('\n');
      } else if (entry.problemFacedByEngineerHourly?.trim()) {
        formattedProblems = entry.problemFacedByEngineerHourly;
      }

      // Create payload with proper time period format
      const payload = {
        // REQUIRED FIELDS ONLY
        reportDate: formattedDate,
        timePeriod: entry.timePeriod.trim(),
        projectName: formData.projectName.trim(),
        dailyTarget: dailyTargetPlanned,
        dailyTargetAchieved: totalAchieved,
        hourlyActivity: formattedActivities,
        
        // Add achievements without prefix
        hourlyAchieved: formattedAchievements,
        problemFacedByEngineerHourly: formattedProblems,
        problemFaced: entry.problemFaced || 'No',
        problemResolvedOrNot: entry.problemResolvedOrNot || '',
        problemOccurStartTime: entry.problemOccurStartTime || '',
        problemResolvedEndTime: entry.problemResolvedEndTime || '',
        reasonIfNotResolved: entry.reasonIfNotResolved || '',
        onlineSupportRequiredForWhichProblem: entry.onlineSupportRequiredForWhichProblem || '',
        onlineSupportTime: entry.onlineSupportTime || '',
        onlineSupportEndTime: entry.onlineSupportEndTime || '',
        engineerNameWhoGivesOnlineSupport: entry.engineerNameWhoGivesOnlineSupport || '',
        
        // Add user info
        user_id: user?.id || '',
        employee_id: user?.employeeId || user?.id || '',
        employee_name: user?.name || user?.username || ''
      };

      // Add plan achievement data if it exists
      const planData = Object.entries(selectedPlanForActivity)
        .filter(([key]) => {
          const [sessionIdx] = key.split('-').map(Number);
          return sessionIdx === sessionIndex;
        })
        .map(([key, planId]) => {
          const [_, activityIdx] = key.split('-').map(Number);
          const activity = entry.hourlyActivityEntries?.[activityIdx] || '';
          const achievementStatus = planAchievementStatus[key] || 'No';
          return {
            planId,
            activityIndex: activityIdx,
            activity,
            achieved: achievementStatus
          };
        });
      
      if (planData.length > 0) {
        payload.planAchievementData = planData;
      }

      log('PAYLOAD:', payload)

      let response;
      let url = endpoint;
      
      if (editingReport) {
        // Update existing report - add edit timestamp
        url = `${endpoint}/${editingReport.id}`;
        payload.edited_at = new Date().toISOString();
        payload.edited_by = user?.username || user?.name || user?.id || 'Unknown';
        console.log('🔄 Updating report at:', url);
        
        // Double-check we're not creating a duplicate when editing
        const existingReportCheck = existingReports.find(report => 
          report.id !== editingReport.id && 
          report.report_date === formattedDate &&
          report.time_period.toLowerCase().replace(/\s+/g, '') === entry.timePeriod.toLowerCase().replace(/\s+/g, '')
        );

        if (existingReportCheck) {
          const role = (user?.role || '').toLowerCase()
          const isManagerish = role.includes('manager') || role.includes('team leader') || role.includes('group leader')
          if (!isManagerish) {
            throw new Error(`Cannot update report: Another report already exists for ${entry.timePeriod} on ${formattedDate}. Please delete the duplicate first.`);
          } else {
            const confirmOverride = window.confirm(`Another report exists for ${entry.timePeriod} on ${formattedDate}. As a manager you can override and update this report. Proceed?`)
            if (!confirmOverride) {
              throw new Error('Update cancelled by user')
            }
          }
        }
        
        response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new report
        log('Creating new report')
        // If a site location is provided, create a MoM record first (compulsory)
        try {
          const momEndpoint = endpoint.replace('/api/hourly-report', '/api/employee-activity')
          if (formData.siteLocation && formData.siteLocation.trim()) {
            const momPayload = {
              enggName: user?.username || user?.name || '',
              siteLocation: formData.siteLocation,
              momDate: formattedDate,
              reportingTime: entry.startHour ? `${entry.startHour}:00` : '',
              momCloseTime: entry.endHour ? `${entry.endHour}:00` : '',
              manHours: totalAchieved || '',
              siteStartDate: formData.siteStartDate || formattedDate,
              siteEndDate: formData.siteEndDate || formattedDate,
              projectName: formData.projectName || '',
              observationNotes: formattedActivities || '',
              solutionNotes: formattedAchievements || '',
              conclusion: ''
            }

            const momRes = await fetch(`${momEndpoint}/mom-records`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify(momPayload)
            })

            if (momRes.ok) {
              const momData = await momRes.json()
              try { localStorage.setItem('momCreated', JSON.stringify({ momId: momData.momId || momData.momId || momData.insertId || null, date: formattedDate, siteLocation: formData.siteLocation })) } catch(e) { }
            } else {
              console.warn('Failed to create MoM automatically for site location')
            }
          }
        } catch (e) {
          console.error('Error creating MoM before hourly report:', e)
        }

        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      console.log('🔍 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        let errorMessage = `Failed to ${editingReport ? 'update' : 'save'} hourly report: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          console.error('❌ Backend error details:', errorData);
          
          // Check for duplicate report error
          if (response.status === 409) {
            if (editingReport) {
              errorMessage = `Cannot update: Another report already exists for this time period. Error: ${errorData.message || 'Duplicate report found'}`;
            } else {
              errorMessage = `Report already exists for ${entry.timePeriod} on ${formattedDate}. Please edit the existing report instead.`;
            }
          } else if (errorData.error && errorData.error.sqlMessage) {
            errorMessage = `Database error: ${errorData.error.sqlMessage}`;
          } else if (errorData.error && errorData.error.code) {
            errorMessage = `Database error (${errorData.error.code}): ${errorData.error.message || errorData.message}`;
          } else {
            errorMessage = `${response.status}: ${errorData.message || errorData.error || JSON.stringify(errorData)}`;
          }
        } catch (e) {
          console.error('❌ Could not parse error response:', e);
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      log(`Successfully ${editingReport ? 'updated' : 'saved'} hourly report`, result);
      
      // Trigger ActivityDisplay refresh via localStorage
      if (editingReport) {
        localStorage.setItem('hourlyReportEdited', new Date().toISOString())
      }
      
      // Highlight the created/updated report and then refresh the list
      if (result && result.id) setHighlightedReportId(result.id)
      await refreshExistingReports();

      setAlert({
        type: 'success',
        message: `${entry.timePeriod} report ${editingReport ? 'updated' : 'saved'} successfully!`
      });

      if (editingReport) {
        // Reset editing state after successful update
        const sessionIdx = editingReport.sessionIndex;
        const editedEntry = formData.hourlyEntries[sessionIdx];
        
        // Reset the form for this session to allow new entries
        setFormData(prev => ({
          ...prev,
          hourlyEntries: prev.hourlyEntries.map((hourlyEntry, idx) => 
            idx === sessionIdx
              ? {
                  ...createHourlyEntry(),
                  timePeriod: editedEntry.timePeriod,
                  periodName: editedEntry.periodName,
                  startHour: editedEntry.startHour,
                  endHour: editedEntry.endHour
                }
              : hourlyEntry
          )
        }));
        
        // Clear editing state
        setEditingReport(null);
        
        // Ensure form date is back to today
        const todayDate = getTodayDateString();
        setFormData(prev => ({
          ...prev,
          reportDate: todayDate
        }));
        
        setAlert({
          type: 'success',
          message: `${entry.timePeriod} report updated successfully! The updated report is now visible in the View Activities section.`
        });
      } else {
        // Reset only the submitted hourly entry for new reports
        setFormData(prev => ({
          ...prev,
          hourlyEntries: prev.hourlyEntries.map(hourlyEntry => 
            hourlyEntry.timePeriod === entry.timePeriod
              ? {
                  ...createHourlyEntry(),
                  timePeriod: entry.timePeriod,
                  periodName: entry.periodName,
                  startHour: entry.startHour,
                  endHour: entry.endHour
                }
              : hourlyEntry
          )
        }));
      }
      
      // Reset plan links and achievement status for the submitted session
      Object.keys(selectedPlanForActivity).forEach(key => {
        const [sessionIdx] = key.split('-').map(Number);
        if (sessionIdx === sessionIndex) {
          delete selectedPlanForActivity[key];
          delete planAchievementStatus[key];
        }
      });
      
    } catch (error) {
      console.error('❌ Submit error:', error);
      
      setAlert({ 
        type: 'error', 
        message: error.message || `Failed to ${editingReport ? 'update' : 'submit'} report. Please check all required fields and try again.` 
      });
    } finally {
      setSubmitting(false);
    }
  };
// Helper function to find existing report by time period
const findExistingReportByPeriod = (timePeriod) => {
  return existingReports.find(report => {
    if (!report.time_period || !report.report_date) return false;
    
    const reportDate = new Date(report.report_date).toISOString().slice(0, 10);
    const currentDate = formData.reportDate || new Date().toISOString().slice(0, 10);
    
    // Normalize time period format
    const normalizePeriod = (period) => period.toLowerCase().replace(/\s+/g, '');
    const reportPeriod = normalizePeriod(report.time_period);
    const targetPeriod = normalizePeriod(timePeriod);
    
    return reportDate === currentDate && reportPeriod === targetPeriod;
  });
};
  // Function to fetch daily target from localStorage
  const fetchDailyTargetFromLocalStorage = () => {
    if (!user?.id) return '';
    
    try {
      // Check local storage for saved daily target form
      const savedData = localStorage.getItem(`daily-report-auto-save-${user.id}`);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        
        // Only use if it's from today OR same date as hourly report
        const targetDate = formData.reportDate || new Date().toISOString().slice(0, 10);
        if (parsedData.date === targetDate) {
          console.log('📋 Found daily target in localStorage:', parsedData.dailyTargetPlanned);
          return parsedData.dailyTargetPlanned || '';
        }
      }
      
      // Also check session storage
      const sessionData = sessionStorage.getItem(`daily-report-session-${user.id}`);
      if (sessionData) {
        const parsedData = JSON.parse(sessionData);
        const targetDate = formData.reportDate || new Date().toISOString().slice(0, 10);
        if (parsedData.date === targetDate) {
          console.log('📋 Found daily target in sessionStorage:', parsedData.dailyTargetPlanned);
          return parsedData.dailyTargetPlanned || '';
        }
      }
      
      return '';
    } catch (error) {
      console.error('Error fetching daily target from storage:', error);
      return '';
    }
  };

  // Add this useEffect to auto-populate dailyTargetPlanned
  useEffect(() => {
    const autoFillDailyTarget = () => {
      // Only auto-fill if field is empty and we have a date
      if (!formData.dailyTargetPlanned && formData.reportDate && user?.id) {
        const dailyTarget = fetchDailyTargetFromLocalStorage();
        if (dailyTarget && dailyTarget.trim()) {
          setFormData(prev => ({
            ...prev,
            dailyTargetPlanned: dailyTarget
          }));
          console.log('✅ Auto-filled daily target from saved form');
          
          // Show success message
          setAlert({
            type: 'success',
            message: `Daily target loaded from your saved form for ${formData.reportDate}`
          });
          
          // Auto-clear after 3 seconds
          setTimeout(() => {
            setAlert(prev => prev?.type === 'success' ? null : prev);
          }, 3000);
        }
      }
    };
    
    autoFillDailyTarget();
  }, [formData.reportDate, user?.id, formData.dailyTargetPlanned]);

  // Add this useEffect to auto-generate daily target from activities
  useEffect(() => {
    const autoGenerateDailyTarget = () => {
      // If daily target is already set, don't override
      if (formData.dailyTargetPlanned?.trim()) {
        return
      }
      
      // Collect all activities from all sessions
      const allActivities = []
      formData.hourlyEntries.forEach(entry => {
        if (entry.hourlyActivityEntries) {
          entry.hourlyActivityEntries
            .filter(activity => activity.trim())
            .forEach(activity => allActivities.push(activity.trim()))
        }
      })
      
      // If there are activities, generate a daily target
      if (allActivities.length > 0) {
        let dailyTarget = 'Today\'s plan: '
        
        if (allActivities.length === 1) {
          dailyTarget = allActivities[0]
        } else if (allActivities.length === 2) {
          dailyTarget = `1) ${allActivities[0]}\n2) ${allActivities[1]}`
        } else {
          dailyTarget = allActivities.map((activity, idx) => `${idx + 1}) ${activity}`).join('\n')
        }
        
        // Update daily target
        setFormData(prev => ({
          ...prev,
          dailyTargetPlanned: dailyTarget
        }))
      }
    }
    
    autoGenerateDailyTarget()
  }, [formData.hourlyEntries, formData.dailyTargetPlanned])
  
  // Function to get status badge style
  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'active':
        return { background: '#2ad1ff', color: 'white' }
      case 'submitted':
        return { background: '#06c167', color: 'white' }
      case 'editable':
        return { background: '#ffc107', color: '#092544' }
      case 'missed':
        return { background: '#ff7a7a', color: 'white' }
      case 'pending':
        return { background: '#8892aa', color: 'white' }
      default:
        return { background: '#f5f5f5', color: '#092544' }
    }
  }

  // Function to get session status text
  const getSessionStatusText = (periodKey, status) => {
    const existingReport = status.report;
    
    switch (status.status) {
      case 'active':
        return 'ACTIVE - Fill now'
      case 'submitted':
        return existingReport?.isFilled ? 'FILLED ✓' : 'SUBMITTED ✓'
      case 'editable':
        // Check if report has content
        const isFilled = existingReport && status.isFilled;
        return isFilled ? 'FILLED - Can edit' : 'STARTED - Can edit'
      case 'missed':
        return 'MISSED ✗'
      case 'pending':
        return 'UPCOMING ⏰'
      default:
        return 'Unknown'
    }
  }

  // Function to get achievement badge style
  const getAchievementBadgeStyle = (status) => {
    switch (status) {
      case 'Yes':
        return { background: '#06c167', color: 'white', border: '2px solid #06c167' }
      case 'No':
        return { background: '#ff7a7a', color: 'white', border: '2px solid #ff7a7a' }
      default:
        return { background: '#f5f5f5', color: '#092544', border: '2px solid #d5e0f2' }
    }
  }

  return (
    <section className="vh-form-shell">
      <header className="vh-form-header">
        <div>
          <p className="vh-form-label">Hourly Activity Report</p>
          <h2>Log your activities in two sessions: 9am-1pm and 2pm-4pm</h2>
          <p>
            Record your activities, achievements, and problems. Click "+" to add more entries as needed.
            {editingReport && (
              <span style={{ color: '#ffc107', fontWeight: 'bold', display: 'block', marginTop: '0.5rem' }}>
                ✏️ You are currently editing {editingReport.timePeriod} report
                {editingReport.isFilled ? ' (already filled)' : ' (empty)'}
              </span>
            )}
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
                    {totalAchieved.split('\n').map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
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
                  {formData.hourlyEntries.flatMap(e => e.hourlyAchievedEntries || []).filter(e => e?.trim()).length} achievements
                </div>
              </div>
              <small style={{ color: '#6c757d', display: 'block', marginTop: '0.5rem' }}>
                This will be saved as "Daily Target Achieved" when you submit your reports
              </small>
            </div>
          )}
        </div>
      </header>

      {/* Update the alert display section */}
{/* Update the alert display section */}
{alert && (
  <div className={`vh-alert ${alert.type}`} style={{ 
    ...(alert.type === 'warning' && { 
      border: '2px solid #ffc107',
      background: '#fffcf0'
    })
  }}>
    <p>{alert.message}</p>
    <button
  onClick={() => {
    const now = new Date();
    const currentActiveEntry = formData.hourlyEntries.find(entry => 
      isWithinEditingWindow(entry.startHour, entry.endHour, now)
    );
    
    if (currentActiveEntry) {
      const sessionIndex = formData.hourlyEntries.indexOf(currentActiveEntry);
      clearSessionForm(sessionIndex);
      
      setAlert({
        type: 'info',
        message: `Form cleared for ${currentActiveEntry.timePeriod}. You can now fill a new report.`
      });
    }
  }}
  style={{
    padding: '0.5rem 1rem',
    background: '#f8f9fa',
    color: '#6c757d',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  }}
>
  <span>🔄</span> Clear Form & Start New
</button>
    {/* Show Edit button when report already exists */}
    {(alert.type === 'warning' && alert.message.includes('Report already exists')) && (
      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={async () => {
              if (alert.existingReportId) {
                // Load the existing report for editing
                await loadReportForEditing(alert.existingReportId);
                
                // Clear the alert
                setAlert(null);
                
                // Scroll to editing section
                setTimeout(() => {
                  const editingSection = document.querySelector('[style*="EDITING MODE"]');
                  if (editingSection) {
                    editingSection.scrollIntoView({ 
                      behavior: 'smooth', 
                      block: 'center' 
                    });
                  }
                }, 300);
              } else {
                // Fallback: find report by time period
                const period = alert.existingReportTimePeriod || alert.message.match(/for (.*?) on/)?.[1];
                if (period && existingReports.length > 0) {
                  const report = existingReports.find(r => r.time_period === period);
                  if (report) {
                    await loadReportForEditing(report.id);
                    setAlert(null);
                    
                    setTimeout(() => {
                      const editingSection = document.querySelector('[style*="EDITING MODE"]');
                      if (editingSection) {
                        editingSection.scrollIntoView({ 
                          behavior: 'smooth', 
                          block: 'center' 
                        });
                      }
                    }, 300);
                  }
                }
              }
            }}
            style={{
              padding: '0.5rem 1rem',
              background: '#ffc107',
              color: '#092544',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span>✏️</span> Edit Existing Report
          </button>
          
          <button
            onClick={() => {
              // Clear the form for this session and allow new submission
              const now = new Date();
              const currentActiveEntry = formData.hourlyEntries.find(entry => 
                isWithinEditingWindow(entry.startHour, entry.endHour, now)
              );
              
              if (currentActiveEntry) {
                const sessionIndex = formData.hourlyEntries.indexOf(currentActiveEntry);
                
                // Reset just this session's form
                setFormData(prev => ({
                  ...prev,
                  hourlyEntries: prev.hourlyEntries.map((hourlyEntry, idx) => 
                    idx === sessionIndex
                      ? {
                          ...createHourlyEntry(),
                          timePeriod: hourlyEntry.timePeriod,
                          periodName: hourlyEntry.periodName,
                          startHour: hourlyEntry.startHour,
                          endHour: hourlyEntry.endHour
                        }
                      : hourlyEntry
                  )
                }));
                
                setAlert({
                  type: 'info',
                  message: `Form cleared for ${currentActiveEntry.timePeriod}. You can now fill a new report.`
                });
              }
            }}
            style={{
              padding: '0.5rem 1rem',
              background: '#f8f9fa',
              color: '#6c757d',
              border: '1px solid #dee2e6',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span>🔄</span> Clear Form & Start New
          </button>
          
          <button
            onClick={() => setAlert(null)}
            style={{
              padding: '0.5rem 1rem',
              background: 'transparent',
              color: '#6c757d',
              border: '1px solid #dee2e6',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Dismiss
          </button>
        </div>
        
        <div style={{ 
          fontSize: '0.85rem', 
          color: '#856404', 
          marginTop: '0.75rem',
          padding: '0.5rem',
          background: '#fff3cd',
          borderRadius: '4px',
          borderLeft: '3px solid #ffc107'
        }}>
          <strong>ℹ️ Options:</strong>
          <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
            <li><strong>Edit Existing Report:</strong> Modify your submitted report</li>
            <li><strong>Clear Form & Start New:</strong> Start fresh (but cannot submit duplicate)</li>
            <li><strong>Dismiss:</strong> Close this message</li>
          </ul>
        </div>
      </div>
    )}
    
    {/* For other alerts, show dismiss button */}
    {alert.type !== 'warning' || !alert.message.includes('Report already exists') ? (
      <button
        onClick={() => setAlert(null)}
        style={{
          marginTop: '0.75rem',
          padding: '0.5rem 1rem',
          background: 'transparent',
          color: alert.type === 'success' ? '#155724' : 
                 alert.type === 'error' ? '#721c24' : '#856404',
          border: `1px solid ${alert.type === 'success' ? '#c3e6cb' : 
                            alert.type === 'error' ? '#f5c6cb' : '#ffeaa7'}`,
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '0.85rem'
        }}
      >
        Dismiss
      </button>
    ) : null}
  </div>
)}

      {/* Session Status Overview */}
     {/* Session Status Overview */}
<div style={{ 
  marginBottom: '2rem',
  background: '#f8f9fa',
  padding: '1.5rem',
  borderRadius: '12px',
  border: '1px solid #dee2e6'
}}>
  <h3 style={{ color: '#092544', marginBottom: '1rem' }}>Today's Session Status</h3>
  <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
    Current time: <strong>{new Date().toLocaleTimeString()}</strong> | 
    Date: <strong>{formData.reportDate || 'Not selected'}</strong> |
    You can edit reports within 30 minutes after each session ends.
  </p>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
    {generateTimePeriods().map((period, index) => {
      const periodKey = period.name.toLowerCase().replace(' session', '')
      const status = getSessionStatus(period)
      const badgeStyle = getStatusBadgeStyle(status.status)
      
      return (
        <div key={index} style={{
          padding: '1rem',
          background: 'white',
          borderRadius: '8px',
          border: `2px solid ${badgeStyle.background}`,
          textAlign: 'center',
          position: 'relative'
        }}>
          <div style={{ 
            fontSize: '0.9rem', 
            color: '#6c757d',
            marginBottom: '0.5rem'
          }}>
            {period.name}
          </div>
          <div style={{ 
            fontSize: '1.2rem', 
            fontWeight: 'bold',
            marginBottom: '0.5rem'
          }}>
            {period.label}
          </div>
          <span style={{
            background: badgeStyle.background,
            color: badgeStyle.color,
            padding: '0.25rem 0.75rem',
            borderRadius: '12px',
            fontSize: '0.8rem',
            fontWeight: 'bold',
            marginBottom: '0.5rem',
            display: 'inline-block'
          }}>
            {getSessionStatusText(periodKey, status)}
          </span>
          
          {/* Status details */}
          <div style={{
            fontSize: '0.8rem',
            color: '#6c757d',
            marginTop: '0.5rem'
          }}>
            <div>Status: {status.status.toUpperCase()}</div>
            <div>Can Edit: {status.canEdit ? 'Yes' : 'No'}</div>
            {status.report && (
              <>
                <div>Report: {status.report.id ? 'Exists' : 'Not found'}</div>
                <small>
                  Last updated: {new Date(status.report.updated_at || status.report.created_at).toLocaleTimeString()}
                </small>
              </>
            )}
          </div>
          
          {/* Action buttons */}
          {status.report && (
            <div style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => loadReportForEditing(status.report.id)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: status.canEdit ? '#06c167' : '#ffc107',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 'bold'
                }}
              >
                {status.canEdit ? 'Edit Report' : 'View/Force Edit'}
              </button>
            </div>
          )}
        </div>
      )
    })}
  </div>
</div>
      {/* View Activities Section - Shows only today's submitted reports */}
      {existingReports.filter(r => r.report_date === formData.reportDate).length > 0 && (
        <div style={{ 
          marginBottom: '2rem',
          background: '#f0f7ff',
          padding: '1.5rem',
          borderRadius: '12px',
          border: '2px solid #2ad1ff'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ color: '#092544', margin: '0 0 0.25rem 0' }}>
                📋 View Activities & Achievements
                <span style={{ fontSize: '0.9rem', color: '#6c757d', marginLeft: '0.5rem' }}>
                  ({existingReports.filter(r => r.report_date === formData.reportDate).length} for {formData.reportDate})
                </span>
              </h3>
              <p style={{ color: '#6c757d', fontSize: '0.85rem', margin: 0 }}>
                All reports submitted today. Click "Edit Report" to modify any submission.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshExistingReports}
              style={{
                padding: '0.5rem 1rem',
                background: '#2ad1ff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Refresh
            </button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {existingReports.filter(r => r.report_date === formData.reportDate).map((report, index) => {
              const isBeingEdited = editingReport?.id === report.id;
              const canEdit = true; // Always allow editing of submitted reports
              const isReportFilled = report.hourly_activity || 
                                   report.hourly_achieved || 
                                   report.problem_faced_by_engineer_hourly;
              
              return (
                <div key={index} data-report-id={report.id} style={{
                  padding: '1rem',
                  background: isBeingEdited ? '#fffcf0' : (isReportFilled ? '#f0fff4' : 'white'),
                  borderRadius: '8px',
                  border: isBeingEdited ? '2px solid #ffc107' : 
                          (isReportFilled ? '1px solid #06c167' : '1px solid #dee2e6'),
                  position: 'relative'
                }}>
                  {/* Report status indicator */}
                  <div style={{
                    position: 'absolute',
                    top: '0.5rem',
                    left: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    {isReportFilled ? (
                      <span style={{
                        background: '#06c167',
                        color: 'white',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem'
                      }}>
                        ✓
                      </span>
                    ) : (
                      <span style={{
                        background: '#ffc107',
                        color: '#092544',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem'
                      }}>
                        ✏️
                      </span>
                    )}
                  </div>
                  
                  <div style={{ marginBottom: '0.5rem', paddingLeft: '1.5rem' }}>
                    <strong>{report.time_period}</strong>
                    <div style={{ fontSize: '0.9rem', color: '#6c757d', marginTop: '0.25rem' }}>
                      <div>Project: {report.project_name}</div>
                      <div style={{ marginTop: '0.25rem' }}>
                        Status: <span style={{
                          color: isReportFilled ? '#06c167' : '#ffc107',
                          fontWeight: 'bold'
                        }}>
                          {isReportFilled ? 'Filled' : 'Started'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '0.85rem', color: '#092544', marginBottom: '0.5rem' }}>
                    <div><strong>Activities:</strong> {
                      report.hourly_activity ? report.hourly_activity.split('\n').length : 0
                    }</div>
                    <div><strong>Achievements:</strong> {
                      report.hourly_achieved ? report.hourly_achieved.split('\n').length : 0
                    }</div>
                    {!isReportFilled && (
                      <div style={{ color: '#ffc107', marginTop: '0.25rem' }}>
                        ⚠️ This report needs to be filled
                      </div>
                    )}
                    <div style={{ fontSize: '0.8rem', color: '#6c757d', marginTop: '0.25rem' }}>
                      Submitted at: {new Date(report.created_at || report.updated_at).toLocaleTimeString()}
                    </div>
                  </div>
                  
                  // In the existing reports section, update the button section:
<div style={{ display: 'flex', gap: '0.5rem' }}>
  {/* In the existing reports section, update the edit button: */}
<button
  type="button"
  onClick={async () => {
    await loadReportForEditing(report.id);
    scrollToEditingSection();
  }}
  style={{
    flex: 1,
    padding: '0.5rem',
    background: isBeingEdited ? '#ffc107' : (isReportFilled ? '#2ad1ff' : '#06c167'),
    color: isBeingEdited ? '#092544' : 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 'bold'
  }}
>
  {isBeingEdited ? '✏️ Currently Editing' : (isReportFilled ? '✏️ Edit Report' : '✏️ Fill Report')}
</button>
  
  {/* Force Edit button (for missed sessions) */}
  {!canEdit && status.status === 'missed' && (
    <button
      type="button"
      onClick={() => enableEditingForReport(report.id)}
      style={{
        padding: '0.5rem',
        background: '#ffc107',
        color: '#092544',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '0.85rem'
      }}
      title="Edit this report (admin override)"
    >
      ⚙️ Force Edit
    </button>
  )}
  
  {/* Delete button */}
  <button
    type="button"
    onClick={() => deleteReport(report.id)}
    style={{
      padding: '0.5rem',
      background: '#ff7a7a',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.85rem'
    }}
    title="Delete this report"
  >
    🗑️ Delete
  </button>
</div>
                  
                  {/* Show editing instructions when this report is being edited */}
                  {isBeingEdited && (
                    <div style={{ 
                      marginTop: '1rem',
                      padding: '0.75rem',
                      background: '#fff3cd',
                      border: '1px solid #ffc107',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      color: '#856404'
                    }}>
                      <strong>Editing Mode Active:</strong> You are now editing this report. {
                        isReportFilled 
                          ? 'This report already contains data. Make your changes and click "Update Report".'
                          : 'This report is currently empty. Fill in the details and click "Update Report".'
                      }
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          
          {/* Note about editing */}
          <div style={{ 
            marginTop: '1rem',
            padding: '0.75rem',
            background: '#e6f7ff',
            border: '1px solid #2ad1ff',
            borderRadius: '6px',
            fontSize: '0.85rem',
            color: '#092544'
          }}>
            <strong>📝 How to Edit:</strong>
            <ol style={{ margin: '0.5rem 0 0 1rem', paddingLeft: '0' }}>
              <li>Click "Edit Report" on any submitted report</li>
              <li>The form above will be populated with the existing data</li>
              <li>Make your changes and click "Update Report"</li>
              <li>Click "Cancel" to stop editing</li>
            </ol>
            <p style={{ marginTop: '0.5rem' }}>
              <strong>Note:</strong> Reports marked with <span style={{ color: '#06c167' }}>✓ Filled</span> contain data, 
              while those with <span style={{ color: '#ffc107' }}>✏️ Started</span> are empty and need to be filled.
            </p>
          </div>
        </div>
      )}


export default HourlyReportForm
      <form className="vh-form" onSubmit={handleSubmit}>
        {/* Date Selection and Project Selection */}
        <div className="vh-grid">
          <label>
            <span>Report Date *</span>
            <input
              type="date"
              name="reportDate"
              value={formData.reportDate}
              onChange={handleChange}
              required
              disabled={editingReport}
              style={{ border: !formData.reportDate ? '2px solid #ff7a7a' : '' }}
            />
            <small style={{ 
              color: !formData.reportDate ? '#ff7a7a' : '#6c757d', 
              marginTop: '0.25rem', 
              display: 'block' 
            }}>
              {!formData.reportDate ? '⚠️ This field is required' : 'Select the date for your report'}
            </small>
          </label>

          <label className="vh-span-2">
            <span>Project Name *</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              {/* Project selection dropdown */}
              <select
                name="projectSelect"
                value={formData.projectName}
                onChange={(e) => {
                  if (e.target.value === '__MANUAL__') {
                    setFormData(prev => ({ 
                      ...prev, 
                      projectName: '',
                      dailyTargetPlanned: '', // Clear daily target when switching to manual
                      isManualProject: true 
                    }))
                  } else if (e.target.value) {
                    // Find the selected project
                    const selectedProject = projectList.find(project => 
                      (project.project_no || project.name || project.project_name) === e.target.value
                    )
                    
                    // Update form with project details
                    setFormData(prev => ({ 
                      ...prev, 
                      projectName: e.target.value,
                      dailyTargetPlanned: selectedProject?.dailyTargetPlanned || '',
                      customerName: selectedProject?.customer || selectedProject?.customer_name || '',
                      incharge: selectedProject?.incharge || selectedProject?.project_incharge || '',
                      siteLocation: selectedProject?.site_location || selectedProject?.location || '',
                      isManualProject: false 
                    }))
                    
                    // If you have project IDs, fetch detailed project info
                    if (selectedProject?.id) {
                      fetchProjectDetails(selectedProject.id)
                    }
                  }
                }}
                disabled={loadingProjects || editingReport}
                style={{ 
                  border: !formData.projectName?.trim() ? '2px solid #ff7a7a' : '',
                  flex: 1,
                  display: formData.isManualProject ? 'none' : 'block'
                }}
              >
                <option value="">
                  {loadingProjects ? 'Loading assigned projects...' : 
                  projectList.length === 0 ? 'No assigned projects' : 
                  'Select from assigned projects'}
                </option>
                {projectList.map((project, index) => (
                  <option 
                    key={project.id || project.project_id || index} 
                    value={project.project_no || project.name || project.project_name || ''}
                  >
                    {project.project_no || project.name || project.project_name || `Project ${index + 1}`} 
                    {project.dailyTargetPlanned ? ` - ${project.dailyTargetPlanned.substring(0, 30)}${project.dailyTargetPlanned.length > 30 ? '...' : ''}` : ''}
                  </option>
                ))}
                <option value="__MANUAL__">✏️ Type project manually</option>
              </select>
              
              {/* Add this after the project selection */}
              {formData.dailyTargetPlanned && formData.projectName && !formData.isManualProject && (
                <div style={{ 
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  background: '#e6f7ff',
                  border: '1px solid #2ad1ff',
                  borderRadius: '8px',
                  fontSize: '0.9rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ color: '#2ad1ff', fontSize: '1rem' }}>✓</div>
                    <div>
                      <strong>Auto-filled from selected project:</strong>
                      <div style={{ marginTop: '0.25rem', color: '#092544' }}>
                        <div><strong>Daily Target:</strong> {formData.dailyTargetPlanned}</div>
                        {formData.customerName && (
                          <div><strong>Customer:</strong> {formData.customerName}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Manual input field (shown when user chooses to type) */}
              {(formData.isManualProject || !formData.projectName) && (
                <div style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    name="projectName"
                    value={formData.projectName}
                    onChange={handleChange}
                    placeholder="Type project name manually..."
                    required
                    disabled={editingReport}
                    style={{ 
                      border: !formData.projectName?.trim() ? '2px solid #ff7a7a' : '',
                      flex: 1
                    }}
                  />
                  {formData.isManualProject && !editingReport && (
                    <button
                      type="button"
                      onClick={() => {
                        // Go back to dropdown
                        setFormData(prev => ({ 
                          ...prev, 
                          projectName: '',
                          isManualProject: false 
                        }))
                      }}
                      style={{
                        padding: '0.5rem',
                        background: '#f5f5f5',
                        color: '#092544',
                        border: '1px solid #d5e0f2',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        fontSize: '0.8rem'
                      }}
                      title="Show assigned projects"
                    >
                      ← Back
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {/* Help text */}
            {!formData.projectName?.trim() ? (
              <small style={{ color: '#ff7a7a', marginTop: '0.25rem', display: 'block' }}>
                ⚠️ Project name is required
              </small>
            ) : formData.isManualProject ? (
              <small style={{ color: '#2ad1ff', marginTop: '0.25rem', display: 'block' }}>
                ✏️ Using manually entered project name
              </small>
            ) : projectList.length > 0 && !loadingProjects ? (
              <small style={{ color: '#06c167', marginTop: '0.25rem', display: 'block' }}>
                ✓ Selected from {projectList.length} assigned project(s)
              </small>
            ) : null}
            
            {!token && (
              <small style={{ color: '#ff7a7a', marginTop: '0.25rem', display: 'block' }}>
                ⚠️ Please login to see assigned projects
              </small>
            )}
          </label>
        </div>

        {/* Daily Target Information */}
        <div className="vh-grid">
          <label className="vh-span-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span>Daily Target Planned</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    const dailyTarget = fetchDailyTargetFromLocalStorage();
                    if (dailyTarget) {
                      setFormData(prev => ({
                        ...prev,
                        dailyTargetPlanned: dailyTarget
                      }));
                      setAlert({
                        type: 'success',
                        message: 'Daily target loaded from saved form!'
                      });
                    } else {
                      setAlert({
                        type: 'warning',
                        message: 'No saved daily target found. Please fill the Daily Target Form first.'
                      });
                    }
                  }}
                  disabled={editingReport}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#2ad1ff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: editingReport ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    opacity: editingReport ? 0.5 : 1
                  }}
                >
                  <span>↻</span>
                  Load from Daily Form
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    // Generate from activities
                    const allActivities = formData.hourlyEntries
                      .flatMap(entry => entry.hourlyActivityEntries || [])
                      .filter(activity => activity.trim())
                      .map((activity, idx) => `${idx + 1}) ${activity}`)
                      .join('\n');
                    
                    if (allActivities) {
                      setFormData(prev => ({
                        ...prev,
                        dailyTargetPlanned: `Today's Plan:\n${allActivities}`
                      }));
                      setAlert({
                        type: 'info',
                        message: 'Daily target generated from activities'
                      });
                    }
                  }}
                  disabled={editingReport}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#06c167',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: editingReport ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    opacity: editingReport ? 0.5 : 1
                  }}
                >
                  <span>⚡</span>
                  Generate from Activities
                </button>
              </div>
            </div>
            
            <textarea
              rows={3}
              name="dailyTargetPlanned"
              value={formData.dailyTargetPlanned}
              onChange={handleChange}
              placeholder="Describe what you plan to achieve today... (Auto-fills from Daily Form)"
              disabled={editingReport}
            />
            
            {/* Help text */}
            <small style={{ color: '#6c757d', marginTop: '0.25rem', display: 'block' }}>
              {formData.dailyTargetPlanned ? 
                '✓ Daily target loaded. You can edit it.' : 
                'Click "Load from Daily Form" to get target from your Daily Target Form'}
            </small>
            
            {/* Source indicator */}
            {formData.dailyTargetPlanned && (
              <small style={{ 
                color: '#2ad1ff', 
                marginTop: '0.25rem', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.25rem' 
              }}>
                <span>🔄</span>
                <span>Auto-synced from Daily Target Form</span>
              </small>
            )}
          </label>

          <label className="vh-span-2">
            <span>Daily Target Achieved (Auto-calculated)</span>
            <textarea
              rows={3}
              name="dailyTargetAchieved"
              value={totalAchieved}
              onChange={handleChange}
              placeholder="Will be auto-filled from your session achievements"
              readOnly
              style={{ background: '#f8f9fa' }}
            />
            <small style={{ color: '#06c167', marginTop: '0.25rem', display: 'block' }}>
              ✓ Auto-calculated from your session achievements
            </small>
          </label>
        </div>

        {/* Session Reports */}
        <div style={{ marginTop: '2rem' }}>
          {editingReport ? (
            // Show only the session being edited
            <div>
              <h3 style={{ color: '#092544', marginBottom: '1rem' }}>
                ✏️ Editing {formData.hourlyEntries[editingReport.sessionIndex]?.timePeriod} Report
              </h3>
              
              {(() => {
                const sessionIndex = editingReport.sessionIndex
                const entry = formData.hourlyEntries[sessionIndex]
                
                return (
                  <div
                    style={{
                      border: '2px solid #ffc107',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      marginBottom: '1.5rem',
                      background: '#fffcf0'
                    }}
                  >
                    <h4 style={{
                      color: '#092544',
                      marginBottom: '1.5rem',
                      marginTop: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      {entry.periodName} ({entry.timePeriod})
                      <span style={{
                        background: '#ffc107',
                        color: '#092544',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.8rem'
                      }}>
                        EDITING MODE
                      </span>
                    </h4>

                    {/* Activities Section */}
                    <div style={{ marginBottom: '2rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h5 style={{ color: '#092544', margin: 0 }}>
                          Activities *
                        </h5>
                        
                        <button
                          type="button"
                          onClick={() => addActivityEntry(sessionIndex)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.4rem 0.75rem',
                            background: '#2ad1ff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                          }}
                        >
                          <span style={{ fontSize: '1rem' }}>+</span> Add More Activity
                        </button>
                      </div>
                      
                      {(() => {
                        const existing = entry.hourlyActivityEntries || []
                        const displayCount = Math.max(3, existing.length)
                        const displayPlanned = Array.from({ length: displayCount }).map((_, i) => existing[i] || '')
                        return displayPlanned.map((activity, activityIndex) => {
                        const key = `${sessionIndex}-${activityIndex}`
                        const planId = selectedPlanForActivity[key]
                        const selectedPlan = dailyPlans.find(p => p.id === planId)
                        const progress = planId ? getPlanProgressDisplay(planId) : null
                        const achievementStatus = planAchievementStatus[key] || 'No'
                        const achievementStyle = getAchievementBadgeStyle(achievementStatus)
                        
                        return (
                          <div key={activityIndex} style={{ marginBottom: '1rem', position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                              <span style={{
                                background: planId ? (progress?.color || '#092544') : '#092544',
                                color: 'white',
                                minWidth: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                marginTop: '0.5rem'
                              }}>
                                {activityIndex + 1}
                              </span>
                              
                              <div style={{ flex: 1 }}>
                                <label>
                                  <span>Activity {activityIndex + 1}</span>
                                  
                                  {/* Plan selection dropdown and achievement toggle */}
   {/* Overall completion summary */}
{dailyPlans.length > 0 && (
  <div style={{ 
    marginTop: '1rem',
    padding: '1rem',
    background: '#e6f7ff',
    border: '1px solid #2ad1ff',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  }}>
    <div>
      <strong>Overall Progress:</strong>
      <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
        Completed: {Object.values(planProgress).filter(p => p?.isCompleted).length} of {dailyPlans.length} plans
      </div>
      <div style={{ fontSize: '0.85rem', color: '#6c757d', marginTop: '0.25rem' }}>
        Total activities linked: {Object.keys(selectedPlanForActivity).length}
      </div>
      <div style={{ fontSize: '0.85rem', color: '#06c167', marginTop: '0.25rem' }}>
        Achieved: {Object.values(planAchievementStatus).filter(s => s === 'Yes').length} activities
      </div>
    </div>
    
    <div>
      <button
        type="button"
        onClick={() => {
          // Generate daily target achieved from achieved activities
          const achievedActivities = Object.entries(planAchievementStatus)
            .filter(([key, status]) => status === 'Yes')
            .map(([key]) => {
              const [sessionIndex, activityIndex] = key.split('-').map(Number);
              const activity = formData.hourlyEntries[sessionIndex]?.hourlyActivityEntries?.[activityIndex] || '';
              const planId = selectedPlanForActivity[key];
              const plan = dailyPlans.find(p => p.id === planId);
              return `✓ Plan ${planId}: ${activity}`;
            })
            .join('\n');
          
          if (achievedActivities) {
            setFormData(prev => ({
              ...prev,
              dailyTargetAchieved: prev.dailyTargetAchieved 
                ? `${prev.dailyTargetAchieved}\n\nAchieved Activities:\n${achievedActivities}`
                : `Achieved Activities:\n${achievedActivities}`
            }));
            setAlert({ type: 'success', message: 'Achieved activities added to daily target' });
          }
        }}
        style={{
          padding: '0.5rem 1rem',
          background: '#06c167',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '0.85rem'
        }}
      >
        Add Achieved Activities to Daily Target
      </button>
    </div>
  </div>
)}

                                  
                                    <textarea
                                      rows={2}
                                      value={activity}
                                      onChange={(e) => updateActivityEntry(sessionIndex, activityIndex, e.target.value)}
                                      placeholder={`Describe activity ${activityIndex + 1}...`}
                                      required={false}
                                    />
                                </label>
                                
                                {/* Achievement section specifically for this activity */}
                                {activity.trim() && (
                                  <div style={{ marginTop: '0.5rem' }}>
                                    <label>
                                      <span style={{ fontSize: '0.9rem', color: '#6c757d' }}>
                                        Achievement for this activity:
                                      </span>
                                      <textarea
                                        rows={1}
                                        placeholder="Describe what you achieved for this activity..."
                                        onChange={(e) => {
                                          addAchievedEntry(sessionIndex)
                                          const lastIndex = (entry.hourlyAchievedEntries?.length || 1) - 1
                                          updateAchievedEntry(sessionIndex, lastIndex, e.target.value)
                                          
                                          // If this activity is linked to a plan, mark achievement as Yes
                                          if (planId && e.target.value.trim()) {
                                            updatePlanAchievementStatus(sessionIndex, activityIndex, 'Yes')
                                          }
                                        }}
                                        style={{
                                          fontSize: '0.9rem',
                                          marginTop: '0.25rem'
                                        }}
                                      />
                                    </label>
                                  </div>
                                )}
                              </div>
                              
                              {(entry.hourlyActivityEntries || ['']).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeActivityEntry(sessionIndex, activityIndex)}
                                  style={{
                                    padding: '0.25rem 0.5rem',
                                    background: '#ff7a7a',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    marginTop: '0.5rem'
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        )
                        })
                      })()}
                    </div>

                    {/* Achievements Section */}
                    <div style={{ marginBottom: '2rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h5 style={{ color: '#092544', margin: 0 }}>
                          Achievements
                        </h5>
                        <button
                          type="button"
                          onClick={() => addAchievedEntry(sessionIndex)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.4rem 0.75rem',
                            background: '#06c167',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                          }}
                        >
                          <span style={{ fontSize: '1rem' }}>+</span> Add Achievement
                        </button>
                      </div>
                      
                      {(entry.hourlyAchievedEntries && entry.hourlyAchievedEntries.length > 0) ? (
                        entry.hourlyAchievedEntries.map((achieved, achievedIndex) => (
                          <div key={achievedIndex} style={{ marginBottom: '1rem', position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                              <span style={{
                                background: '#06c167',
                                color: 'white',
                                minWidth: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                marginTop: '0.5rem'
                              }}>
                                {achievedIndex + 1}
                              </span>
                              <div style={{ flex: 1 }}>
                                <label>
                                  <span>Achievement {achievedIndex + 1}</span>
                                  <textarea
                                    rows={2}
                                    value={achieved}
                                    onChange={(e) => updateAchievedEntry(sessionIndex, achievedIndex, e.target.value)}
                                    placeholder={`Describe achievement ${achievedIndex + 1}...`}
                                  />
                                </label>
                              </div>
                              {entry.hourlyAchievedEntries.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeAchievedEntry(sessionIndex, achievedIndex)}
                                  style={{
                                    padding: '0.25rem 0.5rem',
                                    background: '#ff7a7a',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    marginTop: '0.5rem'
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p style={{ color: '#6c757d', fontSize: '0.9rem', fontStyle: 'italic' }}>
                          No achievements added yet. Click "+ Add Achievement" to start.
                        </p>
                      )}
                    </div>

                    {/* Problem Faced Section */}
                    <div style={{ marginBottom: '2rem' }}>
                      <h5 style={{ color: '#092544', marginBottom: '1rem' }}>
                        Problem Faced?
                      </h5>
                      
                      <div className="vh-grid" style={{ marginBottom: '1rem' }}>
                        <label>
                          <span>Did you face any problem? *</span>
                          <select
                            value={entry.problemFaced || 'No'}
                            onChange={(e) => handleHourlyEntryChange(sessionIndex, 'problemFaced', e.target.value)}
                          >
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </label>
                      </div>

                      {/* Show problem entries only if problem faced is Yes */}
                      {entry.problemFaced === 'Yes' && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h6 style={{ color: '#092544', margin: 0, fontSize: '0.95rem' }}>
                              Describe Problems
                            </h6>
                            <button
                              type="button"
                              onClick={() => addProblemEntry(sessionIndex)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '0.4rem 0.75rem',
                                background: '#ff7a7a',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                              }}
                            >
                              <span style={{ fontSize: '1rem' }}>+</span> Add Problem
                            </button>
                          </div>
                          
                          {(entry.problemFacedEntries || ['']).map((problem, problemIndex) => (
                            <div key={problemIndex} style={{ marginBottom: '1rem', position: 'relative' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                <span style={{
                                  background: '#ff7a7a',
                                  color: 'white',
                                  minWidth: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.75rem',
                                  marginTop: '0.5rem'
                                }}>
                                  {problemIndex + 1}
                                </span>
                                <div style={{ flex: 1 }}>
                                  <label>
                                    <span>Problem {problemIndex + 1}</span>
                                    <textarea
                                      rows={2}
                                      value={problem}
                                      onChange={(e) => updateProblemEntry(sessionIndex, problemIndex, e.target.value)}
                                      placeholder={`Describe problem ${problemIndex + 1}...`}
                                    />
                                  </label>
                                </div>
                                {(entry.problemFacedEntries || ['']).length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeProblemEntry(sessionIndex, problemIndex)}
                                    style={{
                                      padding: '0.25rem 0.5rem',
                                      background: '#092544',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '0.75rem',
                                      marginTop: '0.5rem'
                                    }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* Problem Resolution Section - Only show if problem faced is Yes */}
                          <div className="vh-grid" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #dee2e6' }}>
                            <label>
                              <span>Problem Resolved or Not? *</span>
                              <select
                                value={entry.problemResolvedOrNot || ''}
                                onChange={(e) => handleHourlyEntryChange(sessionIndex, 'problemResolvedOrNot', e.target.value)}
                                required={entry.problemFaced === 'Yes'}
                              >
                                <option value="">Select</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            </label>

                            {/* Show time fields only if problem is resolved (Yes) */}
                            {entry.problemResolvedOrNot === 'Yes' && (
                              <>
                                <label>
                                  <span>Problem Occur Start Time *</span>
                                  <input
                                    type="time"
                                    value={entry.problemOccurStartTime}
                                    onChange={(e) => handleHourlyEntryChange(sessionIndex, 'problemOccurStartTime', e.target.value)}
                                    required
                                  />
                                </label>

                                <label>
                                  <span>Problem Resolved End Time *</span>
                                  <input
                                    type="time"
                                    value={entry.problemResolvedEndTime}
                                    onChange={(e) => handleHourlyEntryChange(sessionIndex, 'problemResolvedEndTime', e.target.value)}
                                    required
                                  />
                                </label>

                                <label className="vh-span-2">
                                  <span>Online Support Required for Which Problem</span>
                                  <textarea
                                    rows={2}
                                    value={entry.onlineSupportRequiredForWhichProblem}
                                    onChange={(e) => handleHourlyEntryChange(sessionIndex, 'onlineSupportRequiredForWhichProblem', e.target.value)}
                                    placeholder="Describe which problem required online support..."
                                  />
                                </label>

                                {entry.onlineSupportRequiredForWhichProblem && (
                                  <>
                                    <label>
                                      <span>Online Support Time *</span>
                                      <input
                                        type="time"
                                        value={entry.onlineSupportTime}
                                        onChange={(e) => handleHourlyEntryChange(sessionIndex, 'onlineSupportTime', e.target.value)}
                                        required
                                      />
                                    </label>

                                    <label>
                                      <span>Online Support End Time *</span>
                                      <input
                                        type="time"
                                        value={entry.onlineSupportEndTime}
                                        onChange={(e) => handleHourlyEntryChange(sessionIndex, 'onlineSupportEndTime', e.target.value)}
                                        required
                                      />
                                    </label>

                                    <label className="vh-span-2">
                                      <span>Engineer Name Who Gives Online Support *</span>
                                      <input
                                        type="text"
                                        value={entry.engineerNameWhoGivesOnlineSupport}
                                        onChange={(e) => handleHourlyEntryChange(sessionIndex, 'engineerNameWhoGivesOnlineSupport', e.target.value)}
                                        placeholder="Enter engineer name providing support"
                                        required
                                      />
                                    </label>
                                  </>
                                )}
                              </>
                            )}

                            {/* Show reason field only if problem is NOT resolved (No) */}
                            {entry.problemResolvedOrNot === 'No' && (
                              <label className="vh-span-2">
                                <span>Reason if not resolved *</span>
                                <textarea
                                  rows={2}
                                  value={entry.reasonIfNotResolved}
                                  onChange={(e) => handleHourlyEntryChange(sessionIndex, 'reasonIfNotResolved', e.target.value)}
                                  placeholder="Explain why the problem could not be resolved..."
                                  required={entry.problemResolvedOrNot === 'No'}
                                />
                              </label>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          ) : (
            // Show all sessions for new reports
            <div>
              <h3 style={{ color: '#092544', marginBottom: '1rem' }}>New Session Reports (9am-1pm & 2pm-4pm)</h3>
              <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Current active session: <strong>{currentActivePeriod || 'None'}</strong><br/>
                You can fill and submit reports during each session (9am-1pm or 2pm-4pm) or up to 30 minutes after it ends.
              </p>

              {formData.hourlyEntries.map((entry, sessionIndex) => {
                const periodKey = entry.periodName.toLowerCase().replace(' session', '')
                const currentSessionStatus = sessionStatus[periodKey]
                // For new reports: respect the session status (lock if not started)
                // For existing reports: always allow editing
                const hasExistingReport = currentSessionStatus?.report !== undefined
                const canEdit = hasExistingReport ? true : (currentSessionStatus?.canEdit || false)
                const isSubmitted = currentSessionStatus?.status === 'submitted' || currentSessionStatus?.status === 'editable'
                const isActive = currentSessionStatus?.status === 'active'
                const isPending = currentSessionStatus?.status === 'pending'

                if (isSubmitted) {
                  return null
                }

                return (
                  <div
                    key={sessionIndex}
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
                      marginBottom: '1.5rem',
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
                      {!canEdit && isPending && (
                        <span style={{
                          background: '#ff7a7a',
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.8rem'
                        }}>
                          🔒 LOCKED - Starts at {entry.startHour}:{String(0).padStart(2, '0')}
                        </span>
                      )}
                      {!canEdit && !isPending && (
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

                    {/* Activities Section */}
                    <div style={{ marginBottom: '2rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h5 style={{ color: '#092544', margin: 0 }}>
                          Activities *
                        </h5>
                        
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => addActivityEntry(sessionIndex)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.4rem 0.75rem',
                              background: '#2ad1ff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '0.85rem'
                            }}
                          >
                            <span style={{ fontSize: '1rem' }}>+</span> Add Activity
                          </button>
                        )}
                      </div>
                      
                      {(entry.hourlyActivityEntries || ['']).map((activity, activityIndex) => {
                        const key = `${sessionIndex}-${activityIndex}`
                        const planId = selectedPlanForActivity[key]
                        const selectedPlan = dailyPlans.find(p => p.id === planId)
                        const progress = planId ? getPlanProgressDisplay(planId) : null
                        const achievementStatus = planAchievementStatus[key] || 'No'
                        const achievementStyle = getAchievementBadgeStyle(achievementStatus)
                        
                        return (
                          <div key={activityIndex} style={{ marginBottom: '1rem', position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                              <span style={{
                                background: planId ? (progress?.color || '#092544') : '#092544',
                                color: 'white',
                                minWidth: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                marginTop: '0.5rem'
                              }}>
                                {activityIndex + 1}
                              </span>
                              
                              <div style={{ flex: 1 }}>
                                <label>
                                  <span>Activity {activityIndex + 1}</span>
                                  
                                  {/* Plan selection dropdown and achievement toggle */}
                                  {dailyPlans.length > 0 && canEdit && (
                                    <div style={{ marginBottom: '0.5rem' }}>
                                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <select
                                          value={planId || ''}
                                          onChange={(e) => linkActivityToPlan(sessionIndex, activityIndex, parseInt(e.target.value))}
                                          disabled={!canEdit}
                                          style={{
                                            flex: 1,
                                            padding: '0.5rem',
                                            fontSize: '0.9rem',
                                            border: '1px solid #d5e0f2',
                                            borderRadius: '6px',
                                            background: planId ? '#f0fff4' : 'white'
                                          }}
                                        >
                                          <option value="">-- Link to Daily Plan (Optional) --</option>
                                          {dailyPlans.map(plan => (
                                            <option key={plan.id} value={plan.id}>
                                              Plan {plan.id}: {plan.text.substring(0, 50)}...
                                              {planProgress[plan.id]?.isCompleted ? ' ✓' : ''}
                                            </option>
                                          ))}
                                        </select>
                                        
                                        {planId && canEdit && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>
                                              Achieved?
                                            </span>
                                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                              <button
                                                type="button"
                                                onClick={() => updatePlanAchievementStatus(sessionIndex, activityIndex, 'Yes')}
                                                style={{
                                                  padding: '0.25rem 0.75rem',
                                                  background: achievementStatus === 'Yes' ? '#06c167' : '#f5f5f5',
                                                  color: achievementStatus === 'Yes' ? 'white' : '#092544',
                                                  border: achievementStatus === 'Yes' ? '1px solid #06c167' : '1px solid #d5e0f2',
                                                  borderRadius: '4px',
                                                  cursor: 'pointer',
                                                  fontSize: '0.8rem'
                                                }}
                                              >
                                                Yes
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => updatePlanAchievementStatus(sessionIndex, activityIndex, 'No')}
                                                style={{
                                                  padding: '0.25rem 0.75rem',
                                                  background: achievementStatus === 'No' ? '#ff7a7a' : '#f5f5f5',
                                                  color: achievementStatus === 'No' ? 'white' : '#092544',
                                                  border: achievementStatus === 'No' ? '1px solid #ff7a7a' : '1px solid #d5e0f2',
                                                  borderRadius: '4px',
                                                  cursor: 'pointer',
                                                  fontSize: '0.8rem'
                                                }}
                                              >
                                                No
                                              </button>
                                            </div>
                                            
                                            {/* Achievement status badge */}
                                            <span style={{
                                              background: achievementStyle.background,
                                              color: achievementStyle.color,
                                              border: achievementStyle.border,
                                              padding: '0.125rem 0.5rem',
                                              borderRadius: '12px',
                                              fontSize: '0.75rem',
                                              fontWeight: 'bold'
                                            }}>
                                              {achievementStatus === 'Yes' ? '✓ Achieved' : '✗ Not Achieved'}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {selectedPlan && (
                                        <div style={{
                                          fontSize: '0.85rem',
                                          color: '#6c757d',
                                          marginTop: '0.25rem',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.5rem',
                                          flexWrap: 'wrap'
                                        }}>
                                          <span>
                                            Linked to <strong>Plan {selectedPlan.id}</strong>: {selectedPlan.text.substring(0, 60)}...
                                          </span>
                                          {progress && (
                                            <span style={{
                                              background: progress.color,
                                              color: 'white',
                                              padding: '0.125rem 0.5rem',
                                              borderRadius: '12px',
                                              fontSize: '0.75rem'
                                            }}>
                                              {progress.text}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  <textarea
                                    rows={2}
                                    value={activity}
                                    onChange={(e) => updateActivityEntry(sessionIndex, activityIndex, e.target.value)}
                                    placeholder={`Describe activity ${activityIndex + 1}...`}
                                    required={activityIndex === 0}
                                    disabled={!canEdit}
                                    style={{
                                      borderLeft: planId ? '3px solid #06c167' : '1px solid #d5e0f2'
                                    }}
                                  />
                                </label>
                                
                                {/* Achievement section specifically for this activity */}
                                {/* {activity.trim() && canEdit && (
                                  <div style={{ marginTop: '0.5rem' }}>
                                    <label>
                                      <span style={{ fontSize: '0.9rem', color: '#6c757d' }}>
                                        Achievement for this activity:
                                      </span>
                                      <textarea
                                        rows={1}
                                        placeholder="Describe what you achieved for this activity..."
                                        onChange={(e) => {
                                          addAchievedEntry(sessionIndex)
                                          const lastIndex = (entry.hourlyAchievedEntries?.length || 1) - 1
                                          updateAchievedEntry(sessionIndex, lastIndex, e.target.value)
                                          
                                          // If this activity is linked to a plan, mark achievement as Yes
                                          if (planId && e.target.value.trim()) {
                                            updatePlanAchievementStatus(sessionIndex, activityIndex, 'Yes')
                                          }
                                        }}
                                        style={{
                                          fontSize: '0.9rem',
                                          marginTop: '0.25rem'
                                        }}
                                      />
                                    </label>
                                  </div>
                                )} */}
                              </div>
                              
                              {(entry.hourlyActivityEntries || ['']).length > 1 && canEdit && (
                                <button
                                  type="button"
                                  onClick={() => removeActivityEntry(sessionIndex, activityIndex)}
                                  style={{
                                    padding: '0.25rem 0.5rem',
                                    background: '#ff7a7a',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    marginTop: '0.5rem'
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Achievements Section */}
                    {/* <div style={{ marginBottom: '2rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h5 style={{ color: '#092544', margin: 0 }}>
                          Achievements
                        </h5>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => addAchievedEntry(sessionIndex)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.4rem 0.75rem',
                              background: '#06c167',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '0.85rem'
                            }}
                          >
                            <span style={{ fontSize: '1rem' }}>+</span> Add Achievement
                          </button>
                        )}
                      </div>
                      
                      {(entry.hourlyAchievedEntries || ['']).map((achieved, achievedIndex) => (
                        <div key={achievedIndex} style={{ marginBottom: '1rem', position: 'relative' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <span style={{
                              background: '#06c167',
                              color: 'white',
                              minWidth: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.75rem',
                              marginTop: '0.5rem'
                            }}>
                              {achievedIndex + 1}
                            </span>
                            <div style={{ flex: 1 }}>
                              <label>
                                <span>Achievement {achievedIndex + 1}</span>
                                <textarea
                                  rows={2}
                                  value={achieved}
                                  onChange={(e) => updateAchievedEntry(sessionIndex, achievedIndex, e.target.value)}
                                  placeholder={`Describe achievement ${achievedIndex + 1}...`}
                                  disabled={!canEdit}
                                />
                              </label>
                            </div>
                            {(entry.hourlyAchievedEntries || ['']).length > 1 && canEdit && (
                              <button
                                type="button"
                                onClick={() => removeAchievedEntry(sessionIndex, achievedIndex)}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  background: '#ff7a7a',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  marginTop: '0.5rem'
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div> */}

                    {/* Problem Faced Section */}
                    <div style={{ marginBottom: '2rem' }}>
                      <h5 style={{ color: '#092544', marginBottom: '1rem' }}>
                        Problem Faced?
                      </h5>
                      
                      <div className="vh-grid" style={{ marginBottom: '1rem' }}>
                        <label>
                          <span>Did you face any problem? *</span>
                          <select
                            value={entry.problemFaced || 'No'}
                            onChange={(e) => handleHourlyEntryChange(sessionIndex, 'problemFaced', e.target.value)}
                            disabled={!canEdit}
                          >
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </label>
                      </div>
                      

                      {/* Show problem entries only if problem faced is Yes */}
                      {entry.problemFaced === 'Yes' && canEdit && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h6 style={{ color: '#092544', margin: 0, fontSize: '0.95rem' }}>
                              Describe Problems
                            </h6>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => addProblemEntry(sessionIndex)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.4rem 0.75rem',
                                  background: '#ff7a7a',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem'
                                }}
                              >
                                <span style={{ fontSize: '1rem' }}>+</span> Add Problem
                              </button>
                            )}
                          </div>
                          
                          {(entry.problemFacedEntries || ['']).map((problem, problemIndex) => (
                            <div key={problemIndex} style={{ marginBottom: '1rem', position: 'relative' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                <span style={{
                                  background: '#ff7a7a',
                                  color: 'white',
                                  minWidth: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.75rem',
                                  marginTop: '0.5rem'
                                }}>
                                  {problemIndex + 1}
                                </span>
                                <div style={{ flex: 1 }}>
                                  <label>
                                    <span>Problem {problemIndex + 1}</span>
                                    <textarea
                                      rows={2}
                                      value={problem}
                                      onChange={(e) => updateProblemEntry(sessionIndex, problemIndex, e.target.value)}
                                      placeholder={`Describe problem ${problemIndex + 1}...`}
                                      disabled={!canEdit}
                                    />
                                  </label>
                                </div>
                                {(entry.problemFacedEntries || ['']).length > 1 && canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => removeProblemEntry(sessionIndex, problemIndex)}
                                    style={{
                                      padding: '0.25rem 0.5rem',
                                      background: '#092544',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '0.75rem',
                                      marginTop: '0.5rem'
                                    }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* Problem Resolution Section - Only show if problem faced is Yes */}
                          <div className="vh-grid" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #dee2e6' }}>
                            <label>
                              <span>Problem Resolved or Not? *</span>
                              <select
                                value={entry.problemResolvedOrNot || ''}
                                onChange={(e) => handleHourlyEntryChange(sessionIndex, 'problemResolvedOrNot', e.target.value)}
                                disabled={!canEdit}
                                required={entry.problemFaced === 'Yes'}
                              >
                                <option value="">Select</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            </label>

                            {/* Show time fields only if problem is resolved (Yes) */}
                            {entry.problemResolvedOrNot === 'Yes' && (
                              <>
                                <label>
                                  <span>Problem Occur Start Time *</span>
                                  <input
                                    type="time"
                                    value={entry.problemOccurStartTime}
                                    onChange={(e) => handleHourlyEntryChange(sessionIndex, 'problemOccurStartTime', e.target.value)}
                                    disabled={!canEdit}
                                    required
                                  />
                                </label>

                                <label>
                                  <span>Problem Resolved End Time *</span>
                                  <input
                                    type="time"
                                    value={entry.problemResolvedEndTime}
                                    onChange={(e) => handleHourlyEntryChange(sessionIndex, 'problemResolvedEndTime', e.target.value)}
                                    disabled={!canEdit}
                                    required
                                  />
                                </label>

                                <label className="vh-span-2">
                                  <span>Online Support Required for Which Problem</span>
                                  <textarea
                                    rows={2}
                                    value={entry.onlineSupportRequiredForWhichProblem}
                                    onChange={(e) => handleHourlyEntryChange(sessionIndex, 'onlineSupportRequiredForWhichProblem', e.target.value)}
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
                                        onChange={(e) => handleHourlyEntryChange(sessionIndex, 'onlineSupportTime', e.target.value)}
                                        disabled={!canEdit}
                                        required
                                      />
                                    </label>

                                    <label>
                                      <span>Online Support End Time *</span>
                                      <input
                                        type="time"
                                        value={entry.onlineSupportEndTime}
                                        onChange={(e) => handleHourlyEntryChange(sessionIndex, 'onlineSupportEndTime', e.target.value)}
                                        disabled={!canEdit}
                                        required
                                      />
                                    </label>

                                    <label className="vh-span-2">
                                      <span>Engineer Name Who Gives Online Support *</span>
                                      <input
                                        type="text"
                                        value={entry.engineerNameWhoGivesOnlineSupport}
                                        onChange={(e) => handleHourlyEntryChange(sessionIndex, 'engineerNameWhoGivesOnlineSupport', e.target.value)}
                                        placeholder="Enter engineer name providing support"
                                        disabled={!canEdit}
                                        required
                                      />
                                    </label>
                                  </>
                                )}
                              </>
                            )}

                            {/* Show reason field only if problem is NOT resolved (No) */}
                            {entry.problemResolvedOrNot === 'No' && (
                              <label className="vh-span-2">
                                <span>Reason if not resolved *</span>
                                <textarea
                                  rows={2}
                                  value={entry.reasonIfNotResolved}
                                  onChange={(e) => handleHourlyEntryChange(sessionIndex, 'reasonIfNotResolved', e.target.value)}
                                  placeholder="Explain why the problem could not be resolved..."
                                  disabled={!canEdit}
                                  required={entry.problemResolvedOrNot === 'No'}
                                />
                              </label>
                            )}
                          </div>
                        </>
                      )}

                      {/* Unplanned/Other Activities Section */}
                      <div style={{ 
                        marginTop: '2rem',
                        paddingTop: '2rem',
                        borderTop: '2px solid #e9ecef',
                        background: '#f8f9fa',
                        padding: '1.5rem',
                        borderRadius: '8px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                          <h5 style={{ color: '#092544', margin: 0 }}>
                            Other/Unplanned Activities
                          </h5>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => addUnplannedActivityEntry(sessionIndex)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '0.4rem 0.75rem',
                                background: '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                              }}
                            >
                              <span style={{ fontSize: '1rem' }}>+</span> Add Other Activity
                            </button>
                          )}
                        </div>

                        {(!entry.unplannedActivities || entry.unplannedActivities.length === 0) ? (
                          <div style={{
                            padding: '1rem',
                            textAlign: 'center',
                            color: '#6c757d',
                            fontSize: '0.9rem',
                            fontStyle: 'italic'
                          }}>
                            No other/unplanned activities yet. Click "Add Other Activity" to add one.
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                            {(entry.unplannedActivities || []).map((unplannedActivity, unplannedIndex) => (
                              <div key={unplannedIndex} style={{
                                padding: '1rem',
                                background: 'white',
                                border: '1px solid #dee2e6',
                                borderRadius: '6px',
                                position: 'relative'
                              }}>
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr',
                                  gap: '0.75rem'
                                }}>
                                  <label>
                                    <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#092544' }}>
                                      Activity Description *
                                    </span>
                                    <textarea
                                      rows={2}
                                      value={unplannedActivity?.activity || ''}
                                      onChange={(e) => updateUnplannedActivityEntry(sessionIndex, unplannedIndex, 'activity', e.target.value)}
                                      placeholder="Describe the unplanned/other activity..."
                                      disabled={!canEdit}
                                      required
                                      style={{
                                        fontSize: '0.9rem',
                                        borderLeft: '3px solid #6c757d',
                                        paddingLeft: '0.75rem'
                                      }}
                                    />
                                  </label>

                                  <label>
                                    <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#092544' }}>
                                      Reason/Context
                                    </span>
                                    <textarea
                                      rows={1}
                                      value={unplannedActivity?.reason || ''}
                                      onChange={(e) => updateUnplannedActivityEntry(sessionIndex, unplannedIndex, 'reason', e.target.value)}
                                      placeholder="Why was this activity done? (Optional)"
                                      disabled={!canEdit}
                                      style={{ fontSize: '0.9rem' }}
                                    />
                                  </label>

                                  <label>
                                    <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#092544' }}>
                                      Priority
                                    </span>
                                    <select
                                      value={unplannedActivity?.priority || 'Normal'}
                                      onChange={(e) => updateUnplannedActivityEntry(sessionIndex, unplannedIndex, 'priority', e.target.value)}
                                      disabled={!canEdit}
                                      style={{ fontSize: '0.9rem' }}
                                    >
                                      <option value="Low">Low</option>
                                      <option value="Normal">Normal</option>
                                      <option value="High">High</option>
                                      <option value="Critical">Critical</option>
                                    </select>
                                  </label>
                                </div>

                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => removeUnplannedActivityEntry(sessionIndex, unplannedIndex)}
                                    style={{
                                      position: 'absolute',
                                      top: '0.5rem',
                                      right: '0.5rem',
                                      padding: '0.25rem 0.5rem',
                                      background: '#dc3545',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '0.75rem'
                                    }}
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Daily Plans Progress Dashboard */}
        {dailyPlans.length > 0 && !editingReport && (
          <div style={{ 
            marginBottom: '2rem',
            background: '#fff',
            padding: '1.5rem',
            borderRadius: '12px',
            border: '1px solid #dee2e6',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ color: '#092544', margin: 0 }}>Daily Plans Progress</h3>
              <button
                type="button"
                onClick={() => {
                  const plans = loadDailyPlans()
                  setDailyPlans(plans)
                  setAlert({ type: 'info', message: 'Daily plans refreshed' })
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#2ad1ff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Refresh Plans
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {dailyPlans.map(plan => {
                const progress = planProgress[plan.id] || { completedActivities: 0, totalActivities: 0, isCompleted: false }
                const progressDisplay = getPlanProgressDisplay(plan.id)
                const percentage = progress.totalActivities > 0 
                  ? Math.round((progress.completedActivities / progress.totalActivities) * 100) 
                  : 0
                
                // Find linked activities for this plan
                const linkedActivities = Object.entries(selectedPlanForActivity)
                  .filter(([key, pId]) => pId === plan.id)
                  .map(([key]) => {
                    const [sessionIndex, activityIndex] = key.split('-').map(Number)
                    const activity = formData.hourlyEntries[sessionIndex]?.hourlyActivityEntries?.[activityIndex] || ''
                    const achievementStatus = planAchievementStatus[key] || 'No'
                    return {
                      key,
                      activity,
                      isAchieved: achievementStatus === 'Yes'
                    }
                  })
                  .filter(item => item.activity.trim())
                
                return (
                  <div key={plan.id} style={{
                    padding: '1rem',
                    background: '#f8f9fa',
                    borderRadius: '8px',
                    border: `1px solid ${progressDisplay?.color || '#dee2e6'}`,
                    position: 'relative'
                  }}>
                    <div style={{ 
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      background: progressDisplay?.color || '#8892aa',
                      color: 'white',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}>
                      {plan.id}
                    </div>
                    
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Plan {plan.id}:</strong>
                      <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        {plan.text.length > 80 ? `${plan.text.substring(0, 80)}...` : plan.text}
                      </div>
                    </div>
                    
                    {/* Progress bar */}
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        fontSize: '0.85rem',
                        marginBottom: '0.25rem'
                      }}>
                        <span>Progress</span>
                        <span>
                          {progress.completedActivities}/{progress.totalActivities} activities
                          {progress.totalActivities > 0 && ` (${percentage}%)`}
                        </span>
                      </div>
                      
                      <div style={{ 
                        height: '8px', 
                        background: '#e9ecef', 
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          width: `${percentage}%`,
                          height: '100%',
                          background: progress.isCompleted ? '#06c167' : 
                                    percentage > 50 ? '#2ad1ff' : 
                                    percentage > 0 ? '#ffc107' : '#8892aa',
                          borderRadius: '4px',
                          transition: 'width 0.3s ease'
                        }}></div>
                      </div>
                    </div>
                    
                    {/* Linked activities with achievement status */}
                    {linkedActivities.length > 0 && (
                      <div style={{ fontSize: '0.85rem', color: '#6c757d' }}>
                        <strong>Linked Activities:</strong>
                        <ul style={{ margin: '0.25rem 0', paddingLeft: '1rem' }}>
                          {linkedActivities.slice(0, 3).map((item, idx) => (
                            <li key={item.key} style={{ 
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              marginBottom: '0.25rem'
                            }}>
                              <span style={{
                                background: item.isAchieved ? '#06c167' : '#ff7a7a',
                                color: 'white',
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.6rem'
                              }}>
                                {item.isAchieved ? '✓' : '✗'}
                              </span>
                              <span style={{ 
                                textDecoration: item.isAchieved ? 'line-through' : 'none',
                                color: item.isAchieved ? '#06c167' : 'inherit',
                                flex: 1
                              }}>
                                {item.activity.length > 40 ? `${item.activity.substring(0, 40)}...` : item.activity}
                              </span>
                            </li>
                          ))}
                          {linkedActivities.length > 3 && (
                            <li style={{ fontSize: '0.8rem' }}>+{linkedActivities.length - 3} more...</li>
                          )}
                        </ul>
                      </div>
                    )}
                    
                    {/* Status badge */}
                    {progressDisplay && (
                      <div style={{ 
                        marginTop: '0.5rem',
                        textAlign: 'center'
                      }}>
                        <span style={{
                          background: progressDisplay.color,
                          color: 'white',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          fontWeight: 'bold'
                        }}>
                          {progressDisplay.text}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            
            {/* Overall completion summary */}
            {dailyPlans.length > 0 && (
              <div style={{ 
                marginTop: '1rem',
                padding: '1rem',
                background: '#e6f7ff',
                border: '1px solid #2ad1ff',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <strong>Overall Progress:</strong>
                  <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    {Object.values(planProgress).filter(p => p?.isCompleted).length} of {dailyPlans.length} plans completed
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#6c757d', marginTop: '0.25rem' }}>
                    {Object.values(planAchievementStatus).filter(s => s === 'Yes').length} activities achieved
                  </div>
                </div>
                
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      // Generate daily target achieved from completed plans
                      const completedPlans = dailyPlans
                        .filter(plan => planProgress[plan.id]?.isCompleted)
                        .map(plan => `✓ Plan ${plan.id}: ${plan.text}`)
                        .join('\n')
                      
                      if (completedPlans) {
                        setFormData(prev => ({
                          ...prev,
                          dailyTargetAchieved: prev.dailyTargetAchieved 
                            ? `${prev.dailyTargetAchieved}\n\nCompleted Plans:\n${completedPlans}`
                            : `Completed Plans:\n${completedPlans}`
                        }))
                        setAlert({ type: 'success', message: 'Completed plans added to achievements' })
                      }
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#06c167',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Add Completed Plans to Achievements
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Form Actions */}
       {/* Form Actions */}
<div className="vh-form-actions">
  {editingReport ? (
    <>
      <button 
        type="submit" 
        disabled={submitting || !formData.projectName}
        style={{
          background: '#ffc107',
          position: 'relative'
        }}
      >
        {submitting ? 'Updating…' : `Update ${formData.hourlyEntries[editingReport.sessionIndex]?.timePeriod} Report`}
      </button>
      <button
        type="button"
        className="ghost"
        onClick={cancelEditing}
        disabled={submitting}
        style={{ borderColor: '#ffc107', color: '#ffc107' }}
      >
        Cancel & Start New
      </button>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          // Submit and continue editing same report
          handleSubmit(event)
        }}
        disabled={submitting}
        style={{ borderColor: '#06c167', color: '#06c167' }}
      >
        Update & Continue
      </button>
    </>
  ) : (
    <>
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
                {!formData.projectName ? '⚠️ Select a project first' : 
                '⚠️ Only active sessions can be submitted'}
              </span>
            )}
          </>
        )}
      </button>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          if (window.confirm('Are you sure you want to reset the form? All entered data will be lost.')) {
            setFormData(defaultPayload())
            setSelectedPlanForActivity({})
            setPlanAchievementStatus({})
            setEditingReport(null)
          }
        }}
        disabled={submitting}
      >
        Reset form
      </button>
    </>
  )}
</div>
      </form>
            {/* Edit Submitted Reports Section - ADD THIS SECTION */}
      {existingReports.length > 0 && !editingReport && (
        <div style={{ 
          marginTop: '3rem',
          padding: '2rem',
          background: '#f8f9fa',
          borderRadius: '12px',
          border: '1px solid #dee2e6'
        }}>
          <h3 style={{ 
            color: '#092544', 
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span>✏️</span> Edit Your Submitted Reports
          </h3>
          
          <div style={{ 
            background: '#e6f7ff', 
            padding: '1rem', 
            borderRadius: '8px',
            marginBottom: '1.5rem',
            borderLeft: '4px solid #2ad1ff'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ fontSize: '1.2rem' }}>ℹ️</div>
              <div>
                <strong>How to edit reports:</strong>
                <ol style={{ margin: '0.5rem 0 0 1rem', paddingLeft: '0', fontSize: '0.9rem' }}>
                  <li>Click "Edit Report" on any submitted report below</li>
                  <li>The form above will load with the existing data</li>
                  <li>Make your changes and click "Update Report"</li>
                  <li>You can edit reports at any time (not just within 30 minutes)</li>
                </ol>
              </div>
            </div>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            {existingReports.map((report, index) => {
              const isReportFilled = report.hourly_activity || 
                                   report.hourly_achieved || 
                                   report.problem_faced_by_engineer_hourly;
              
              return (
                <div key={index} style={{
                  padding: '1rem',
                  background: 'white',
                  borderRadius: '8px',
                  border: isReportFilled ? '2px solid #06c167' : '2px solid #ffc107',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  position: 'relative'
                }}>
                  {/* Report status indicator */}
                  <div style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    {isReportFilled ? (
                      <span style={{
                        background: '#06c167',
                        color: 'white',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem'
                      }}>
                        ✓
                      </span>
                    ) : (
                      <span style={{
                        background: '#ffc107',
                        color: '#092544',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem'
                      }}>
                        ✏️
                      </span>
                    )}
                  </div>
                  
                  <div style={{ marginBottom: '0.75rem', paddingRight: '1.5rem' }}>
                    <div style={{ 
                      fontSize: '1.1rem', 
                      fontWeight: 'bold',
                      color: '#092544'
                    }}>
                      {report.time_period}
                    </div>
                    <div style={{ 
                      fontSize: '0.9rem', 
                      color: '#6c757d',
                      marginTop: '0.25rem'
                    }}>
                      <div><strong>Project:</strong> {report.project_name || 'N/A'}</div>
                      <div style={{ marginTop: '0.25rem' }}>
                        <strong>Status:</strong> 
                        <span style={{
                          color: isReportFilled ? '#06c167' : '#ffc107',
                          fontWeight: 'bold',
                          marginLeft: '0.25rem'
                        }}>
                          {isReportFilled ? 'Filled' : 'Started'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Report summary */}
                  <div style={{ 
                    fontSize: '0.85rem', 
                    color: '#092544',
                    marginBottom: '0.75rem'
                  }}>
                    <div style={{ marginBottom: '0.25rem' }}>
                      <strong>Activities:</strong> {
                        report.hourly_activity ? report.hourly_activity.split('\n').length : 0
                      }
                    </div>
                    <div style={{ marginBottom: '0.25rem' }}>
                      <strong>Achievements:</strong> {
                        report.hourly_achieved ? report.hourly_achieved.split('\n').length : 0
                      }
                    </div>
                    {report.problem_faced === 'Yes' && (
                      <div style={{ marginBottom: '0.25rem' }}>
                        <strong>Problems:</strong> {
                          report.problem_faced_by_engineer_hourly ? 
                          report.problem_faced_by_engineer_hourly.split('\n').length : 0
                        }
                      </div>
                    )}
                    <div style={{ fontSize: '0.8rem', color: '#6c757d', marginTop: '0.25rem' }}>
                      Submitted: {new Date(report.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                  
                  {/* Preview of activities (if any) */}
                  {report.hourly_activity && (
                    <div style={{ 
                      fontSize: '0.8rem',
                      color: '#666',
                      background: '#f8f9fa',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      marginBottom: '0.75rem',
                      maxHeight: '60px',
                      overflowY: 'auto'
                    }}>
                      {report.hourly_activity.split('\n').slice(0, 2).map((line, idx) => (
                        <div key={idx} style={{ marginBottom: '0.125rem' }}>
                          • {line.replace(/Activity \d+:\s*/i, '')}
                        </div>
                      ))}
                      {report.hourly_activity.split('\n').length > 2 && (
                        <div style={{ color: '#2ad1ff', fontSize: '0.75rem' }}>
                          +{report.hourly_activity.split('\n').length - 2} more...
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        loadReportForEditing(report.id);
                        // Scroll to top of form
                        setTimeout(() => {
                          window.scrollTo({
                            top: 0,
                            behavior: 'smooth'
                          });
                        }, 100);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        background: '#2ad1ff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <span>✏️</span> Edit Report
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => deleteReport(report.id)}
                      style={{
                        padding: '0.5rem',
                        background: '#ff7a7a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Delete this report"
                    >
                      🗑️
                    </button>
                  </div>
                  
                  {/* Quick status message */}
                  {!isReportFilled && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      background: '#fff3cd',
                      color: '#856404',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      textAlign: 'center'
                    }}>
                      ⚠️ This report needs to be filled
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Quick stats */}
          <div style={{ 
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '1rem',
            borderTop: '1px solid #dee2e6'
          }}>
            <div style={{ fontSize: '0.9rem', color: '#6c757d' }}>
              <strong>Summary:</strong> {existingReports.length} report(s) for {formData.reportDate}
            </div>
            <button
              type="button"
              onClick={refreshExistingReports}
              style={{
                padding: '0.5rem 1rem',
                background: '#06c167',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <span>↻</span> Refresh List
            </button>
          </div>
        </div>
      )}
      
      {/* Editing Mode Instructions */}
      {editingReport && (
        <div style={{ 
          marginTop: '2rem',
          padding: '1.5rem',
          background: '#fffcf0',
          borderRadius: '12px',
          border: '2px solid #ffc107'
        }}>
          <h3 style={{ 
            color: '#092544', 
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span>✏️</span> Editing Mode Active
          </h3>
          
          <div style={{ 
            background: '#fff3cd', 
            padding: '1rem', 
            borderRadius: '8px',
            marginBottom: '1rem',
            border: '1px solid #ffeaa7'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ fontSize: '1.2rem' }}>📋</div>
              <div>
                <strong>You are editing: {editingReport.timePeriod}</strong>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
                  The form above is now populated with your existing report data. 
                  Make any changes needed and click "Update Report" to save.
                </p>
              </div>
            </div>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem',
            marginTop: '1rem'
          }}>
            <button
              type="button"
              onClick={() => {
                // Scroll to the form
                window.scrollTo({
                  top: 0,
                  behavior: 'smooth'
                });
              }}
              style={{
                padding: '0.75rem',
                background: '#2ad1ff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <span>↑</span> Go to Edit Form
            </button>
            
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Cancel editing and return to creating new reports?')) {
                  cancelEditing();
                }
              }}
              style={{
                padding: '0.75rem',
                background: '#ff7a7a',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <span>✕</span> Cancel Editing
            </button>
            
            <button
              type="button"
              onClick={refreshExistingReports}
              style={{
                padding: '0.75rem',
                background: '#06c167',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <span>↻</span> Refresh Reports
            </button>
          </div>
        </div>
      )}
    </section>
    // </section>
  )
}

export default HourlyReportForm
import React, { useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { format } from 'date-fns'

export default function MomForm() {
  const { user } = useAuth()
  
  // Enhanced debugging
  useEffect(() => {
    console.log('🔍 MOM Form - Full User Context:', user)
    console.log('🔍 MOM Form - Employee ID:', user?.employeeId)
    console.log('🔍 MOM Form - User object keys:', user ? Object.keys(user) : 'No user')
  }, [user])
  
  // Get employeeId with multiple fallbacks
  const employeeId = React.useMemo(() => {
    return user?.employeeId || 
           localStorage.getItem('lastEmployeeId') || 
           sessionStorage.getItem('tempEmployeeId') || 
           'UNKNOWN'
  }, [user?.employeeId])

  // Store employeeId for future use
  useEffect(() => {
    if (user?.employeeId) {
      localStorage.setItem('lastEmployeeId', user.employeeId)
      sessionStorage.setItem('tempEmployeeId', user.employeeId)
    }
  }, [user?.employeeId])

  const [formData, setFormData] = useState(() => {
    const savedData = JSON.parse(localStorage.getItem('momFormDraft') || '{}')
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0] // Tomorrow for site end date
    
    return {
      customerName: savedData.customerName || '',
      customerPerson: savedData.customerPerson || '',
      custContact: savedData.custContact || '',
      momDate: savedData.momDate || today,
      reportingTime: savedData.reportingTime || '',
      momCloseTime: savedData.momCloseTime || '',
      manHours: savedData.manHours || '',
      enggName: user?.username || savedData.enggName || '',
      siteLocation: savedData.siteLocation || localStorage.getItem('lastSiteLocation') || '',
      projectName: savedData.projectName || '',
      observation: savedData.observation || '',
      solution: savedData.solution || '',
      conclusion: savedData.conclusion || '',
      meetingType: savedData.meetingType || 'onsite',
      participants: savedData.participants || '',
      // NEW: Site End Date fields
      siteStartDate: savedData.siteStartDate || today,
      siteEndDate: savedData.siteEndDate || tomorrow,
      siteStatus: savedData.siteStatus || 'ongoing'
    }
  })

  const [fetchingLocation, setFetchingLocation] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [pdfGenerated, setPdfGenerated] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [errors, setErrors] = useState({})
  
  // NEW: State for filename customization
  const [customFilename, setCustomFilename] = useState('')
  const [showFilenameModal, setShowFilenameModal] = useState(false)
  const [defaultFilename, setDefaultFilename] = useState('')

  // NEW: State for calendar popup
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())

  // Save draft to localStorage
  useEffect(() => {
    if (isDirty) {
      const saveTimeout = setTimeout(() => {
        localStorage.setItem('momFormDraft', JSON.stringify(formData))
        console.log('💾 Form draft saved')
      }, 500)
      return () => clearTimeout(saveTimeout)
    }
  }, [formData, isDirty])

  // Clear draft on successful submission
  const clearDraft = () => {
    localStorage.removeItem('momFormDraft')
    setIsDirty(false)
  }

  // Auto-fill current time
  const fillCurrentTime = (fieldName) => {
    const now = new Date()
    const timeString = now.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    })
    setFormData(prev => ({ ...prev, [fieldName]: timeString }))
    setIsDirty(true)
  }

  // NEW: Auto-set site end date based on site start date (default: next day)
  useEffect(() => {
    if (formData.siteStartDate && !formData.siteEndDate) {
      const startDate = new Date(formData.siteStartDate)
      const nextDay = new Date(startDate)
      nextDay.setDate(startDate.getDate() + 1)
      const nextDayStr = nextDay.toISOString().split('T')[0]
      setFormData(prev => ({ ...prev, siteEndDate: nextDayStr }))
      setIsDirty(true)
    }
  }, [formData.siteStartDate])

  // Calculate man hours automatically
  useEffect(() => {
    if (formData.reportingTime && formData.momCloseTime) {
      const parseTime = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number)
        return hours + minutes / 60
      }

      const start = parseTime(formData.reportingTime)
      const end = parseTime(formData.momCloseTime)
      
      if (end > start) {
        const hours = (end - start).toFixed(2)
        setFormData(prev => ({ ...prev, manHours: hours }))
      }
    }
  }, [formData.reportingTime, formData.momCloseTime])

  // Calculate site duration
  const calculateSiteDuration = useCallback(() => {
    if (formData.siteStartDate && formData.siteEndDate) {
      const start = new Date(formData.siteStartDate)
      const end = new Date(formData.siteEndDate)
      const diffTime = Math.abs(end - start)
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      return diffDays
    }
    return 0
  }, [formData.siteStartDate, formData.siteEndDate])

  const validateForm = () => {
    const newErrors = {}
    
    if (!formData.customerName.trim()) {
      newErrors.customerName = 'Customer name is required'
    }
    
    if (!formData.customerPerson.trim()) {
      newErrors.customerPerson = 'Contact person is required'
    }
    
    if (formData.custContact && !/^\d{10,15}$/.test(formData.custContact)) {
      newErrors.custContact = 'Enter a valid contact number (10-15 digits)'
    }
    
    if (!formData.projectName.trim()) {
      newErrors.projectName = 'Project name is required'
    }
    
    // NEW: Validate site dates
    if (formData.siteStartDate && formData.siteEndDate) {
      const start = new Date(formData.siteStartDate)
      const end = new Date(formData.siteEndDate)
      
      if (end < start) {
        newErrors.siteDates = 'Site end date cannot be before start date'
      }
      
      // Check if end date is too far in future (optional validation)
      const today = new Date()
      const maxDate = new Date()
      maxDate.setFullYear(today.getFullYear() + 5) // Max 5 years in future
      
      if (end > maxDate) {
        newErrors.siteEndDate = 'Site end date cannot be more than 5 years in the future'
      }
    }
    
    if (formData.reportingTime && formData.momCloseTime) {
      if (formData.reportingTime >= formData.momCloseTime) {
        newErrors.time = 'Close time must be after reporting time'
      }
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Generate default filename
  const generateDefaultFilename = useCallback(() => {
    const momDate = formData.momDate || new Date().toISOString().split('T')[0]
    const empId = employeeId !== 'UNKNOWN' ? employeeId : 'TEST001'
    const customerShort = formData.customerName
      ? formData.customerName.substring(0, 20).replace(/[^a-z0-9]/gi, '_')
      : 'Customer'
    
    return `${empId}_MOM_${customerShort}_${momDate}.pdf`.replace(/\s+/g, '_')
  }, [formData.momDate, employeeId, formData.customerName])

  // Update default filename whenever form changes
  useEffect(() => {
    const filename = generateDefaultFilename()
    setDefaultFilename(filename)
    // Initialize custom filename with default on first render
    if (!customFilename) {
      setCustomFilename(filename)
    }
  }, [formData, generateDefaultFilename])

  // NEW: Calendar functions
  const generateCalendarDays = () => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay()
    const days = []
    
    // Add empty cells for days before first day of month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null)
    }
    
    // Add days of month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(calendarYear, calendarMonth, i)
      days.push(date)
    }
    
    return days
  }

  const handleCalendarDateSelect = (date) => {
    const dateStr = date.toISOString().split('T')[0]
    setFormData(prev => ({ ...prev, siteEndDate: dateStr }))
    setIsDirty(true)
    setShowCalendar(false)
  }

  const navigateCalendarMonth = (direction) => {
    setCalendarMonth(prev => {
      let newMonth = prev + direction
      let newYear = calendarYear
      
      if (newMonth < 0) {
        newMonth = 11
        newYear--
      } else if (newMonth > 11) {
        newMonth = 0
        newYear++
      }
      
      setCalendarYear(newYear)
      return newMonth
    })
  }

  const handleTodayClick = () => {
    const today = new Date().toISOString().split('T')[0]
    setFormData(prev => ({ ...prev, siteEndDate: today }))
    setIsDirty(true)
  }

  const handleTomorrowClick = () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    setFormData(prev => ({ ...prev, siteEndDate: tomorrow }))
    setIsDirty(true)
  }

  const handleNextWeekClick = () => {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    setFormData(prev => ({ ...prev, siteEndDate: nextWeek }))
    setIsDirty(true)
  }

  const handleEndOfMonthClick = () => {
    const today = new Date()
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString().split('T')[0]
    setFormData(prev => ({ ...prev, siteEndDate: endOfMonth }))
    setIsDirty(true)
  }

  // NEW: Handle filename change
  const handleFilenameChange = (e) => {
    let value = e.target.value
    // Remove any .pdf extension if user adds it
    value = value.replace(/\.pdf$/i, '')
    // Ensure filename is safe for Windows
    value = value.replace(/[<>:"/\\|?*]/g, '_')
    setCustomFilename(value)
  }

  // NEW: Get final filename
  const getFinalFilename = () => {
    if (!customFilename.trim()) {
      return defaultFilename
    }
    // Add .pdf extension if not present
    const filename = customFilename.trim()
    return filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  }

  // NEW: Show filename modal before generating PDF
  const handleSubmit = (e) => {
    e.preventDefault()
    
    if (!validateForm()) {
      alert('Please fix the form errors before generating PDF')
      return
    }
    
    console.log('=== MOM SUBMISSION DEBUG ===')
    console.log('Employee ID:', employeeId)
    console.log('MOM Date:', formData.momDate)
    console.log('Site Duration:', calculateSiteDuration(), 'days')
    console.log('Default filename:', defaultFilename)
    console.log('Custom filename:', customFilename)
    console.log('Final filename:', getFinalFilename())
    
    // Show filename customization modal
    setShowFilenameModal(true)
  }

  // NEW: Generate PDF after filename confirmation
  const generateAndDownloadPDF = () => {
    const fileName = getFinalFilename()
    console.log('🚀 Generating PDF with filename:', fileName)

    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 14
      let yPos = 20

      // Header with logo placeholder
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text('VICKHARDTH AUTOMATION PVT LTD', pageWidth / 2, yPos, { align: 'center' })
      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      doc.text('Minutes of Meeting', pageWidth / 2, yPos + 8, { align: 'center' })

      yPos += 25

      // Meeting Details Table
      const meetingDetails = [
        ['Document No.', `${employeeId}/MOM/${formData.momDate.replace(/-/g, '')}`],
        ['Meeting Date', formData.momDate],
        ['Meeting Type', formData.meetingType.toUpperCase()],
        ['Employee ID', employeeId],
        ['Engineer Name', formData.enggName],
        ['Customer Name', formData.customerName],
        ['Contact Person', formData.customerPerson],
        ['Customer Contact', formData.custContact || 'N/A'],
        ['Project Name', formData.projectName],
        ['Site Location', formData.siteLocation || 'N/A'],
        ['Site Start Date', formData.siteStartDate],
        ['Site End Date', formData.siteEndDate],
        ['Site Duration', `${calculateSiteDuration()} days`],
        ['Site Status', formData.siteStatus || 'Ongoing'],
        ['Reporting Time', formData.reportingTime || 'N/A'],
        ['Close Time', formData.momCloseTime || 'N/A'],
        ['Man Hours', formData.manHours || 'N/A'],
        ['Participants', formData.participants || 'N/A']
      ]

      doc.autoTable({
        startY: yPos,
        head: [['Meeting Details', 'Information']],
        body: meetingDetails,
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 45 },
          1: { cellWidth: pageWidth - 60 }
        },
        margin: { left: margin, right: margin }
      })

      yPos = doc.lastAutoTable.finalY + 15

      // Observations
      if (formData.observation) {
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text('OBSERVATIONS:', margin, yPos)
        yPos += 8
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        const observationLines = doc.splitTextToSize(formData.observation, pageWidth - 2 * margin)
        observationLines.forEach(line => {
          if (yPos > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage()
            yPos = 20
          }
          doc.text(line, margin, yPos)
          yPos += 8
        })
        yPos += 10
      }

      // Solutions
      if (formData.solution) {
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text('SOLUTIONS / ACTIONS TAKEN:', margin, yPos)
        yPos += 8
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        const solutionLines = doc.splitTextToSize(formData.solution, pageWidth - 2 * margin)
        solutionLines.forEach(line => {
          if (yPos > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage()
            yPos = 20
          }
          doc.text(line, margin, yPos)
          yPos += 8
        })
        yPos += 10
      }

      // Conclusion
      if (formData.conclusion) {
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text('CONCLUSION / NEXT STEPS:', margin, yPos)
        yPos += 8
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        const conclusionLines = doc.splitTextToSize(formData.conclusion, pageWidth - 2 * margin)
        conclusionLines.forEach(line => {
          if (yPos > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage()
            yPos = 20
          }
          doc.text(line, margin, yPos)
          yPos += 8
        })
      }

      // Footer
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
        doc.text(
          `Page ${i} of ${pageCount} | Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        )
      }

      // Save PDF with custom filename
      setPdfGenerated(true)
      doc.save(fileName)
      console.log('✅ PDF download initiated with filename:', fileName)

      // Clear draft and show success
      clearDraft()
      setTimeout(() => {
        alert(`✅ MOM PDF Generated Successfully!\n\nFilename: ${fileName}\n\nCheck your Downloads folder.`)
        setPdfGenerated(false)
        setShowFilenameModal(false)
        // Reset custom filename to default for next time
        setCustomFilename(defaultFilename)
      }, 500)

    } catch (error) {
      console.error('❌ Error generating PDF:', error)
      alert('❌ Failed to generate PDF. Please check console for details.')
      setPdfGenerated(false)
      setShowFilenameModal(false)
    }
  }

  // NEW: Cancel PDF generation
  const cancelPdfGeneration = () => {
    setShowFilenameModal(false)
    setPdfGenerated(false)
  }

  const prefillHourlyReports = async () => {
    try {
      const tokenVal = localStorage.getItem('token')
      if (!tokenVal) return

      const urlBase = import.meta.env.VITE_API_URL?.replace('/api/activity', '/api/employee-activity') || 'http://localhost:5000/api/employee-activity'
      const res = await fetch(`${urlBase}/activities/today`, {
        headers: { Authorization: `Bearer ${tokenVal}` },
      })
      
      if (!res.ok) return
      const data = await res.json()
      const hourlyReports = data.activities?.filter(a => a.reportType === 'hourly') || []

      if (hourlyReports.length === 0) return

      const obsLines = hourlyReports.map((r, idx) => {
        const date = r.reportDate ? format(new Date(r.reportDate), 'MM/dd/yyyy') : ''
        return `${idx + 1}. [${date}] ${r.username || 'Engineer'}: ${r.dailyTargetAchieved || 'Activity performed'}${r.problemFaced ? ` - Issue: ${r.problemFaced}` : ''}`
      })

      const solLines = hourlyReports.map((r, idx) => {
        const solution = r.solutionProvided || (r.problemFaced ? 'Issue addressed' : 'Work completed')
        return `${idx + 1}. ${solution}`
      })

      setFormData(prev => ({
        ...prev,
        observation: prev.observation || obsLines.join('\n'),
        solution: prev.solution || solLines.join('\n'),
      }))
      setIsDirty(true)
    } catch (err) {
      console.error('Failed to prefill hourly reports:', err)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    let processedValue = value
    
    if (name === 'custContact') {
      processedValue = value.replace(/\D/g, '').substring(0, 15)
    }
    
    setFormData(prev => ({ ...prev, [name]: processedValue }))
    setIsDirty(true)
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const clearForm = () => {
    if (window.confirm('Are you sure you want to clear all form data?')) {
      const today = new Date().toISOString().split('T')[0]
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
      
      setFormData({
        customerName: '',
        customerPerson: '',
        custContact: '',
        momDate: today,
        reportingTime: '',
        momCloseTime: '',
        manHours: '',
        enggName: user?.username || '',
        siteLocation: localStorage.getItem('lastSiteLocation') || '',
        projectName: '',
        observation: '',
        solution: '',
        conclusion: '',
        meetingType: 'onsite',
        participants: '',
        siteStartDate: today,
        siteEndDate: tomorrow,
        siteStatus: 'ongoing'
      })
      clearDraft()
      setErrors({})
      setCustomFilename(generateDefaultFilename())
    }
  }

  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported by your browser')
      return
    }

    setLocationError('')
    setFetchingLocation(true)

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        })
      })

      const { latitude, longitude } = position.coords
      const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
      let address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`

      if (googleApiKey) {
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleApiKey}`
          )
          const data = await response.json()
          if (data?.status === 'OK' && data.results?.[0]) {
            address = data.results[0].formatted_address
          }
        } catch (e) {
          console.warn('Google Geocoding failed, using coordinates:', e)
        }
      }

      setFormData(prev => ({ ...prev, siteLocation: address }))
      localStorage.setItem('lastSiteLocation', address)
      setIsDirty(true)

    } catch (error) {
      console.error('Location error:', error)
      setLocationError(error.code === 1 
        ? 'Location access denied. Please enable location permissions.' 
        : 'Failed to get location. Please try again.'
      )
    } finally {
      setFetchingLocation(false)
    }
  }

  // NEW: Calendar component
  const CalendarPopup = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
            </svg>
            Select Site End Date
          </h3>
          <button
            onClick={() => setShowCalendar(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Calendar Header - Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigateCalendarMonth(-1)}
            className="p-2 rounded-full hover:bg-gray-100"
          >
            <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
          </button>
          <div className="text-lg font-semibold text-gray-800">
            {new Date(calendarYear, calendarMonth).toLocaleDateString('en-US', { 
              month: 'long', 
              year: 'numeric' 
            })}
          </div>
          <button
            onClick={() => navigateCalendarMonth(1)}
            className="p-2 rounded-full hover:bg-gray-100"
          >
            <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>

        {/* Calendar Days Header */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-sm font-medium text-gray-500 py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-1">
          {generateCalendarDays().map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="h-8"></div>
            }

            const dateStr = date.toISOString().split('T')[0]
            const isToday = dateStr === new Date().toISOString().split('T')[0]
            const isSelected = dateStr === formData.siteEndDate
            const isPast = date < new Date() && !isToday
            const isWeekend = date.getDay() === 0 || date.getDay() === 6

            return (
              <button
                key={dateStr}
                onClick={() => handleCalendarDateSelect(date)}
                disabled={isPast}
                className={`
                  h-8 rounded-lg text-sm transition-colors
                  ${isSelected 
                    ? 'bg-blue-500 text-white font-semibold' 
                    : isToday 
                      ? 'bg-blue-100 text-blue-700 font-semibold' 
                      : isPast
                        ? 'text-gray-300 cursor-not-allowed'
                        : isWeekend
                          ? 'text-gray-500 hover:bg-gray-100'
                          : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                {date.getDate()}
              </button>
            )
          })}
        </div>

        {/* Quick Actions */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="text-sm font-medium text-gray-700 mb-2">Quick Select:</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleTodayClick}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
            >
              Today
            </button>
            <button
              onClick={handleTomorrowClick}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
            >
              Tomorrow
            </button>
            <button
              onClick={handleNextWeekClick}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
            >
              Next Week
            </button>
            <button
              onClick={handleEndOfMonthClick}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
            >
              End of Month
            </button>
          </div>
        </div>

        {/* Selected Date Display */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm font-medium text-gray-700 mb-1">Selected Date:</div>
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="font-mono text-blue-700">
              {formData.siteEndDate}
            </div>
            <div className="text-sm text-gray-600">
              {calculateSiteDuration()} days from start
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Vickhardth Automation - Minutes of Meeting
          </h1>
          <p className="text-gray-600">Fill in meeting details to generate professional MOM document</p>
        </div>

        {/* Debug Panel - Collapsible */}
        <details className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <summary className="p-4 cursor-pointer bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 flex items-center justify-between">
            <span className="font-semibold text-blue-700 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
              </svg>
              Debug Information
            </span>
            <svg className="w-5 h-5 text-blue-500 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
            </svg>
          </summary>
          <div className="p-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">Employee ID:</span>
                  <code className="ml-2 px-2 py-1 bg-gray-100 rounded font-mono">{employeeId}</code>
                  {employeeId === 'UNKNOWN' && (
                    <span className="ml-3 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      ⚠️ Not found in AuthContext
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Username:</span>
                  <span className="ml-2 text-gray-700">{user?.username || 'Not available'}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium">Site Duration:</span>
                  <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded font-medium">
                    {calculateSiteDuration()} days
                  </span>
                </div>
              </div>
              <div className="text-sm">
                <div className="font-medium mb-1">Default PDF Filename:</div>
                <code className="block p-2 bg-gray-50 rounded border font-mono text-sm break-all">
                  {defaultFilename}
                </code>
              </div>
            </div>
          </div>
        </details>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-6 space-y-6">
          {/* Basic Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Name *
              </label>
              <input
                className={`input ${errors.customerName ? 'border-red-500' : ''}`}
                placeholder="Enter customer name"
                name="customerName"
                value={formData.customerName}
                onChange={handleChange}
                required
              />
              {errors.customerName && (
                <p className="mt-1 text-sm text-red-600">{errors.customerName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Person *
              </label>
              <input
                className={`input ${errors.customerPerson ? 'border-red-500' : ''}`}
                placeholder="Contact person name"
                name="customerPerson"
                value={formData.customerPerson}
                onChange={handleChange}
                required
              />
              {errors.customerPerson && (
                <p className="mt-1 text-sm text-red-600">{errors.customerPerson}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Contact
              </label>
              <input
                className={`input ${errors.custContact ? 'border-red-500' : ''}`}
                placeholder="Phone number"
                name="custContact"
                value={formData.custContact}
                onChange={handleChange}
                type="tel"
              />
              {errors.custContact && (
                <p className="mt-1 text-sm text-red-600">{errors.custContact}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meeting Date *
              </label>
              <input
                type="date"
                className="input"
                name="momDate"
                value={formData.momDate}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reporting Time
              </label>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="HH:MM"
                  name="reportingTime"
                  value={formData.reportingTime}
                  onChange={handleChange}
                  type="time"
                />
                <button
                  type="button"
                  onClick={() => fillCurrentTime('reportingTime')}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium"
                >
                  Now
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Close Time
              </label>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="HH:MM"
                  name="momCloseTime"
                  value={formData.momCloseTime}
                  onChange={handleChange}
                  type="time"
                />
                <button
                  type="button"
                  onClick={() => fillCurrentTime('momCloseTime')}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium"
                >
                  Now
                </button>
              </div>
              {errors.time && (
                <p className="mt-1 text-sm text-red-600">{errors.time}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Man Hours
              </label>
              <input
                className="input bg-gray-50"
                placeholder="Auto-calculated"
                name="manHours"
                value={formData.manHours}
                readOnly
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Engineer Name
              </label>
              <input
                className="input"
                placeholder="Engineer name"
                name="enggName"
                value={formData.enggName}
                onChange={handleChange}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site Location
              </label>
              <div className="flex gap-2">
                <input
                  className="input flex-grow"
                  placeholder="Enter site location or detect automatically"
                  name="siteLocation"
                  value={formData.siteLocation}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  onClick={getCurrentLocation}
                  disabled={fetchingLocation}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-green-300 flex items-center gap-2"
                >
                  {fetchingLocation ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>
                      Detecting...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                      </svg>
                      Detect
                    </>
                  )}
                </button>
              </div>
              {locationError && (
                <p className="mt-1 text-sm text-red-600">{locationError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project Name *
              </label>
              <input
                className={`input ${errors.projectName ? 'border-red-500' : ''}`}
                placeholder="Enter project name"
                name="projectName"
                value={formData.projectName}
                onChange={handleChange}
                required
              />
              {errors.projectName && (
                <p className="mt-1 text-sm text-red-600">{errors.projectName}</p>
              )}
            </div>

            {/* NEW: Site Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site Start Date
              </label>
              <input
                type="date"
                className="input"
                name="siteStartDate"
                value={formData.siteStartDate}
                onChange={handleChange}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* NEW: Site End Date with Calendar Button */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site End Date
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  className="input"
                  name="siteEndDate"
                  value={formData.siteEndDate}
                  onChange={handleChange}
                  min={formData.siteStartDate}
                />
                <button
                  type="button"
                  onClick={() => setShowCalendar(true)}
                  className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
                  </svg>
                  Calendar
                </button>
              </div>
              {errors.siteDates && (
                <p className="mt-1 text-sm text-red-600">{errors.siteDates}</p>
              )}
              {errors.siteEndDate && (
                <p className="mt-1 text-sm text-red-600">{errors.siteEndDate}</p>
              )}
              <div className="mt-1 text-xs text-gray-500">
                Duration: <span className="font-medium text-green-600">{calculateSiteDuration()} days</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site Status
              </label>
              <select
                className="input"
                name="siteStatus"
                value={formData.siteStatus}
                onChange={handleChange}
              >
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="onhold">On Hold</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meeting Type
              </label>
              <select
                className="input"
                name="meetingType"
                value={formData.meetingType}
                onChange={handleChange}
              >
                <option value="onsite">On-site Meeting</option>
                <option value="online">Online Meeting</option>
                <option value="phone">Phone Call</option>
                <option value="email">Email Communication</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Participants
              </label>
              <input
                className="input"
                placeholder="Names of attendees"
                name="participants"
                value={formData.participants}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Text Areas */}
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Observations
                </label>
                <button
                  type="button"
                  onClick={prefillHourlyReports}
                  className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Prefill from Today's Reports
                </button>
              </div>
              <textarea
                className="input h-40 w-full resize-y"
                placeholder="Enter detailed observations from the meeting..."
                name="observation"
                value={formData.observation}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Solutions / Actions Taken
              </label>
              <textarea
                className="input h-40 w-full resize-y"
                placeholder="Describe solutions or actions agreed upon..."
                name="solution"
                value={formData.solution}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Conclusion / Next Steps
              </label>
              <textarea
                className="input h-32 w-full resize-y"
                placeholder="Summarize conclusions and outline next steps..."
                name="conclusion"
                value={formData.conclusion}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={pdfGenerated}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-6 rounded-xl text-lg font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-200 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {pdfGenerated ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Generating PDF...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd"/>
                  </svg>
                  Generate MOM PDF
                </>
              )}
            </button>

            <button
              type="button"
              onClick={clearForm}
              className="px-6 py-3 bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 rounded-xl font-medium hover:from-gray-200 hover:to-gray-300 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
              </svg>
              Clear Form
            </button>
          </div>

          {/* Footer Information */}
          <div className="text-center pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-600">
              Default PDF filename: <code className="bg-gray-50 px-2 py-1 rounded text-gray-800 font-mono">{defaultFilename}</code>
            </p>
            <p className="text-xs text-gray-500 mt-2">
              You can customize the filename before downloading. Your form is auto-saved.
            </p>
          </div>
        </form>
      </div>

      {/* Calendar Popup */}
      {showCalendar && <CalendarPopup />}

      {/* Filename Customization Modal */}
      {showFilenameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd"/>
                </svg>
                Customize PDF Filename
              </h3>
              <button
                onClick={cancelPdfGeneration}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter filename for the PDF:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={customFilename}
                  onChange={handleFilenameChange}
                  className="w-full p-3 pr-12 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                  placeholder="Enter filename"
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-mono text-sm">
                  .pdf
                </span>
              </div>
              
              <div className="mt-3">
                <div className="text-sm text-gray-600 mb-1">
                  Preview: <code className="ml-2 px-2 py-1 bg-blue-50 rounded font-mono text-blue-700">{getFinalFilename()}</code>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  <div className="flex items-start gap-1">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                    </svg>
                    <span>Tip: Don't include .pdf extension, it will be added automatically</span>
                  </div>
                  <div className="flex items-start gap-1 mt-1">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                    </svg>
                    <span>Invalid characters &lt; &gt; : " / \ | ? * will be replaced with underscore</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Default filename suggestion:</div>
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <code className="flex-1 text-sm font-mono text-gray-700 truncate">{defaultFilename}</code>
                <button
                  type="button"
                  onClick={() => setCustomFilename(defaultFilename.replace('.pdf', ''))}
                  className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                >
                  Use This
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={cancelPdfGeneration}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={generateAndDownloadPDF}
                disabled={pdfGenerated}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all duration-200 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {pdfGenerated ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd"/>
                    </svg>
                    Download PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add some custom styles for the modal animation */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </div>
  )
}
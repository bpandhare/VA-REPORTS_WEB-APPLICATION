import { useMemo, useState, useEffect } from 'react'
import './OnboardingForm.css'
import { useAuth } from './AuthContext'

const getIndianTime = () => {
  const now = new Date()
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

const defaultPayload = () => {
  const now = new Date()
  const inTime = getIndianTime()
  const outTime = ''
  const today = now.toISOString().slice(0, 10)

  return {
    reportDate: today,
    inTime: inTime,
    outTime: outTime,
    customerName: '',
    customerPerson: '',
    customerContact: '',
    customerCountryCode: '+91', // Default country code for India
    endCustomerName: '',
    endCustomerPerson: '',
    endCustomerContact: '',
    endCustomerCountryCode: '+91', // Default country code for India
    projectNo: '',
    locationType: '', // 'site', 'office', 'leave'
    leaveType: '', // Leave type ID
    siteLocation: '',
    locationLat: '',
    locationLng: '',
    momReport: null,
    dailyTargetPlanned: '',
    dailyTargetAchieved: '',
    additionalActivity: '',
    whoAddedActivity: '',
    dailyPendingTarget: '',
    reasonPendingTarget: '',
    problemFaced: '',
    problemResolved: '',
    onlineSupportRequired: '',
    supportEngineerName: '',
    siteStartDate: today,
    siteEndDate: '',
    incharge: '',
    remark: '',
  }
}

function DailyTargetForm() {
  const { token, user } = useAuth()
  const [formData, setFormData] = useState(defaultPayload)
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState(null)
  const [locationAccess, setLocationAccess] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [submittedData, setSubmittedData] = useState(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [locationName, setLocationName] = useState('')
  const [fetchingLocation, setFetchingLocation] = useState(false)
  const [leaveBalance, setLeaveBalance] = useState({ total: 24, used: 0, remaining: 24 })
  const [loadingLeaveBalance, setLoadingLeaveBalance] = useState(false)
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leaveBalanceByType, setLeaveBalanceByType] = useState([])
  const [selectedLeaveType, setSelectedLeaveType] = useState(null)
  const [leaveAvailability, setLeaveAvailability] = useState(null)
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [checkingExistingReport, setCheckingExistingReport] = useState(false)
  
  // Auto-save states
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)
  const [lastSaved, setLastSaved] = useState(null)
  const [isDirty, setIsDirty] = useState(false)
  const [savedData, setSavedData] = useState(null)

  // Country code options
  const countryCodes = [
    { code: '+91', name: 'India', flag: '🇮🇳' },
    { code: '+1', name: 'USA/Canada', flag: '🇺🇸' },
    { code: '+44', name: 'UK', flag: '🇬🇧' },
    { code: '+61', name: 'Australia', flag: '🇦🇺' },
    { code: '+971', name: 'UAE', flag: '🇦🇪' },
    { code: '+65', name: 'Singapore', flag: '🇸🇬' },
    { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
    { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
    { code: '+973', name: 'Bahrain', flag: '🇧🇭' },
    { code: '+968', name: 'Oman', flag: '🇴🇲' },
    { code: '+974', name: 'Qatar', flag: '🇶🇦' },
    { code: '+964', name: 'Iraq', flag: '🇮🇶' },
    { code: '+98', name: 'Iran', flag: '🇮🇷' },
    { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
    { code: '+93', name: 'Afghanistan', flag: '🇦🇫' },
    { code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
    { code: '+94', name: 'Sri Lanka', flag: '🇱🇰' },
    { code: '+95', name: 'Myanmar', flag: '🇲🇲' },
    { code: '+977', name: 'Nepal', flag: '🇳🇵' },
    { code: '+81', name: 'Japan', flag: '🇯🇵' },
    { code: '+82', name: 'South Korea', flag: '🇰🇷' },
    { code: '+86', name: 'China', flag: '🇨🇳' },
    { code: '+33', name: 'France', flag: '🇫🇷' },
    { code: '+49', name: 'Germany', flag: '🇩🇪' },
    { code: '+39', name: 'Italy', flag: '🇮🇹' },
    { code: '+34', name: 'Spain', flag: '🇪🇸' },
    { code: '+7', name: 'Russia', flag: '🇷🇺' },
    { code: '+55', name: 'Brazil', flag: '🇧🇷' },
    { code: '+27', name: 'South Africa', flag: '🇿🇦' },
  ]

  const endpoint = useMemo(
    () => import.meta.env.VITE_API_URL?.replace('/api/activity', '/api/daily-target') ?? 'http://localhost:5000/api/daily-target',
    []
  )

  // Fetch leave types and balances when component mounts or user changes
  useEffect(() => {
    const fetchLeaveData = async () => {
      if (!user || !token) return
      
      try {
        setLoadingLeaveBalance(true)
        
        // Fetch leave types
        const typesResponse = await fetch(`${endpoint}/leave-types`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        
        if (typesResponse.ok) {
          const typesData = await typesResponse.json()
          setLeaveTypes(typesData)
        }
        
        // Fetch leave balance by type
        const balanceResponse = await fetch(`${endpoint}/leave-balance-by-type`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        
        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json()
          setLeaveBalanceByType(balanceData.leaveBalance)
        }
        
        // Fetch total leave balance
        const totalBalanceResponse = await fetch(`${endpoint}/leave-balance`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        
        if (totalBalanceResponse.ok) {
          const totalBalanceData = await totalBalanceResponse.json()
          setLeaveBalance({
            total: totalBalanceData.totalLeaves || 24,
            used: totalBalanceData.usedLeaves || 0,
            remaining: totalBalanceData.remainingLeaves || 24
          })
        }
      } catch (error) {
        console.error('Error fetching leave data:', error)
      } finally {
        setLoadingLeaveBalance(false)
      }
    }
    
    fetchLeaveData()
  }, [user, token, endpoint])

  // Load auto-saved data on component mount
  useEffect(() => {
    const loadAutoSavedData = () => {
      const saved = localStorage.getItem(`daily-report-auto-save-${user?.id}`)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          // Only load if it's from today
          if (parsed.date === new Date().toISOString().slice(0, 10)) {
            setSavedData(parsed)
            setLastSaved(parsed.timestamp)
          }
        } catch (error) {
          console.error('Failed to parse auto-saved data:', error)
        }
      }
    }

    if (user?.id) {
      loadAutoSavedData()
    }
  }, [user])

  // Auto-save timer
  useEffect(() => {
    if (!autoSaveEnabled || !isDirty) return

    const autoSaveTimer = setTimeout(() => {
      performAutoSave()
    }, 5000) // Auto-save after 5 seconds of inactivity

    return () => clearTimeout(autoSaveTimer)
  }, [formData, autoSaveEnabled, isDirty])

  // Get user's location when site location is selected
  useEffect(() => {
    try {
      if (formData.locationType === 'site') {
        setLocationAccess(false)
        setLocationError('')
      } else if (formData.locationType === 'leave') {
        setLocationAccess(false)
        setLocationError('')
        setFormData((prev) => ({
          ...prev,
          inTime: '',
          outTime: '',
          customerName: '',
          customerPerson: '',
          customerContact: '',
          customerCountryCode: '+91',
          endCustomerName: '',
          endCustomerPerson: '',
          endCustomerContact: '',
          endCustomerCountryCode: '+91',
          projectNo: '',
          siteLocation: '',
          locationLat: '',
          locationLng: '',
          momReport: null,
          dailyTargetPlanned: '',
          dailyTargetAchieved: '',
          additionalActivity: '',
          whoAddedActivity: '',
          dailyPendingTarget: '',
          reasonPendingTarget: '',
          problemFaced: '',
          problemResolved: '',
          onlineSupportRequired: '',
          supportEngineerName: '',
          siteStartDate: '',
          siteEndDate: '',
          incharge: '',
          remark: ''
        }))

        if (typeof document !== 'undefined') {
          setTimeout(() => {
            const form = document.querySelector('.vh-form')
            if (form) {
              const inputs = form.querySelectorAll('input, textarea, select')
              inputs.forEach(input => {
                input.setCustomValidity('')
                input.checkValidity()
              })
              form.checkValidity()
            }
          }, 50)
        }

        setLocationName('')
      } else {
        setLocationAccess(false)
        setLocationError('')
        setFormData((prev) => ({ ...prev, siteLocation: '', locationLat: '', locationLng: '', momReport: null }))
        setLocationName('')
      }

    } catch (error) {
      console.error('Error handling location type change:', error)
      setLocationError('Failed to update location settings')
    }
  }, [formData.locationType])

  // Reset leave type when switching from leave to other location types
  useEffect(() => {
    if (formData.locationType !== 'leave' && formData.leaveType) {
      setFormData(prev => ({ ...prev, leaveType: '' }))
      setSelectedLeaveType(null)
      setLeaveAvailability(null)
    }
  }, [formData.locationType])

  // Check if a report already exists for the selected date
  const checkExistingReport = async (date, excludeId = null) => {
    if (!date || !token) return null
    
    try {
      setCheckingExistingReport(true)
      const response = await fetch(`${endpoint}/check-report-date?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        
        // If we're editing and the existing report is the one we're editing, it's okay
        if (excludeId && data.id && parseInt(data.id) === parseInt(excludeId)) {
          return null
        }
        
        return data.exists ? data : null
      }
      return null
    } catch (error) {
      console.error('Error checking existing report:', error)
      return null
    } finally {
      setCheckingExistingReport(false)
    }
  }

  // Check if leave date is valid (not a weekend and not already taken as leave)
  const validateLeaveDate = async (date) => {
    if (!date) return { valid: true }
    
    const leaveDate = new Date(date)
    const dayOfWeek = leaveDate.getDay()
    
    // Check if it's a weekend (Saturday=6, Sunday=0)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { 
        valid: false, 
        message: 'Cannot apply for leave on weekends (Saturday/Sunday)' 
      }
    }
    
    // Check if leave already exists for this date (only for non-edit mode)
    if (!isEditMode && user && token) {
      try {
        const response = await fetch(`${endpoint}/check-leave?date=${date}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.isLeaveTaken) {
            return { 
              valid: false, 
              message: `You have already applied for ${data.leaveType || 'leave'} on this date` 
            }
          }
        }
      } catch (error) {
        console.error('Error checking leave:', error)
      }
    }
    
    return { valid: true }
  }

  const reverseGeocode = async (lat, lng) => {
    try {
      setFetchingLocation(true)
      let bestAddress = null
      let addresses = []
      
      const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
      if (googleApiKey) {
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}&language=en&region=in&result_type=street_address|premise|subpremise|neighborhood|locality|sublocality`
          )
          
          if (response.ok) {
            const data = await response.json()
            if (data && data.status === 'OK' && data.results && data.results.length > 0) {
              let specificResult = data.results.find(r => 
                r.types.includes('street_address') || 
                r.types.includes('premise') || 
                r.types.includes('subpremise')
              )
              
              if (!specificResult) {
                specificResult = data.results.find(r => 
                  r.types.includes('neighborhood') || 
                  r.types.includes('sublocality') ||
                  r.types.includes('sublocality_level_1')
                )
              }
              
              if (!specificResult) {
                specificResult = data.results.find(r => r.types.includes('locality'))
              }
              
              if (!specificResult) {
                specificResult = data.results[0]
              }
              
              if (specificResult && specificResult.formatted_address) {
                bestAddress = specificResult.formatted_address
                setLocationName(bestAddress)
                return bestAddress
              }
            }
          }
        } catch (error) {
          console.warn('Google Geocoding API failed:', error)
        }
      }
      
      const zoomLevels = [18, 16, 14, 12]
      for (const zoom of zoomLevels) {
        try {
          const urls = [
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1&extratags=1&namedetails=1&accept-language=en`,
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1&extratags=1&accept-language=en-IN`,
          ]
          
          for (const url of urls) {
            const response = await fetch(url, {
              headers: {
                'User-Agent': 'Vickhardth Site Pulse App',
                'Accept-Language': 'en,en-IN',
              },
            })
            
            if (response.ok) {
              const data = await response.json()
              if (data) {
                if (data.address) {
                  const addr = data.address
                  let addressParts = []
                  
                  if (addr.locality) addressParts.push(addr.locality)
                  else if (addr.neighbourhood) addressParts.push(addr.neighbourhood)
                  else if (addr.suburb) addressParts.push(addr.suburb)
                  else if (addr.quarter) addressParts.push(addr.quarter)
                  else if (addr.residential) addressParts.push(addr.residential)
                  else if (addr.hamlet) addressParts.push(addr.hamlet)
                  
                  if (addr.leisure) addressParts.push(addr.leisure)
                  if (addr.amenity) addressParts.push(addr.amenity)
                  if (addr.place) addressParts.push(addr.place)
                  
                  if (addr.road) addressParts.push(addr.road)
                  else if (addr.street) addressParts.push(addr.street)
                  else if (addr.pedestrian) addressParts.push(addr.pedestrian)
                  else if (addr.footway) addressParts.push(addr.footway)
                  else if (addr.path) addressParts.push(addr.path)
                  
                  if (addr.city) addressParts.push(addr.city)
                  else if (addr.town) addressParts.push(addr.town)
                  else if (addr.village) addressParts.push(addr.village)
                  else if (addr.municipality) addressParts.push(addr.municipality)
                  
                  if (addr.city_district) addressParts.push(addr.city_district)
                  
                  if (addr.district) addressParts.push(addr.district)
                  else if (addr.county) addressParts.push(addr.county)
                  
                  if (addr.postcode) addressParts.push(addr.postcode)
                  
                  if (addr.state) addressParts.push(addr.state)
                  
                  if (addressParts.length > 0) {
                    const constructedAddress = addressParts.join(', ')
                    addresses.push(constructedAddress)
                  }
                }
                
                if (data.display_name) {
                  addresses.push(data.display_name)
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Nominatim API failed for zoom ${zoom}:`, error)
          continue
        }
      }
      
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
      if (mapboxToken && !bestAddress) {
        try {
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&types=address,poi,neighborhood,locality`
          )
          
          if (response.ok) {
            const data = await response.json()
            if (data && data.features && data.features.length > 0) {
              const feature = data.features[0]
              if (feature.place_name) {
                addresses.push(feature.place_name)
              }
            }
          }
        } catch (error) {
          console.warn('MapBox API failed:', error)
        }
      }
      
      if (addresses.length > 0) {
        const scoredAddresses = addresses.map(addr => ({
          address: addr,
          score: addr.split(',').length + (addr.match(/park|nagar|chinchwad|pimpri/i) ? 10 : 0)
        }))
        
        scoredAddresses.sort((a, b) => b.score - a.score)
        bestAddress = scoredAddresses[0].address
      }
      
      if (bestAddress) {
        setLocationName(bestAddress)
        return bestAddress
      }
      
      const formattedCoords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      setLocationName(formattedCoords)
      return formattedCoords
    } catch (error) {
      console.error('Reverse geocoding error:', error)
      const fallback = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      setLocationName(fallback)
      return fallback
    } finally {
      setFetchingLocation(false)
    }
  }

  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser')
      return
    }

    setLocationError('')
    setFetchingLocation(true)
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude
          const lng = position.coords.longitude
          
          setFormData((prev) => ({
            ...prev,
            locationLat: lat.toString(),
            locationLng: lng.toString(),
            siteLocation: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          }))
          
          setLocationAccess(true)
          
          const address = await reverseGeocode(lat, lng)
          
          if (address && address !== `${lat.toFixed(6)}, ${lng.toFixed(6)}`) {
            setFormData((prev) => ({
              ...prev,
              siteLocation: address,
            }))
          }
        } catch (error) {
          console.error('Error processing location:', error)
          setLocationError('Location captured but address lookup failed. Coordinates saved.')
        }
      },
      (error) => {
        setLocationAccess(false)
        setFetchingLocation(false)
        let errorMessage = 'Location access denied or unavailable. Please enable location services.'
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please allow location access in your browser settings.'
            break
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable. Please check your device settings.'
            break
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.'
            break
        }
        
        setLocationError(errorMessage)
        setFormData((prev) => ({ ...prev, siteLocation: '', locationLat: '', locationLng: '' }))
        setLocationName('')
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
  }

  const handleChange = async (event) => {
    const { name, value, type, files } = event.target

    // Mark form as dirty
    setIsDirty(true)

    if (type === 'file') {
      setFormData((prev) => ({ ...prev, [name]: files[0] || null }))
      return
    }

    if (name === 'leaveType') {
      setFormData((prev) => ({ ...prev, [name]: value }))
      
      // Find selected leave type details
      const typeDetails = leaveTypes.find(lt => lt.id === value)
      setSelectedLeaveType(typeDetails)
      
      // Reset availability check
      setLeaveAvailability(null)
      
      return
    }

    // Handle country code changes
    if (name === 'customerCountryCode' || name === 'endCustomerCountryCode') {
      setFormData((prev) => ({ ...prev, [name]: value }))
      return
    }

    // Handle contact number changes with validation
    if (name === 'customerContact' || name === 'endCustomerContact') {
      const digits = (value ?? '').toString().replace(/\D/g, '')
      
      // Validate based on country code
      const countryCode = name === 'customerContact' 
        ? formData.customerCountryCode 
        : formData.endCustomerCountryCode
      
      let maxDigits = 10 // Default for most countries
      
      // Adjust max digits based on country code
      switch (countryCode) {
        case '+91': // India
          maxDigits = 10
          break
        case '+1': // USA/Canada
          maxDigits = 10
          break
        case '+44': // UK
          maxDigits = 10
          break
        case '+971': // UAE
          maxDigits = 9
          break
        case '+966': // Saudi Arabia
          maxDigits = 9
          break
        case '+7': // Russia
          maxDigits = 10
          break
        case '+86': // China
          maxDigits = 11
          break
        case '+81': // Japan
          maxDigits = 10
          break
        default:
          maxDigits = 15 // Generic max for international numbers
      }
      
      const trimmedDigits = digits.substring(0, maxDigits)
      setFormData((prev) => ({ ...prev, [name]: trimmedDigits }))
      return
    }

    if (name === 'onlineSupportRequired') {
      const v = value
      setFormData((prev) => ({
        ...prev,
        onlineSupportRequired: v,
        supportEngineerName: v === 'Yes' ? prev.supportEngineerName : '',
      }))
      return
    }

    if (name === 'reportDate') {
      // Check if report already exists for this date
      if (value) {
        const existingReport = await checkExistingReport(value, isEditMode ? submittedData?.id : null)
        
        if (existingReport) {
          const reportType = existingReport.locationType === 'leave' 
            ? `leave (${existingReport.leaveType || 'leave'})` 
            : `${existingReport.locationType} report`
          
          setAlert({ 
            type: 'error', 
            message: `You already have a ${reportType} for ${value}. Please edit the existing report instead.` 
          })
        } else if (alert?.type === 'error' && alert.message.includes('already have a')) {
          // Clear the error alert if date changed
          setAlert(null)
        }
      }
      
      // Validate leave date when location type is leave and report date changes
      if (formData.locationType === 'leave' && value) {
        const validation = await validateLeaveDate(value)
        if (!validation.valid) {
          setAlert({ type: 'error', message: validation.message })
          return
        }
        
        // Reset availability check when date changes
        setLeaveAvailability(null)
      }
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // Auto-save functions
  const performAutoSave = () => {
    if (!user?.id || !isDirty) return

    try {
      const saveData = {
        ...formData,
        date: formData.reportDate,
        timestamp: new Date().toISOString(),
        userId: user.id
      }

      localStorage.setItem(`daily-report-auto-save-${user.id}`, JSON.stringify(saveData))
      setSavedData(saveData)
      setLastSaved(new Date().toISOString())
      setIsDirty(false)
      
      // Show auto-save notification
      setAlert({
        type: 'info',
        message: 'Progress auto-saved',
        autoClear: true
      })
      
      // Auto-clear notification after 3 seconds
      setTimeout(() => {
        setAlert(null)
      }, 3000)

    } catch (error) {
      console.error('Auto-save failed:', error)
    }
  }

  const handleManualSave = () => {
    performAutoSave()
    setAlert({
      type: 'success',
      message: 'Progress saved successfully'
    })
  }

  const loadAutoSavedData = () => {
    if (savedData) {
      setFormData(prev => ({
        ...prev,
        customerName: savedData.customerName || prev.customerName,
        customerPerson: savedData.customerPerson || prev.customerPerson,
        customerContact: savedData.customerContact || prev.customerContact,
        customerCountryCode: savedData.customerCountryCode || prev.customerCountryCode,
        endCustomerName: savedData.endCustomerName || prev.endCustomerName,
        endCustomerPerson: savedData.endCustomerPerson || prev.endCustomerPerson,
        endCustomerContact: savedData.endCustomerContact || prev.endCustomerContact,
        endCustomerCountryCode: savedData.endCustomerCountryCode || prev.endCustomerCountryCode,
        projectNo: savedData.projectNo || prev.projectNo,
        locationType: savedData.locationType || prev.locationType,
        leaveType: savedData.leaveType || prev.leaveType,
        siteLocation: savedData.siteLocation || prev.siteLocation,
        dailyTargetPlanned: savedData.dailyTargetPlanned || prev.dailyTargetPlanned,
        dailyTargetAchieved: savedData.dailyTargetAchieved || prev.dailyTargetAchieved,
        additionalActivity: savedData.additionalActivity || prev.additionalActivity,
        whoAddedActivity: savedData.whoAddedActivity || prev.whoAddedActivity,
        dailyPendingTarget: savedData.dailyPendingTarget || prev.dailyPendingTarget,
        reasonPendingTarget: savedData.reasonPendingTarget || prev.reasonPendingTarget,
        problemFaced: savedData.problemFaced || prev.problemFaced,
        problemResolved: savedData.problemResolved || prev.problemResolved,
        onlineSupportRequired: savedData.onlineSupportRequired || prev.onlineSupportRequired,
        supportEngineerName: savedData.supportEngineerName || prev.supportEngineerName,
        siteStartDate: savedData.siteStartDate || prev.siteStartDate,
        siteEndDate: savedData.siteEndDate || prev.siteEndDate,
        incharge: savedData.incharge || prev.incharge,
        remark: savedData.remark || prev.remark
      }))
      setIsDirty(false)
      setAlert({
        type: 'info',
        message: 'Auto-saved data loaded'
      })
    }
  }

  const clearAutoSavedData = () => {
    if (user?.id) {
      localStorage.removeItem(`daily-report-auto-save-${user.id}`)
      setSavedData(null)
      setLastSaved(null)
      setIsDirty(false)
      setAlert({
        type: 'info',
        message: 'Auto-saved data cleared'
      })
    }
  }

  const handleInTimeAuto = () => {
    const inTime = getIndianTime()
    setFormData((prev) => ({ ...prev, inTime }))
    setIsDirty(true)
  }

  const handleOutTimeAuto = () => {
    const outTime = getIndianTime()
    setFormData((prev) => ({ ...prev, outTime }))
    setIsDirty(true)
  }

  // Check leave availability
  const checkLeaveAvailability = async () => {
    if (!formData.leaveType || !formData.reportDate) {
      setAlert({ type: 'error', message: 'Please select leave type and date first' })
      return
    }
    
    setCheckingAvailability(true)
    try {
      const response = await fetch(
        `${endpoint}/check-leave-availability?leaveType=${formData.leaveType}&startDate=${formData.reportDate}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        setLeaveAvailability(data)
        
        if (!data.available) {
          setAlert({ type: 'warning', message: data.message })
        } else {
          setAlert({ 
            type: 'success', 
            message: `${data.message}. ${data.requiresApproval ? 'Requires approval.' : 'No approval required.'}` 
          })
        }
      }
    } catch (error) {
      console.error('Error checking leave availability:', error)
      setAlert({ type: 'error', message: 'Failed to check leave availability' })
    } finally {
      setCheckingAvailability(false)
    }
  }

  // Format phone number for display
  const formatPhoneNumber = (countryCode, phoneNumber) => {
    if (!phoneNumber) return ''
    return `${countryCode} ${phoneNumber}`
  }

  // Validate phone number based on country code
  const validatePhoneNumber = (countryCode, phoneNumber) => {
    if (!phoneNumber || phoneNumber.trim() === '') {
      return 'Phone number is required'
    }
    
    const digits = phoneNumber.replace(/\D/g, '')
    
    // Set min and max lengths based on country code
    let minLength, maxLength
    
    switch (countryCode) {
      case '+91': // India
        minLength = 10
        maxLength = 10
        break
      case '+1': // USA/Canada
        minLength = 10
        maxLength = 10
        break
      case '+44': // UK
        minLength = 10
        maxLength = 11
        break
      case '+971': // UAE
        minLength = 9
        maxLength = 9
        break
      case '+966': // Saudi Arabia
        minLength = 9
        maxLength = 9
        break
      case '+7': // Russia
        minLength = 10
        maxLength = 11
        break
      case '+86': // China
        minLength = 11
        maxLength = 11
        break
      case '+81': // Japan
        minLength = 10
        maxLength = 11
        break
      default:
        minLength = 5
        maxLength = 15
    }
    
    if (digits.length < minLength) {
      return `Phone number must be at least ${minLength} digits for ${countryCode}`
    }
    
    if (digits.length > maxLength) {
      return `Phone number cannot exceed ${maxLength} digits for ${countryCode}`
    }
    
    // Additional validation for specific countries
    if (countryCode === '+91' && !/^[6-9]/.test(digits)) {
      return 'Indian mobile numbers must start with 6, 7, 8, or 9'
    }
    
    if (countryCode === '+1' && !/^[2-9]/.test(digits.substring(0, 3))) {
      return 'US/Canada area code must start with 2-9'
    }
    
    return null // No error
  }

  const handleSubmit = async () => {
    console.log('=== FORM SUBMISSION STARTED ===')
    console.log('Location type:', formData.locationType)
    console.log('Leave type:', formData.leaveType)
    console.log('Form data:', formData)

    setSubmitting(true)
    setAlert(null)

    // Validate contact numbers based on country codes
    if (formData.locationType !== 'leave') {
      const customerPhoneError = validatePhoneNumber(formData.customerCountryCode, formData.customerContact)
      const endCustomerPhoneError = validatePhoneNumber(formData.endCustomerCountryCode, formData.endCustomerContact)
      
      if (customerPhoneError) {
        setAlert({ type: 'error', message: `Customer Contact: ${customerPhoneError}` })
        setSubmitting(false)
        return
      }
      
      if (endCustomerPhoneError) {
        setAlert({ type: 'error', message: `End Customer Contact: ${endCustomerPhoneError}` })
        setSubmitting(false)
        return
      }
    }

    // IMPORTANT: Validate locationType for leave applications
    if (formData.leaveType && formData.locationType !== 'leave') {
      console.log('⚠️ WARNING: leaveType is set but locationType is not "leave". Setting locationType to "leave"')
      formData.locationType = 'leave'
    }

    // Check if report already exists for this date (for all location types)
    const existingReport = await checkExistingReport(formData.reportDate, isEditMode ? submittedData?.id : null)
    
    if (existingReport && (!isEditMode || (isEditMode && existingReport.id !== submittedData?.id))) {
      const reportType = existingReport.locationType === 'leave' 
        ? `leave (${existingReport.leaveType || 'leave'})` 
        : `${existingReport.locationType} report`
      
      setAlert({ 
        type: 'error', 
        message: `You already have a ${reportType} for ${formData.reportDate}. Please edit the existing report instead.` 
      })
      setSubmitting(false)
      return
    }

    // Check leave balance when applying for leave
    if (formData.locationType === 'leave') {
      if (!formData.leaveType) {
        setAlert({ type: 'error', message: 'Please select a leave type' })
        setSubmitting(false)
        return
      }
      
      const selectedType = leaveTypes.find(lt => lt.id === formData.leaveType)
      if (!selectedType?.available) {
        setAlert({ type: 'error', message: selectedType?.reason || 'This leave type is not available for you' })
        setSubmitting(false)
        return
      }

      // Validate leave date
      const validation = await validateLeaveDate(formData.reportDate)
      if (!validation.valid) {
        setAlert({ type: 'error', message: validation.message })
        setSubmitting(false)
        return
      }

      // Check if availability was checked and is available
      if (!leaveAvailability?.available && leaveAvailability !== null) {
        setAlert({ type: 'error', message: 'Please check leave availability first or select different dates' })
        setSubmitting(false)
        return
      }
    }

    // Validate PDF upload for site location
    if (formData.locationType === 'site' && !locationAccess && !(isEditMode && formData.locationLat && formData.locationLng)) {
      setAlert({ type: 'error', message: 'Please allow location access to upload MOM report' })
      setSubmitting(false)
      return
    }

    try {
      // Clear auto-saved data before submission
      if (user?.id) {
        localStorage.removeItem(`daily-report-auto-save-${user.id}`)
        setIsDirty(false)
      }

      const formDataToSend = new FormData()

      // Prepare data with proper leave handling
      const dataToSubmit = {
        ...formData,
        problemFaced: formData.locationType === 'leave' 
          ? (formData.problemFaced || `Leave Application: ${leaveTypes.find(lt => lt.id === formData.leaveType)?.name || formData.leaveType}`) 
          : formData.problemFaced
      }

      // For leave, set proper leave-related fields and clear work fields
      if (formData.locationType === 'leave') {
        // Clear time fields for leave
        dataToSubmit.inTime = ''
        dataToSubmit.outTime = ''
        
        // Set leave-specific defaults
        dataToSubmit.siteLocation = 'Leave'
        dataToSubmit.problemFaced = dataToSubmit.problemFaced || `Leave Application: ${leaveTypes.find(lt => lt.id === formData.leaveType)?.name || formData.leaveType}`
        dataToSubmit.remark = dataToSubmit.remark || `${leaveTypes.find(lt => lt.id === formData.leaveType)?.name || formData.leaveType} Leave Application`
        
        // Clear work-related fields that should be empty for leave
        dataToSubmit.customerName = ''
        dataToSubmit.customerPerson = ''
        dataToSubmit.customerContact = ''
        dataToSubmit.customerCountryCode = '+91'
        dataToSubmit.endCustomerName = ''
        dataToSubmit.endCustomerPerson = ''
        dataToSubmit.endCustomerContact = ''
        dataToSubmit.endCustomerCountryCode = '+91'
        dataToSubmit.projectNo = ''
        dataToSubmit.dailyTargetPlanned = ''
        dataToSubmit.dailyTargetAchieved = ''
        dataToSubmit.additionalActivity = ''
        dataToSubmit.whoAddedActivity = ''
        dataToSubmit.dailyPendingTarget = ''
        dataToSubmit.reasonPendingTarget = ''
        dataToSubmit.problemResolved = ''
        dataToSubmit.onlineSupportRequired = ''
        dataToSubmit.supportEngineerName = ''
        dataToSubmit.siteStartDate = ''
        dataToSubmit.siteEndDate = ''
        dataToSubmit.incharge = ''
      }

      // Debug: Log what we're sending
      console.log('🔍 Sending data with locationType:', formData.locationType)
      console.log('🔍 Leave type:', formData.leaveType)
      console.log('🔍 Customer contact:', formatPhoneNumber(dataToSubmit.customerCountryCode, dataToSubmit.customerContact))
      console.log('🔍 End customer contact:', formatPhoneNumber(dataToSubmit.endCustomerCountryCode, dataToSubmit.endCustomerContact))

      // Append all fields to FormData
      Object.keys(dataToSubmit).forEach((key) => {
        if (key === 'momReport' && dataToSubmit.momReport) {
          console.log(`📎 Appending file: ${key} = ${dataToSubmit.momReport.name}`)
          formDataToSend.append('momReport', dataToSubmit.momReport)
        } else if (key !== 'momReport') {
          console.log(`📝 Appending field: ${key} = ${dataToSubmit[key] || '(empty)'}`)
          formDataToSend.append(key, dataToSubmit[key] || '')
        }
      })

      const updateEndpoint = isEditMode ? `${endpoint}/${submittedData.id}` : endpoint
      console.log('📤 Sending to:', updateEndpoint)
      console.log('📤 Method:', isEditMode ? 'PUT' : 'POST')
      console.log('📤 Token available:', !!token)
      
      const headers = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
        console.log('📤 Authorization header set')
      }

      const response = await fetch(updateEndpoint, {
        method: isEditMode ? 'PUT' : 'POST',
        headers: headers,
        body: formDataToSend,
      })

      console.log('📥 Response status:', response.status)
      console.log('📥 Response status text:', response.statusText)
      
      // Get the raw response text first
      const responseText = await response.text()
      console.log('📥 Raw response length:', responseText.length)
      
      let responseData
      let errorMessage = 'Unable to save daily target report'
      
      try {
        // Try to parse as JSON
        if (responseText.trim()) {
          responseData = JSON.parse(responseText)
          console.log('📥 Parsed response data:', responseData)
        } else {
          console.log('📥 Response is empty')
          responseData = {}
        }
      } catch (parseError) {
        console.error('❌ Failed to parse response as JSON:', parseError)
        
        // If it's not JSON, it might be HTML error page or plain text
        if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
          errorMessage = 'Server returned HTML error page. Check if backend is running correctly.'
        } else if (responseText.includes('Cannot POST') || responseText.includes('Cannot PUT')) {
          errorMessage = `Endpoint not found: ${updateEndpoint}`
        } else if (responseText) {
          errorMessage = `Server error: ${responseText.substring(0, 200)}`
        }
        
        throw new Error(errorMessage)
      }

      if (!response.ok) {
        console.error('❌ Server returned error response:', {
          status: response.status,
          statusText: response.statusText,
          data: responseData
        })
        
        // Handle different error status codes
        if (response.status === 401) {
          errorMessage = 'Authentication failed. Please log in again.'
        } else if (response.status === 403) {
          errorMessage = 'You do not have permission to perform this action.'
        } else if (response.status === 404) {
          errorMessage = 'Endpoint not found. Check if the backend server is running.'
        } else if (response.status === 409) {
          errorMessage = responseData.message || 'A report already exists for this date.'
        } else if (response.status === 422) {
          errorMessage = responseData.message || 'Invalid data submitted.'
        } else if (response.status === 500) {
          errorMessage = responseData.message || 'Server internal error. Please try again later.'
          
          // Add more details if available
          if (responseData.error) {
            errorMessage += ` (${responseData.error})`
          }
        }
        
        throw new Error(errorMessage)
      }

      console.log('✅ Success! Response:', responseData)

      // Store submitted data
      const submittedFormData = {
        ...dataToSubmit,
        id: isEditMode ? submittedData.id : responseData.id,
        submittedAt: isEditMode ? submittedData.submittedAt : new Date().toISOString(),
        momReportName: dataToSubmit.momReport ? dataToSubmit.momReport.name : (isEditMode ? submittedData.momReportName : null),
        locationName: locationName || dataToSubmit.siteLocation || '',
      }
      setSubmittedData(submittedFormData)
      setIsEditMode(false)
      
      setAlert({ 
        type: 'success', 
        message: isEditMode ? 'Report updated successfully!' : 
          formData.locationType === 'leave' ? 'Leave application submitted successfully!' : 
          'Daily target report saved successfully! You can now view and edit it below.' 
      })
      
      // Reset form
      const newFormData = defaultPayload()
      setFormData(newFormData)
      setLocationAccess(false)
      setLocationError('')
      setSelectedLeaveType(null)
      setLeaveAvailability(null)
      setSavedData(null)
      setLastSaved(null)

      // Reset file input
      setTimeout(() => {
        const fileInput = document.querySelector('input[name="momReport"]')
        if (fileInput) {
          fileInput.value = ''
        }
      }, 100)
      
    } catch (error) {
      console.error('❌ Error in handleSubmit:', error)
      console.error('❌ Error name:', error.name)
      console.error('❌ Error message:', error.message)
      
      let errorMessage = error.message || 'Unable to save daily target report'
      
      // Handle specific error types
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = 'Network error. Please check if the backend server is running at http://localhost:5000'
      } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
        errorMessage = 'Cannot connect to server. Please check: 1) Backend is running, 2) No CORS issues, 3) Network connection'
      } else if (error.message.includes('JSON')) {
        errorMessage = 'Server returned an invalid response. The backend might have crashed.'
      } else if (error.message.includes('Unexpected token')) {
        errorMessage = 'Server error. Please check backend console for syntax errors.'
      }
      
      setAlert({ 
        type: 'error', 
        message: errorMessage 
      })
    } finally {
      setSubmitting(false)
    }
  }

  const canUploadPDF = formData.locationType === 'site' && locationAccess

  return (
    <section className="vh-form-shell">
      <header className="vh-form-header">
        <div>
          <p className="vh-form-label">Daily Target Report</p>
          <h2>Record your daily targets</h2>
          <p>
            Track your in/out times, customer information, site activities, and daily targets.
            <br /><strong>Note:</strong> Only one report allowed per day (including leave).
          </p>
          
          {/* Leave Balance Display */}
          {user && !loadingLeaveBalance && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '0.75rem', 
              background: '#f8f9fa', 
              borderRadius: '8px',
              border: '1px solid #dee2e6'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem'
              }}>
                <div>
                  <strong>Annual Leave Balance</strong>
                  <div style={{ fontSize: '0.9rem', color: '#6c757d', marginTop: '0.25rem' }}>
                    Financial Year: {new Date().getFullYear()}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#198754' }}>
                    {leaveBalance.remaining} / {leaveBalance.total}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#6c757d' }}>
                    Used: {leaveBalance.used} leaves
                  </div>
                </div>
              </div>
              <div style={{ 
                height: '8px', 
                background: '#e9ecef', 
                borderRadius: '4px',
                marginTop: '0.5rem',
                overflow: 'hidden'
              }}>
                <div style={{ 
                  width: `${(leaveBalance.used / leaveBalance.total) * 100}%`,
                  height: '100%',
                  background: leaveBalance.remaining > 12 ? '#28a745' : 
                            leaveBalance.remaining > 6 ? '#ffc107' : '#dc3545',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Auto-save status bar */}
      <div style={{ 
        marginBottom: '1rem',
        padding: '0.75rem',
        background: '#f0f9ff',
        borderRadius: '8px',
        border: '1px solid #2ad1ff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="autoSaveToggle"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              style={{ margin: 0 }}
            />
            <label htmlFor="autoSaveToggle" style={{ margin: 0, fontSize: '0.9rem' }}>
              Auto-save progress
            </label>
          </div>
          
          {lastSaved && (
            <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
              Last saved: {new Date(lastSaved).toLocaleTimeString()}
            </div>
          )}
          
          {isDirty && (
            <div style={{ 
              background: '#ffc107',
              color: '#856404',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.8rem'
            }}>
              Unsaved changes
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {savedData && (
            <button
              type="button"
              onClick={loadAutoSavedData}
              style={{
                padding: '0.5rem 1rem',
                background: '#06c167',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Load Auto-saved
            </button>
          )}
          
          <button
            type="button"
            onClick={handleManualSave}
            disabled={!isDirty}
            style={{
              padding: '0.5rem 1rem',
              background: isDirty ? '#2ad1ff' : '#f5f5f5',
              color: isDirty ? 'white' : '#6c757d',
              border: 'none',
              borderRadius: '6px',
              cursor: isDirty ? 'pointer' : 'not-allowed',
              fontSize: '0.85rem'
            }}
          >
            Save Progress
          </button>
          
          {savedData && (
            <button
              type="button"
              onClick={clearAutoSavedData}
              style={{
                padding: '0.5rem 1rem',
                background: '#f5f5f5',
                color: '#092544',
                border: '1px solid #d5e0f2',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Clear Auto-saved
            </button>
          )}
        </div>
      </div>

      {alert && (
        <div className={`vh-alert ${alert.type}`}>
          <p>{alert.message}</p>
        </div>
      )}

      {submittedData && !isEditMode && (
        <div style={{ 
          background: '#f0f9ff', 
          border: '1px solid #2ad1ff', 
          borderRadius: '16px', 
          padding: '1.5rem', 
          marginBottom: '1.5rem',
          maxHeight: '80vh',
          overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', position: 'sticky', top: 0, background: '#f0f9ff', zIndex: 1, paddingBottom: '0.5rem', borderBottom: '1px solid #2ad1ff' }}>
            <h3 style={{ margin: 0, color: '#092544' }}>Submitted Report #{submittedData.id}</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  const editData = { ...submittedData }
                  delete editData.momReportName
                  delete editData.id
                  delete editData.submittedAt
                  delete editData.locationName
                  
                  if (!editData.reportDate) {
                    editData.reportDate = new Date().toISOString().slice(0, 10)
                  }
                  setFormData(editData)
                  setIsEditMode(true)
                  if (editData.locationType === 'site' && editData.locationLat && editData.locationLng) {
                    setLocationAccess(true)
                    setLocationError('')
                    const restoredLocationName = submittedData.locationName || editData.siteLocation || ''
                    setLocationName(restoredLocationName)
                    if (editData.locationLat && editData.locationLng && !restoredLocationName.includes('Location:')) {
                      const lat = parseFloat(editData.locationLat)
                      const lng = parseFloat(editData.locationLng)
                      if (!isNaN(lat) && !isNaN(lng)) {
                        reverseGeocode(lat, lng).then((address) => {
                          if (address && address !== `${lat.toFixed(6)}, ${lng.toFixed(6)}`) {
                            setFormData((prev) => ({
                              ...prev,
                              siteLocation: address,
                            }))
                          }
                        })
                      }
                    }
                  }
                  if (editData.locationType === 'leave' && editData.leaveType) {
                    const typeDetails = leaveTypes.find(lt => lt.id === editData.leaveType)
                    setSelectedLeaveType(typeDetails)
                  }
                }}
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
              <button
                type="button"
                onClick={() => {
                  setSubmittedData(null)
                  setIsEditMode(false)
                }}
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
                Close
              </button>
            </div>
          </div>
          
          {/* Submitted data display */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
            <div>
              <strong>Report Date:</strong> {submittedData.reportDate}
            </div>
            <div>
              <strong>Location Type:</strong> {submittedData.locationType}
            </div>
            {submittedData.locationType === 'leave' && (
              <div>
                <strong>Leave Type:</strong> {leaveTypes.find(lt => lt.id === submittedData.leaveType)?.name || submittedData.leaveType}
              </div>
            )}
            {submittedData.inTime && (
              <div>
                <strong>In Time:</strong> {submittedData.inTime}
              </div>
            )}
            {submittedData.outTime && (
              <div>
                <strong>Out Time:</strong> {submittedData.outTime}
            </div>
            )}
            {submittedData.customerName && submittedData.customerName !== 'N/A' && (
              <div>
                <strong>Customer:</strong> {submittedData.customerName}
              </div>
            )}
            {submittedData.customerContact && (
              <div>
                <strong>Customer Contact:</strong> {formatPhoneNumber(submittedData.customerCountryCode || '+91', submittedData.customerContact)}
              </div>
            )}
            {submittedData.submittedAt && (
              <div>
                <strong>Submitted At:</strong> {new Date(submittedData.submittedAt).toLocaleString()}
              </div>
            )}
          </div>
          {submittedData.remark && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #2ad1ff' }}>
              <strong>Remark:</strong> {submittedData.remark}
            </div>
          )}
        </div>
      )}

      <div className="vh-form">
        <div className="vh-grid">
          <label>
            <span>Report Date *</span>
            <input
              type="date"
              name="reportDate"
              value={formData.reportDate}
              onChange={handleChange}
            />
            <small style={{ color: '#666', display: 'block', marginTop: '0.25rem' }}>
              {formData.locationType === 'leave' ? 
                'Leave date (cannot be on weekends)' : 
                'Date for this daily target report (only one report allowed per day)'}
            </small>
          </label>

          <label className="vh-span-2">
            <span>Site / Office / Leave</span>
            <select
              name="locationType"
              value={formData.locationType}
              onChange={handleChange}
            >
              <option value="">Select location type</option>
              <option value="site">Site </option>
              <option value="office">Office</option>
              <option value="leave">Leave</option>
            </select>
            {formData.locationType === 'leave' && (
              <small style={{ color: '#dc3545', display: 'block', marginTop: '0.25rem' }}>
                ⚠️ Applying for leave will deduct from your leave balance
              </small>
            )}
          </label>

          {formData.locationType !== 'leave' && (
            <>
              <label>
                <span>In Time</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="time"
                    name="inTime"
                    value={formData.inTime}
                    onChange={handleChange}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleInTimeAuto}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#2ad1ff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    Auto
                  </button>
                </div>
              </label>

              <label>
                <span>Out Time</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="time"
                    name="outTime"
                    value={formData.outTime}
                    onChange={handleChange}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleOutTimeAuto}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#2ad1ff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    Auto
                  </button>
                </div>
              </label>

              {/* Customer Information */}
              <label className="vh-span-2">
                <span>Customer Name *</span>
                <input
                  type="text"
                  name="customerName"
                  value={formData.customerName}
                  onChange={handleChange}
                  placeholder="Enter customer name"
                  required={formData.locationType !== 'leave'}
                />
              </label>

              <label>
                <span>Customer Person *</span>
                <input
                  type="text"
                  name="customerPerson"
                  value={formData.customerPerson}
                  onChange={handleChange}
                  placeholder="Contact person"
                  required={formData.locationType !== 'leave'}
                />
              </label>

              <label style={{ gridColumn: 'span 2' }}>
                <span>Customer Contact *</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    name="customerCountryCode"
                    value={formData.customerCountryCode}
                    onChange={handleChange}
                    style={{ 
                      width: '120px',
                      padding: '0.75rem',
                      border: '1px solid #d5e0f2',
                      borderRadius: '8px',
                      background: 'white'
                    }}
                    required={formData.locationType !== 'leave'}
                  >
                    {countryCodes.map(country => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {country.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    name="customerContact"
                    value={formData.customerContact}
                    onChange={handleChange}
                    placeholder="Enter phone number"
                    style={{ flex: 1 }}
                    required={formData.locationType !== 'leave'}
                  />
                </div>
                <small style={{ color: '#6c757d', display: 'block', marginTop: '0.25rem' }}>
                  Current: {formatPhoneNumber(formData.customerCountryCode, formData.customerContact)}
                </small>
              </label>

              <label className="vh-span-2">
                <span>End Customer Name *</span>
                <input
                  type="text"
                  name="endCustomerName"
                  value={formData.endCustomerName}
                  onChange={handleChange}
                  placeholder="Enter end customer name"
                  required={formData.locationType !== 'leave'}
                />
              </label>

              <label>
                <span>End Customer Person *</span>
                <input
                  type="text"
                  name="endCustomerPerson"
                  value={formData.endCustomerPerson}
                  onChange={handleChange}
                  placeholder="Contact person"
                  required={formData.locationType !== 'leave'}
                />
              </label>

              <label style={{ gridColumn: 'span 2' }}>
                <span>End Customer Contact *</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    name="endCustomerCountryCode"
                    value={formData.endCustomerCountryCode}
                    onChange={handleChange}
                    style={{ 
                      width: '120px',
                      padding: '0.75rem',
                      border: '1px solid #d5e0f2',
                      borderRadius: '8px',
                      background: 'white'
                    }}
                    required={formData.locationType !== 'leave'}
                  >
                    {countryCodes.map(country => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {country.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    name="endCustomerContact"
                    value={formData.endCustomerContact}
                    onChange={handleChange}
                    placeholder="Enter phone number"
                    style={{ flex: 1 }}
                    required={formData.locationType !== 'leave'}
                  />
                </div>
                <small style={{ color: '#6c757d', display: 'block', marginTop: '0.25rem' }}>
                  Current: {formatPhoneNumber(formData.endCustomerCountryCode, formData.endCustomerContact)}
                </small>
              </label>

              <label className="vh-span-2">
                <span>Project Number *</span>
                <input
                  type="text"
                  name="projectNo"
                  value={formData.projectNo}
                  onChange={handleChange}
                  placeholder="Enter project number"
                  required={formData.locationType !== 'leave'}
                />
              </label>

              <label className="vh-span-2">
                <span>Daily Target Planned *</span>
                <textarea
                  name="dailyTargetPlanned"
                  value={formData.dailyTargetPlanned}
                  onChange={handleChange}
                  placeholder="Describe planned daily targets"
                  rows="3"
                  required={formData.locationType !== 'leave'}
                />
              </label>

              <label className="vh-span-2">
                <span>Daily Target Achieved *</span>
                <textarea
                  name="dailyTargetAchieved"
                  value={formData.dailyTargetAchieved}
                  onChange={handleChange}
                  placeholder="Describe achieved daily targets"
                  rows="3"
                  required={formData.locationType !== 'leave'}
                />
              </label>

              <label>
                <span>Incharge *</span>
                <input
                  type="text"
                  name="incharge"
                  value={formData.incharge}
                  onChange={handleChange}
                  placeholder="Supervisor/manager name"
                  required={formData.locationType !== 'leave'}
                />
              </label>

              <label>
                <span>Site Start Date</span>
                <input
                  type="date"
                  name="siteStartDate"
                  value={formData.siteStartDate}
                  onChange={handleChange}
                  required={formData.locationType === 'site'}
                />
              </label>
            </>
          )}

          {formData.locationType === 'site' && (
            <>
              <label className="vh-span-2">
                <span>Site Location (Auto-detected)</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    name="siteLocation"
                    value={formData.siteLocation}
                    onChange={handleChange}
                    placeholder="Location will be automatically detected..."
                    style={{ flex: 1, background: locationAccess ? '#f0f9ff' : '#f5f5f5' }}
                    readOnly={locationAccess && !isEditMode}
                  />
                  <button
                    type="button"
                    onClick={getCurrentLocation}
                    disabled={fetchingLocation || locationAccess}
                    style={{
                      padding: '0.5rem 1rem',
                      background: locationAccess ? '#06c167' : fetchingLocation ? '#8892aa' : '#2ad1ff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: (fetchingLocation || locationAccess) ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                      opacity: (fetchingLocation || locationAccess) ? 0.7 : 1,
                      whiteSpace: 'nowrap',
                    }}
                    title="Get GPS coordinates and automatically fetch address"
                  >
                    {fetchingLocation ? '⏳ Detecting...' : locationAccess ? '✓ Location Set' : 'Get Location'}
                  </button>
                </div>
                {locationError && (
                  <small style={{ color: '#dc3545', display: 'block', marginTop: '0.25rem' }}>
                    {locationError}
                  </small>
                )}
                {fetchingLocation && !locationError && (
                  <small style={{ color: '#6c757d', display: 'block', marginTop: '0.25rem' }}>
                    Detecting your location...
                  </small>
                )}
                {locationAccess && (
                  <small style={{ color: '#28a745', display: 'block', marginTop: '0.25rem' }}>
                    ✓ Location captured: {locationName || 'Address fetched successfully'}
                  </small>
                )}
              </label>

              {canUploadPDF && (
                <label className="vh-span-2">
                  <span>MOM Report (PDF)</span>
                  <input
                    type="file"
                    name="momReport"
                    accept=".pdf"
                    onChange={handleChange}
                    style={{ padding: '0.5rem' }}
                  />
                </label>
              )}
            </>
          )}

          {/* Leave Type Selection */}
          {formData.locationType === 'leave' && (
            <>
              <label className="vh-span-2">
                <span>Leave Type *</span>
                <select
                  name="leaveType"
                  value={formData.leaveType}
                  onChange={handleChange}
                  required={formData.locationType === 'leave'}
                >
                  <option value="">Select leave type</option>
                  {leaveTypes.map(type => (
                    <option 
                      key={type.id} 
                      value={type.id}
                      disabled={!type.available}
                      title={!type.available ? type.reason : type.description}
                    >
                      {type.name} {type.maxDays > 0 ? `(${type.maxDays} days/year)` : ''}
                      {type.requiresApproval ? ' [Approval]' : ''}
                    </option>
                  ))}
                </select>
              </label>
              
              {selectedLeaveType && (
                <div className="vh-span-2" style={{
                  padding: '1rem',
                  background: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: '8px',
                  marginBottom: '1rem'
                }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong style={{ color: '#856404' }}>{selectedLeaveType.name}</strong>
                    <div style={{ color: '#856404', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                      {selectedLeaveType.description}
                    </div>
                    <div style={{ color: '#856404', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                      <strong>Max Days:</strong> {selectedLeaveType.maxDays > 0 ? `${selectedLeaveType.maxDays} days/year` : 'Unlimited'} | 
                      <strong> Approval:</strong> {selectedLeaveType.requiresApproval ? 'Required' : 'Not Required'}
                    </div>
                    
                    {/* Show balance for selected leave type */}
                    {formData.leaveType && leaveBalanceByType.length > 0 && (
                      <div style={{ color: '#856404', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        <strong>Your Balance:</strong> {leaveBalanceByType
                          .find(b => b.typeId === formData.leaveType)?.remainingDays || 0} days remaining
                      </div>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ color: '#856404' }}>Leave Application</strong>
                      <div style={{ color: '#856404', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        Date: {formData.reportDate || 'Not selected'}
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={checkLeaveAvailability}
                      disabled={!formData.leaveType || !formData.reportDate || checkingAvailability}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        opacity: (!formData.leaveType || !formData.reportDate) ? 0.5 : 1
                      }}
                    >
                      {checkingAvailability ? 'Checking...' : 'Check Availability'}
                    </button>
                  </div>
                  
                  {/* Show availability result */}
                  {leaveAvailability && (
                    <div style={{
                      marginTop: '1rem',
                      padding: '0.75rem',
                      background: leaveAvailability.available ? '#d4edda' : '#f8d7da',
                      border: `1px solid ${leaveAvailability.available ? '#c3e6cb' : '#f5c6cb'}`,
                      borderRadius: '4px'
                    }}>
                      <div style={{ 
                        color: leaveAvailability.available ? '#155724' : '#721c24',
                        fontSize: '0.9rem'
                      }}>
                        <strong>{leaveAvailability.available ? '✓ Available' : '✗ Not Available'}</strong>
                        <div>{leaveAvailability.message}</div>
                        {leaveAvailability.requiresApproval && leaveAvailability.available && (
                          <div style={{ marginTop: '0.25rem', fontStyle: 'italic' }}>
                            Note: This leave type requires manager approval
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Additional fields for all location types */}
          {(formData.locationType === 'office' || formData.locationType === 'site') && (
            <>
              <label className="vh-span-2">
                <span>Additional Activity (if any)</span>
                <textarea
                  name="additionalActivity"
                  value={formData.additionalActivity}
                  onChange={handleChange}
                  placeholder="Describe any additional activities"
                  rows="2"
                />
              </label>

              <label>
                <span>Who Added Activity</span>
                <input
                  type="text"
                  name="whoAddedActivity"
                  value={formData.whoAddedActivity}
                  onChange={handleChange}
                  placeholder="Name of person who added activity"
                />
              </label>

              <label className="vh-span-2">
                <span>Daily Pending Target</span>
                <textarea
                  name="dailyPendingTarget"
                  value={formData.dailyPendingTarget}
                  onChange={handleChange}
                  placeholder="Describe pending targets for next day"
                  rows="2"
                />
              </label>

              <label className="vh-span-2">
                <span>Reason for Pending Target</span>
                <textarea
                  name="reasonPendingTarget"
                  value={formData.reasonPendingTarget}
                  onChange={handleChange}
                  placeholder="Explain why targets are pending"
                  rows="2"
                />
              </label>

              <label className="vh-span-2">
                <span>Problem Faced (if any)</span>
                <textarea
                  name="problemFaced"
                  value={formData.problemFaced}
                  onChange={handleChange}
                  placeholder="Describe any problems faced"
                  rows="2"
                />
              </label>

              <label className="vh-span-2">
                <span>Problem Resolved (if any)</span>
                <textarea
                  name="problemResolved"
                  value={formData.problemResolved}
                  onChange={handleChange}
                  placeholder="Describe how problems were resolved"
                  rows="2"
                />
              </label>

              <label>
                <span>Online Support Required</span>
                <select
                  name="onlineSupportRequired"
                  value={formData.onlineSupportRequired}
                  onChange={handleChange}
                >
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>

              {formData.onlineSupportRequired === 'Yes' && (
                <label>
                  <span>Support Engineer Name</span>
                  <input
                    type="text"
                    name="supportEngineerName"
                    value={formData.supportEngineerName}
                    onChange={handleChange}
                    placeholder="Name of support engineer"
                  />
                </label>
              )}

              <label>
                <span>Site End Date</span>
                <input
                  type="date"
                  name="siteEndDate"
                  value={formData.siteEndDate}
                  onChange={handleChange}
                />
              </label>
            </>
          )}

          {/* Remark field for all location types */}
          <label className="vh-span-2">
            <span>Remark</span>
            <textarea
              name="remark"
              value={formData.remark}
              onChange={handleChange}
              placeholder="Additional remarks or comments"
              rows="2"
            />
            {formData.locationType === 'leave' && (
              <small style={{ color: '#6c757d', display: 'block', marginTop: '0.25rem' }}>
                Optional: Add reason for leave or any additional information
              </small>
            )}
          </label>
        </div>

        <div className="vh-form-actions">
          <button 
            type="button" 
            onClick={handleSubmit} 
            disabled={submitting || checkingExistingReport ||
              (formData.locationType === 'site' && !locationAccess && !(isEditMode && formData.locationLat && formData.locationLng)) || 
              (formData.locationType === 'leave' && (!formData.leaveType || leaveAvailability?.available === false))
            }
          >
            {submitting ? 'Saving…' : checkingExistingReport ? 'Checking...' :
              formData.locationType === 'leave' ? 
                `Apply ${formData.leaveType ? leaveTypes.find(lt => lt.id === formData.leaveType)?.name : 'Leave'}` :
              isEditMode ? 'Update Report' : 'Submit Report'}
          </button>
          
          {isEditMode && (
            <button
              type="button"
              onClick={() => {
                setIsEditMode(false)
                setFormData(defaultPayload())
                setLocationAccess(false)
                setLocationError('')
                setSelectedLeaveType(null)
                setLeaveAvailability(null)
                setIsDirty(false)
              }}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#f5f5f5',
                color: '#092544',
                border: '1px solid #d5e0f2',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '0.95rem',
              }}
            >
              Cancel Edit
            </button>
          )}
          
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const newFormData = defaultPayload()
              setFormData(newFormData)
              setLocationAccess(false)
              setLocationError('')
              setSubmittedData(null)
              setIsEditMode(false)
              setSelectedLeaveType(null)
              setLeaveAvailability(null)
              setIsDirty(false)
              setSavedData(null)
              setLastSaved(null)
              const fileInput = document.querySelector('input[name="momReport"]')
              if (fileInput) {
                fileInput.value = ''
              }
            }}
            disabled={submitting || checkingExistingReport}
          >
            Reset form
          </button>
        </div>
      </div>
    </section>
  )
}

export default DailyTargetForm
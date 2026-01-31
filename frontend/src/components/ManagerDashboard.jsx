import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import './ManagerDashboard.css';

function ManagerDashboard() {
  const { user, token } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [activities, setActivities] = useState([]);
  const [momRecords, setMomRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceSummary, setAttendanceSummary] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedMom, setSelectedMom] = useState(null);
  const [showMomModal, setShowMomModal] = useState(false);
  const [momLoading, setMomLoading] = useState(false);
  const [employeeMomRecords, setEmployeeMomRecords] = useState({});
  const [momStats, setMomStats] = useState({
    totalMoms: 0,
    uniqueCustomersCount: 0,
    uniqueEngineersCount: 0,
    overtimeCount: 0
  });
  const [dailyReports, setDailyReports] = useState([]);
  const [groupedReports, setGroupedReports] = useState({});
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [expandedReports, setExpandedReports] = useState({});
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [editingActivityData, setEditingActivityData] = useState({});

  const BASE_URL = 'http://localhost:5000';

  useEffect(() => {
    if (token && user) {
      fetchDashboardData();
      fetchAllDailyReports();
    }
  }, [token, user, selectedDate]);

  // 🔥 NEW: Listen for hourly report edits from ActivityDisplay
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'hourlyReportEdited' || e.key === 'momCreated') {
        if (e.key === 'hourlyReportEdited') {
          console.log('📢 [ManagerDashboard] Hourly report edited detected, triggering refresh...')
          const updateData = JSON.parse(e.newValue || '{}')
          console.log('   Report Date:', updateData.reportDate)
          console.log('   User ID:', updateData.userId)
          console.log('   Report ID:', updateData.reportId)
        } else if (e.key === 'momCreated') {
          console.log('📢 [ManagerDashboard] MoM created externally, refreshing MoM list...')
          try { const momInfo = JSON.parse(e.newValue || '{}'); console.log('   Mom info:', momInfo) } catch(_) {}
        }

        // Trigger refresh of dashboard data
        fetchDashboardData()

        // Clean up keys we created
        localStorage.removeItem('hourlyReportEdited')
        localStorage.removeItem('momCreated')
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
  
      // FIRST: Fetch all users (this provides the employee mapping)
      await fetchAllUsers();
      
      // THEN: Fetch other data that depends on employee data
      await Promise.all([
        fetchHourlyReports(),
        fetchPendingLeaves(),
        fetchMomRecords(),
        fetchMomStats()
      ]);
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchHourlyReports = async () => {
    try {
      console.log('📊 [HOURLY REPORTS] Fetching all hourly reports for:', selectedDate);
      
      if (!token) {
        console.error('❌ No token available');
        setError('⚠️ Authentication token missing. Please login again.');
        setActivities([]);
        return;
      }
      
      // First try the manager endpoint
      const url = `${BASE_URL}/api/hourly-report/all/${selectedDate}`;
      console.log('📡 Attempting to fetch from:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Hourly reports data received:', data);
        processHourlyReportsData(data);
        return;
      }
      
      // If 403, try individual endpoint
      if (response.status === 403) {
        console.log('🔄 Access denied to manager endpoint (403), trying individual endpoint...');
        const individualUrl = `${BASE_URL}/api/hourly-report/${selectedDate}`;
        const individualResponse = await fetch(individualUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('Individual endpoint status:', individualResponse.status);
        
        if (individualResponse.ok) {
          const individualData = await individualResponse.json();
          console.log('✅ Got individual hourly reports:', individualData);
          
          // Convert to array format
          const activitiesArray = Array.isArray(individualData) ? individualData : [];
          setActivities(activitiesArray);
          if (activitiesArray.length > 0) {
            calculateAttendance(activitiesArray);
          }
          return;
        }
      }

      // Check for 404
      if (response.status === 404) {
        console.log('⚠️ Endpoint not found (404). Creating activities from daily reports...');
        createActivitiesFromDailyReports();
        return;
      }

      // Any other error status
      const errorText = await response.text();
      console.error(`❌ API returned status ${response.status}: ${errorText}`);
      // Do not set error in UI for 500, just fallback
      createActivitiesFromDailyReports();
      
    } catch (error) {
      console.error('❌ Error in fetchHourlyReports:', error);
      console.error('❌ Error details:', error.message, error.stack);
      setError(`⚠️ Network error: ${error.message}. Please check your connection.`);
      
      // Fallback to empty array to prevent further errors
      setActivities([]);
    }
  };

  const processHourlyReportsData = (data) => {
    try {
      console.log('📊 Processing hourly reports data');
      
      let activitiesData = [];
      
      // Handle different response formats
      if (data && data.success && Array.isArray(data.reports)) {
        activitiesData = data.reports;
      } else if (Array.isArray(data)) {
        activitiesData = data;
      } else if (data && data.reports && Array.isArray(data.reports)) {
        activitiesData = data.reports;
      } else {
        console.warn('⚠️ No activities data found in response:', data);
        setActivities([]);
        return;
      }
      
      console.log(`✅ Found ${activitiesData.length} activities`);
      
      // Safely map activities, now with plan/achievement info
      const enhancedActivities = activitiesData.map((activity, index) => {
        try {
          // Safely extract employee name
          let employeeName = 'Unknown';
          if (activity.employeeName) employeeName = activity.employeeName;
          else if (activity.employee_name) employeeName = activity.employee_name;
          else if (activity.username) employeeName = activity.username;
          else if (activity.engg_name) employeeName = activity.engg_name;

          // Safely extract employee ID
          let employeeId = 'N/A';
          if (activity.employeeId) employeeId = activity.employeeId;
          else if (activity.employee_id) employeeId = activity.employee_id;

          // Plan/achievement info from backend
          let planComparison = activity.plan_comparison || null;

          return {
            id: activity.id || activity._id || `temp-${index}-${Date.now()}`,
            user_id: activity.user_id || activity.userId || 'unknown',
            employee_id: employeeId,
            employeeName: employeeName,
            time_period: activity.time_period || activity.report_time || 'N/A',
            project_name: activity.project_name || activity.project || 'N/A',
            hourly_activity: activity.hourly_activity || activity.activity_description || 'No activity',
            problem_faced: activity.problem_faced_by_engineer_hourly || activity.problem_faced || '',
            problem_resolved_or_not: activity.problem_resolved_or_not || activity.problem_resolved || 'no',
            created_at: activity.created_at || new Date().toISOString(),
            plan_comparison: planComparison,
            daily_plan: activity.daily_plan,
            daily_achieved: activity.daily_achieved,
            plan_achievements: activity.plan_achievements || []
          };
        } catch (itemError) {
          console.error('❌ Error processing activity item:', itemError);
          return null;
        }
      }).filter(item => item !== null); // Remove null items

      console.log('✅ Processed activities:', enhancedActivities.length);
      setActivities(enhancedActivities);

      if (enhancedActivities.length > 0) {
        calculateAttendance(enhancedActivities);
      } else {
        // Show a message in the UI if no hourly reports are available
        setError('No hourly reports available for this date.');
      }
    } catch (error) {
      console.error('❌ Error in processHourlyReportsData:', error);
      setActivities([]);
      setError('No hourly reports available for this date.');
    }
  };

  const createActivitiesFromDailyReports = () => {
    try {
      console.log('📊 Creating activities from daily reports...');
      
      if (!dailyReports || !Array.isArray(dailyReports)) {
        console.log('❌ No daily reports available');
        setActivities([]);
        return;
      }
      
      const activitiesFromDailyReports = dailyReports
        .filter(report => report && report.location_type !== 'leave')
        .map(report => ({
          id: report.id || `daily-${report.user_id}`,
          user_id: report.user_id || 'unknown',
          employeeName: report.employee_name || 'Unknown',
          employeeId: report.employee_code || 'N/A',
          time_period: report.in_time && report.out_time ? 
            `${report.in_time} - ${report.out_time}` : 'Full Day',
          project_name: report.project_no || 'Daily Report',
          hourly_activity: report.daily_target_achieved || 'Work completed',
          problem_faced: report.problem_faced || '',
          problem_resolved_or_not: report.problem_resolved === 'yes' ? 'yes' : 'no',
          created_at: report.created_at || new Date().toISOString(),
          isDailyReport: true
        }));
      
      console.log(`✅ Created ${activitiesFromDailyReports.length} activities from daily reports`);
      
      setActivities(activitiesFromDailyReports);
      
      if (activitiesFromDailyReports.length > 0) {
        calculateAttendance(activitiesFromDailyReports);
      }
      
    } catch (error) {
      console.error('❌ Error in createActivitiesFromDailyReports:', error);
      setActivities([]);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/auth/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`Users fetch failed: ${response.status}`);
        setEmployees([]);
        return;
      }

      const data = await response.json();
      let usersData = [];
      
      if (Array.isArray(data)) {
        usersData = data;
      } else if (data.users && Array.isArray(data.users)) {
        usersData = data.users;
      } else if (data.data && Array.isArray(data.data)) {
        usersData = data.data;
      }
      
      console.log('Fetched users:', usersData.length);
      
      // Filter out admin and current user
      const filteredUsers = usersData.filter(u => {
        const userRole = (u.role || '').toLowerCase();
        return userRole !== 'admin' && 
               u.id !== user?.id && 
               u._id !== user?.id &&
               u.userId !== user?.id;
      });
      
      // Normalize user data with multiple ID formats
      const normalizedUsers = filteredUsers.map(user => ({
        id: user.id || user._id || user.userId,
        username: user.username || user.name || user.fullName || 'Unknown',
        employeeId: user.employeeId || user.employee_id || user.emp_id || 'N/A',
        role: user.role || user.designation || 'Employee',
        email: user.email || '',
        phone: user.phone || user.contact || ''
      }));
      
      console.log('Normalized users:', normalizedUsers);
      setEmployees(normalizedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      setEmployees([]);
    }
  };

  const fetchMomRecords = async () => {
    try {
      setMomLoading(true);
      console.log('Fetching MoM records for date:', selectedDate);
      
      const response = await fetch(`${BASE_URL}/api/employee-activity/mom-records?date=${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('MoM response status:', response.status);
      
      if (!response.ok) {
        console.warn(`MoM records fetch failed: ${response.status}`);
        setMomRecords([]);
        setEmployeeMomRecords({});
        return;
      }
      
      const data = await response.json();
      console.log('MoM data received:', data);
      
      if (data.success && Array.isArray(data.moms)) {
        setMomRecords(data.moms);
        
        // Group MoMs by employee for quick access
        const groupedByEmployee = {};
        data.moms.forEach(mom => {
          const employeeId = mom.user_id;
          if (!groupedByEmployee[employeeId]) {
            groupedByEmployee[employeeId] = [];
          }
          groupedByEmployee[employeeId].push(mom);
        });
        setEmployeeMomRecords(groupedByEmployee);
      } else {
        console.warn('MoM data format incorrect:', data);
        setMomRecords([]);
        setEmployeeMomRecords({});
      }
    } catch (error) {
      console.error('Error fetching MoM records:', error);
      setMomRecords([]);
      setEmployeeMomRecords({});
    } finally {
      setMomLoading(false);
    }
  };

  const fetchMomStats = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/employee-activity/mom-stats?startDate=${selectedDate}&endDate=${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.stats) {
          setMomStats(data.stats);
        }
      }
    } catch (error) {
      console.error('Error fetching MoM stats:', error);
    }
  };

  const fetchPendingLeaves = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/daily-target/pending-leaves`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPendingLeaves(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching pending leaves:', error);
      setPendingLeaves([]);
    }
  };

  const fetchAllDailyReports = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}/api/daily-target/all-reports?date=${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDailyReports(data.reports || []);
        
        // Group reports by user for better display
        const groupedByUser = {};
        (data.reports || []).forEach(report => {
          if (!groupedByUser[report.user_id]) {
            groupedByUser[report.user_id] = [];
          }
          groupedByUser[report.user_id].push(report);
        });
        setGroupedReports(groupedByUser);
      }
    } catch (error) {
      console.error('Error fetching daily reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const isEmployeePresent = (userId) => {
    // Check hourly reports
    const hasHourlyReports = attendanceSummary[userId] && attendanceSummary[userId].totalReports > 0;
    
    // Check daily target reports
    const hasDailyReport = dailyReports.some(report => 
      report.user_id === userId || 
      report.employee_code === userId ||
      report.employee_id === userId
    );
    
    // Employee is present if they have either hourly reports OR daily target report
    return hasHourlyReports || hasDailyReport;
  };

  const calculateAttendance = (hourlyReports) => {
    try {
      console.log('📊 Calculating attendance from', hourlyReports.length, 'reports');
      
      if (!hourlyReports || !Array.isArray(hourlyReports)) {
        console.log('❌ No valid reports for attendance calculation');
        setAttendanceSummary({});
        return;
      }
      
      const userReports = {};
      
      hourlyReports.forEach(report => {
        try {
          const userId = report.user_id || report.userId;
          if (!userId) return;
          
          if (!userReports[userId]) {
            userReports[userId] = {
              reports: [],
              totalReports: 0,
              firstReport: null,
              lastReport: null,
              resolvedIssues: 0,
              projects: new Set(),
              totalHours: 0,
              employeeName: report.employeeName || 'Unknown',
              on_time: false
            };
          }
          
          userReports[userId].reports.push(report);
          userReports[userId].totalReports++;

          // Track first and last report timestamps for this user
          try {
            const ts = report.created_at || report.createdAt || report.timestamp || null;
            if (ts) {
              if (!userReports[userId].firstReport || new Date(ts) < new Date(userReports[userId].firstReport)) {
                userReports[userId].firstReport = ts;
              }
              if (!userReports[userId].lastReport || new Date(ts) > new Date(userReports[userId].lastReport)) {
                userReports[userId].lastReport = ts;
              }
            }
          } catch (dtErr) {
            // ignore parse errors
          }
          
          if (report.problem_resolved_or_not === 'yes') {
            userReports[userId].resolvedIssues++;
          }
          
          if (report.project_name) {
            userReports[userId].projects.add(report.project_name);
          }
          
          userReports[userId].totalHours++;
          
        } catch (reportError) {
          console.error('❌ Error processing report for attendance:', reportError);
        }
      });
      
      // Convert Set to Array for projects
      Object.keys(userReports).forEach(userId => {
        try {
          userReports[userId].projects = Array.from(userReports[userId].projects);
        } catch (error) {
          console.error('❌ Error converting projects:', error);
          userReports[userId].projects = [];
        }
        // Determine on_time: if user submitted any reports or has a daily report
        try {
          const hasDaily = Array.isArray(dailyReports) && dailyReports.some(r => r && (r.user_id === userId || r.employee_id === userId || r.employee_code === userId));
          userReports[userId].on_time = (userReports[userId].totalReports && userReports[userId].totalReports > 0) || Boolean(hasDaily);
        } catch (e) {
          userReports[userId].on_time = userReports[userId].totalReports > 0;
        }
      });
      
      setAttendanceSummary(userReports);
      
    } catch (error) {
      console.error('❌ Error in calculateAttendance:', error);
      setAttendanceSummary({});
    }
  };

  const getEmployeeStats = (userId) => {
    const baseStats = attendanceSummary[userId] || { 
      totalReports: 0, 
      resolvedIssues: 0, 
      projects: [], 
      totalHours: 0,
      firstReport: null,
      lastReport: null,
      employeeName: 'Unknown'
    };
    
    // Check for daily report separately
    const hasDailyReport = dailyReports.some(report => 
      report.user_id === userId || 
      report.employee_code === userId ||
      report.employee_id === userId
    );
    
    return {
      ...baseStats,
      hasDailyReport: hasDailyReport || baseStats.hasDailyReport,
      on_time: Boolean(baseStats.on_time)
    };
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = searchTerm === '' || 
      emp.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.employeeId && emp.employeeId.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const isPresent = isEmployeePresent(emp.id);
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'present' && isPresent) ||
      (statusFilter === 'absent' && !isPresent);
    
    const matchesProject = selectedProject === 'all' || 
      (attendanceSummary[emp.id] && attendanceSummary[emp.id].projects.includes(selectedProject));
    
    return matchesSearch && matchesStatus && matchesProject;
  });

  const formatDateDisplay = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date().toISOString().split('T')[0];
    
    if (dateStr === today) {
      return 'Today';
    }
    
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      // If it's already a time string like "09:00"
      if (typeof timestamp === 'string' && timestamp.includes(':')) {
        return timestamp;
      }
      return 'N/A';
    }
  };

  const formatEditTimestamp = (timestamp) => {
    if (!timestamp) return null;
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins} min ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
      
      return date.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return 'unknown';
    }
  };

  const getEmployeeNameFromActivity = (activity) => {
    // First check if activity already has employeeName
    if (activity.employeeName && activity.employeeName !== 'Unknown') {
      return activity.employeeName;
    }
    
    // Try to find in employees array using multiple strategies
    if (employees.length > 0) {
      const foundEmployee = employees.find(emp => {
        return (
          emp.id === activity.user_id ||
          emp._id === activity.user_id ||
          emp.employeeId === activity.employee_id ||
          emp.id === activity.employee_id ||
          emp.user_id === activity.user_id ||
          (emp.username && activity.employeeName && emp.username === activity.employeeName)
        );
      });
      
      if (foundEmployee) {
        return foundEmployee.username;
      }
    }
    
    // If no match found, use whatever is available
    return activity.employeeName || activity.user_name || activity.username || 'Unknown';
  };

  const getEmployeeIdFromActivity = (activity) => {
    // First check activity for employee_id
    if (activity.employee_id) {
      return activity.employee_id;
    }
    
    // Try to find in employees array
    if (employees.length > 0) {
      const foundEmployee = employees.find(emp => {
        return (
          emp.id === activity.user_id ||
          emp._id === activity.user_id ||
          emp.employeeId === activity.employee_id ||
          emp.id === activity.employee_id ||
          emp.user_id === activity.user_id
        );
      });
      
      if (foundEmployee) {
        return foundEmployee.employeeId || foundEmployee.id || 'N/A';
      }
    }
    
    return activity.user_id || 'N/A';
  };

  // Helper function to get color for avatar based on initial
  const getColorForInitial = (initial) => {
    const colors = [
      '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', 
      '#FF5722', '#673AB7', '#3F51B5', '#009688'
    ];
    const index = initial.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const goToPreviousDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const goToNextDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    const tomorrow = date.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    
    if (tomorrow > today) {
      alert('Cannot view future dates');
      return;
    }
    setSelectedDate(tomorrow);
  };

  const viewMomDetails = (mom) => {
    setSelectedMom(mom);
    setShowMomModal(true);
  };

  const downloadMomTxt = (mom) => {
    try {
      const content = `
MoM Details:
Date: ${mom.mom_date}
Customer: ${mom.customer_name}
Engineer: ${mom.engg_name}
Project: ${mom.project_name}
Location: ${mom.site_location}
Man Hours: ${mom.man_hours}
      `;
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MoM_${mom.customer_name}_${mom.mom_date}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating TXT:', err);
      alert('Failed to generate TXT file');
    }
  };

  const downloadMomFromReport = (report) => {
    alert(`Download MoM for report ${report.id}`);
  };

  const manageProject = (projectName) => {
    alert(`Manage project: ${projectName}`);
  };

  const monitorEmployee = (employeeId) => {
    alert(`Monitoring employee: ${employeeId}`);
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="manager-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>VICKHARDTH</h1>
          <p className="dashboard-subtitle">Daily reporting hub for site engineers</p>
          <p className="dashboard-subtitle">{formatDateDisplay(selectedDate)}</p>
          <p className="dashboard-subtitle">User: {user?.username} | Role: {user?.role}</p>
        </div>
        
        <div className="date-controls">
          <button onClick={goToPreviousDay} className="date-btn">←</button>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="date-picker"
            max={new Date().toISOString().split('T')[0]}
          />
          <button onClick={goToNextDay} className="date-btn">→</button>
          <button onClick={fetchDashboardData} className="refresh-btn">Refresh</button>
          <button 
            onClick={() => {
              console.log('Debug: Employees', employees);
              console.log('Debug: Activities', activities);
            }}
            className="debug-btn"
          >
            Debug
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>⚠️ {error}</p>
          <button onClick={fetchDashboardData} className="retry-btn">
            Retry Loading Data
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="dashboard-tabs">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab-btn ${activeTab === 'employees' ? 'active' : ''}`}
          onClick={() => setActiveTab('employees')}
        >
          Employees ({employees.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'activities' ? 'active' : ''}`}
          onClick={() => setActiveTab('activities')}
        >
          Activities ({activities.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'dailyReports' ? 'active' : ''}`}
          onClick={() => setActiveTab('dailyReports')}
        >
          Daily Reports ({dailyReports.length})
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          <div className="reports-section">
            <h2>REPORTS</h2>
            <div className="reports-grid">
              <div className="report-card">
                <h3>All Employees - Daily Status</h3>
                <p>Showing all {employees.length} employees • 
                  {employees.filter(emp => isEmployeePresent(emp.id)).length} present today
                  ({dailyReports.length} daily reports)
                </p>
                <button 
                  className="btn-view-details"
                  onClick={() => setActiveTab('employees')}
                >
                  View Details
                </button>
              </div>
            </div>
          </div>

          <div className="quick-stats">
            <div className="stat-card">
              <h4>Total Employees</h4>
              <p className="stat-number">{employees.length}</p>
            </div>
            <div className="stat-card">
              <h4>Present Today</h4>
              <p className="stat-number">
                {employees.filter(emp => isEmployeePresent(emp.id)).length}
              </p>
              <small>
                ({activities.length} hourly, {dailyReports.length} daily)
              </small>
            </div>
            <div className="stat-card">
              <h4>On-Time Submissions</h4>
              <p className="stat-number">
                {employees.filter(emp => attendanceSummary[emp.id] && attendanceSummary[emp.id].on_time).length}
              </p>
              <small>Reports submitted on time</small>
            </div>
          </div>
        </>
      )}

      {/* Employees Tab */}
      {activeTab === 'employees' && (
        <div className="detailed-employees-section">
          <h2>Employee Directory</h2>
          <div className="employee-filters">
            <input
              type="text"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="filter-input"
            />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
            </select>
          </div>
          
          <div className="employee-cards">
            {filteredEmployees.map((emp, index) => {
              const isPresent = isEmployeePresent(emp.id);
              const stats = getEmployeeStats(emp.id);
              
              return (
                <div key={emp.id || index} className="employee-card">
                  <div className="employee-card-header">
                    <div className="employee-avatar-large">
                      {emp.username?.charAt(0) || 'E'}
                    </div>
                    <div className="employee-info">
                      <h3>{emp.username}</h3>
                      <p className="employee-id">{emp.employeeId}</p>
                      <p className="employee-role">{emp.role}</p>
                      <span className={`status-badge-large ${isPresent ? 'present' : 'absent'}`}>
                        {isPresent ? 'PRESENT TODAY' : 'ABSENT TODAY'}
                        {stats.hasDailyReport && !stats.totalReports && (
                          <span className="daily-report-indicator"> (Daily Report)</span>
                        )}
                      </span>
                      {stats.on_time && (
                        <span className="on-time-badge">ON-TIME</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="employee-stats">
                    <div className="stat-item">
                      <span className="stat-label">Hourly Reports</span>
                      <span className="stat-value">{stats.totalReports}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Daily Reports</span>
                      <span className="stat-value">
                        {stats.hasDailyReport ? '✓' : '✗'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="employee-actions">
                    <button 
                      onClick={() => monitorEmployee(emp.id)}
                      className="btn-monitor-full"
                    >
                      View Activities
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activities Tab */}
      {activeTab === 'activities' && (
        <div className="activities-section">
          <div className="activities-header">
            <h2>Complete Hourly Reports - All Employees</h2>
            <div className="activities-stats">
              <p>Date: {formatDateDisplay(selectedDate)}</p>
              <div className="stats-badges">
                <span className="stat-badge">Total Reports: {activities.length}</span>
                <span className="stat-badge">Unique Employees: {[...new Set(activities.map(a => a.employeeName || a.user_id))].length}</span>
                <span className="stat-badge">Resolved Issues: {activities.filter(a => a.problem_resolved_or_not === 'yes').length}</span>
              </div>
            </div>
          </div>


          {/* --- Manager Progress Summary --- */}
          <div className="manager-progress-summary" style={{margin: '1.5em 0', padding: '1em', background: '#f8f9fa', borderRadius: '8px', boxShadow: '0 1px 4px #e0e0e0'}}>
            {(() => {
              // Aggregate all plan achievements
              let totalPlans = 0;
              let totalAchieved = 0;
              activities.forEach(a => {
                if (Array.isArray(a.plan_achievements)) {
                  totalPlans += a.plan_achievements.length;
                  totalAchieved += a.plan_achievements.filter(p => p.achieved).length;
                }
              });
              const percent = totalPlans > 0 ? Math.round((totalAchieved / totalPlans) * 100) : 0;
              return (
                <div>
                  <h3 style={{marginBottom: '0.5em'}}>📈 Progress Summary</h3>
                  <div style={{display: 'flex', alignItems: 'center', gap: '1em'}}>
                    <span style={{fontWeight: 500}}>Planned: <span style={{color: '#2980b9'}}>{totalPlans}</span></span>
                    <span style={{fontWeight: 500}}>Achieved: <span style={{color: '#27ae60'}}>{totalAchieved}</span></span>
                    <span style={{fontWeight: 500}}>Achievement Rate: <span style={{color: percent >= 80 ? '#27ae60' : percent >= 50 ? '#f39c12' : '#e74c3c'}}>{percent}%</span></span>
                  </div>
                  <div style={{marginTop: '0.5em', background: '#e0e0e0', borderRadius: '6px', height: '18px', width: '100%', maxWidth: '400px', overflow: 'hidden'}}>
                    <div style={{height: '100%', width: `${percent}%`, background: percent >= 80 ? '#27ae60' : percent >= 50 ? '#f39c12' : '#e74c3c', transition: 'width 0.5s'}}></div>
                  </div>
                  {totalPlans === 0 && <div style={{color: '#888', marginTop: '0.5em'}}>No planned activities for this date.</div>}
                </div>
              );
            })()}
          </div>

          {/* --- Per-Employee Performance Table --- */}
          <div className="employee-performance-summary" style={{margin: '1.5em 0', padding: '1em', background: '#f4f8fc', borderRadius: '8px', boxShadow: '0 1px 4px #e0e0e0'}}>
            <h4 style={{marginBottom: '0.5em'}}>👤 Employee Performance</h4>
            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '1em'}}>
              <thead>
                <tr style={{background: '#eaf1fb'}}>
                  <th style={{padding: '0.5em', textAlign: 'left'}}>Employee</th>
                  <th style={{padding: '0.5em'}}>Planned</th>
                  <th style={{padding: '0.5em'}}>Achieved</th>
                  <th style={{padding: '0.5em'}}>Achievement Rate</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Group activities by employee
                  const empMap = {};
                  activities.forEach(a => {
                    const emp = a.employeeName || a.username || a.user_id || 'Unknown';
                    if (!empMap[emp]) empMap[emp] = { planned: 0, achieved: 0 };
                    if (Array.isArray(a.plan_achievements)) {
                      empMap[emp].planned += a.plan_achievements.length;
                      empMap[emp].achieved += a.plan_achievements.filter(p => p.achieved).length;
                    }
                  });
                  return Object.entries(empMap).map(([emp, stats]) => {
                    const percent = stats.planned > 0 ? Math.round((stats.achieved / stats.planned) * 100) : 0;
                    return (
                      <tr key={emp} style={{background: percent >= 80 ? '#eafbe7' : percent >= 50 ? '#fffbe6' : '#fdeaea'}}>
                        <td style={{padding: '0.5em', fontWeight: 500}}>{emp}</td>
                        <td style={{padding: '0.5em', textAlign: 'center'}}>{stats.planned}</td>
                        <td style={{padding: '0.5em', textAlign: 'center'}}>{stats.achieved}</td>
                        <td style={{padding: '0.5em', textAlign: 'center', color: percent >= 80 ? '#27ae60' : percent >= 50 ? '#f39c12' : '#e74c3c', fontWeight: 500}}>{percent}%</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>

          <div className="activities-filters">
            <div className="filter-group">
              <input
                type="text"
                placeholder="Search by employee name..."
                className="filter-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button 
                className="btn-refresh"
                onClick={fetchHourlyReports}
              >
                ↻ Refresh
              </button>
            </div>
          </div>
          
          {(() => {
            // Group activities by report ID
            const groupedByReport = {};
            activities.forEach(activity => {
              const reportId = activity.id || activity._id || `report-${activity.user_id}-${activity.time_period}`;
              if (!groupedByReport[reportId]) {
                groupedByReport[reportId] = {
                  id: reportId,
                  user_id: activity.user_id,
                  employeeName: activity.employeeName || activity.username || 'Unknown',
                  employee_id: activity.employee_id,
                  project_name: activity.project_name,
                  created_at: activity.created_at,
                  sessions: {}
                };
              }
              
              const timePeriod = activity.time_period || 'Unknown';
              if (!groupedByReport[reportId].sessions[timePeriod]) {
                groupedByReport[reportId].sessions[timePeriod] = [];
              }
              groupedByReport[reportId].sessions[timePeriod].push(activity);
            });
            
            const reports = Object.values(groupedByReport);
            
            const filteredReports = reports.filter(report => {
              const searchLower = searchTerm.toLowerCase();
              return (
                searchTerm === '' ||
                report.employeeName?.toLowerCase().includes(searchLower) ||
                report.project_name?.toLowerCase().includes(searchLower)
              );
            });
            
            if (filteredReports.length === 0) {
              return (
                <div className="no-activities">
                  <div className="no-data-icon">📊</div>
                  <p>
                    {searchTerm ? 
                      `No reports found matching "${searchTerm}"` : 
                      'No hourly reports found for this date.'
                    }
                  </p>
                  <div className="debug-info">
                    <small>
                      📊 Total Activities: {activities.length} | 
                      📅 Daily Reports: {dailyReports.length} | 
                      👥 Employees: {employees.length}
                    </small>
                  </div>
                  <div className="action-buttons">
                    <button 
                      onClick={fetchHourlyReports}
                      className="btn-retry"
                    >
                      🔄 Retry Fetching Reports
                    </button>
                    <button 
                      onClick={() => {
                        console.log('📊 Debug - Activities:', activities);
                        console.log('📊 Debug - Daily Reports:', dailyReports);
                        console.log('📊 Debug - Employees:', employees);
                        console.log('📊 Debug - Attendance Summary:', attendanceSummary);
                        alert('Check browser console (F12) for debug data');
                      }}
                      className="btn-debug"
                    >
                      🐛 Debug Info (F12)
                    </button>
                    {searchTerm && (
                      <button 
                        onClick={() => setSearchTerm('')}
                        className="btn-clear"
                      >
                        Clear Search
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            
            return (
              <>
                <div className="complete-reports-container">
                  {filteredReports.map((report, reportIndex) => {
                    const employeeInitial = report.employeeName ? report.employeeName.charAt(0).toUpperCase() : 'U';
                    const isExpanded = expandedReports[report.id];
                    const sessionsArray = Object.entries(report.sessions);
                    
                    return (
                      <div key={report.id} className="complete-report-card">
                        <div 
                          className="report-card-header"
                          onClick={() => setExpandedReports(prev => ({
                            ...prev,
                            [report.id]: !prev[report.id]
                          }))}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="report-header-left">
                            <div 
                              className="report-avatar-circle"
                              style={{ backgroundColor: getColorForInitial(employeeInitial) }}
                            >
                              {employeeInitial}
                            </div>
                            <div className="report-header-info">
                              <h3 className="report-employee-name">{report.employeeName}</h3>
                              <p className="report-employee-id">ID: {report.employee_id || 'N/A'}</p>
                              <p className="report-project">Project: <strong>{report.project_name || 'N/A'}</strong></p>
                              {/* Show session(s) for this report */}
                              <p className="report-sessions">
                                Sessions: {sessionsArray.map(([timePeriod], idx) => (
                                  <span key={timePeriod} className="session-time-period">
                                    {timePeriod}{idx < sessionsArray.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                              </p>
                              {/* Edited indicator */}
                              {report.updated_at && report.updated_at !== report.created_at && (
                                <span className="edited-badge" title={`Edited: ${formatEditTimestamp(report.updated_at)}`} style={{marginLeft: '0.5em', color: '#e67e22', fontWeight: 500}}>
                                  ✏️ Edited {formatEditTimestamp(report.updated_at)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="report-header-right">
                            <span className="session-count-badge">{sessionsArray.length} Session{sessionsArray.length !== 1 ? 's' : ''}</span>
                            <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="report-card-content">
                            {sessionsArray.map(([timePeriod, sessionActivities], sessionIndex) => (
                              <div key={sessionIndex} className="session-section">
                                <div className="session-header">
                                  <h4 className="session-time">📅 {timePeriod}</h4>
                                  <span className="session-activity-count">{sessionActivities.length} activit{sessionActivities.length !== 1 ? 'ies' : 'y'}</span>
                                  {/* Plan Achieved Indicator (if any activity in this session has plan_comparison) */}
                                  {sessionActivities.some(a => a.plan_comparison) && (
                                    <span className="plan-achieved-indicator">
                                      {sessionActivities.some(a => a.plan_comparison && a.plan_comparison.achievedFlag) ? (
                                        <span className="plan-achieved-badge achieved">🎯 Plan Achieved</span>
                                      ) : (
                                        <span className="plan-achieved-badge not-achieved">❌ Plan Not Achieved</span>
                                      )}
                                    </span>
                                  )}
                                </div>
                                
                                <div className="session-details">
                                  {sessionActivities.map((activity, activityIndex) => (
                                    <div key={activityIndex} className="activity-item">
                                      {/* Plan vs Achievement - show first */}
                                      {activity.plan_achievements && activity.plan_achievements.length > 0 && (
                                        <div className="activity-field">
                                          <label className="field-label">🎯 Plan Achievement Details:</label>
                                          <div className="field-value">
                                            <ul className="plan-achievement-list">
                                              {activity.plan_achievements.map((p, idx) => (
                                                <li key={idx}>
                                                  <span className="plan-item">{p.plan}</span>
                                                  <span className={`plan-achieved-badge ${p.achieved ? 'achieved' : 'not-achieved'}`}>{p.achieved ? '✅ Achieved' : '❌ Not Achieved'}</span>
                                                </li>
                                              ))}
                                            </ul>
                                            {activity.plan_comparison && (
                                              <div style={{marginTop: '0.5em'}}>
                                                <strong>Summary:</strong> <span className={`plan-achieved-badge ${activity.plan_comparison.achievedFlag ? 'achieved' : 'not-achieved'}`}>{activity.plan_comparison.achievedFlag ? 'All Plans Achieved' : 'Some Plans Not Achieved'}</span>
                                              </div>
                                            )}
                                            {activity.plan_comparison && activity.plan_comparison.daily_target_achieved && (
                                              <div><strong>Daily Achieved (from daily report):</strong> {activity.plan_comparison.daily_target_achieved}</div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                      {/* Activity Description - show after plan achievement */}
                                      <div className="activity-field">
                                        <label className="field-label">📝 Activity:</label>
                                        <div className="field-value">
                                          {activity.hourly_activity || activity.activity_description || 'No activity recorded'}
                                        </div>
                                      </div>
                                      
                                      {/* Problems Faced */}
                                      <div className="activity-field">
                                        <label className="field-label">⚠️ Problems Faced:</label>
                                        <div className="field-value">
                                          {activity.problem_faced ? (
                                            <div className="problem-box">
                                              {activity.problem_faced}
                                            </div>
                                          ) : (
                                            <span className="no-problem">No problems reported</span>
                                          )}
                                        </div>
                                      </div>
                                      
                                      {/* Problem Resolution */}
                                      <div className="activity-field">
                                        <label className="field-label">🔧 Resolved:</label>
                                        <div className="field-value">
                                          <span className={`resolution-badge ${activity.problem_resolved_or_not === 'yes' ? 'resolved' : 'pending'}`}>
                                            {activity.problem_resolved_or_not === 'yes' ? '✅ Yes' : '⏳ No'}
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {activityIndex < sessionActivities.length - 1 && (
                                        <div className="activity-divider"></div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                            
                            <div className="report-meta">
                              <div className="meta-info">
                                <small>📤 Submitted: {formatTime(report.created_at)}</small>
                                {report.updated_at && report.updated_at !== report.created_at && (
                                  <small className="edited-info">✏️ Edited: {formatEditTimestamp(report.updated_at)}</small>
                                )}
                              </div>
                              <button 
                                onClick={() => alert(`Edit Report ID: ${report.id} - Feature coming soon for manager editing`)}
                                className="btn-edit-report"
                                title="Edit this report"
                              >
                                ✏️ Edit
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                <div className="activities-summary">
                  <div className="summary-card">
                    <h4>📊 Report Summary</h4>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <span className="summary-label">Total Reports</span>
                        <span className="summary-value">{filteredReports.length}</span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">Total Sessions</span>
                        <span className="summary-value">
                          {filteredReports.reduce((sum, r) => sum + Object.keys(r.sessions).length, 0)}
                        </span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">Issues Resolved</span>
                        <span className="summary-value">
                          {activities.filter(a => a.problem_resolved_or_not === 'yes').length}
                        </span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">Issues Pending</span>
                        <span className="summary-value">
                          {activities.filter(a => a.problem_resolved_or_not === 'no' && a.problem_faced).length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Daily Reports Tab */}
      {activeTab === 'dailyReports' && (
        <div className="daily-reports-section">
          <h2>Daily Target Reports - {formatDateDisplay(selectedDate)}</h2>
          <p>Total Reports: {dailyReports.length} | Site: {dailyReports.filter(r => r.location_type === 'site').length} | Office: {dailyReports.filter(r => r.location_type === 'office').length} | Leave: {dailyReports.filter(r => r.location_type === 'leave').length}</p>
          
          <div className="reports-table-container">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Report Type</th>
                  <th>Time</th>
                  <th>Project/Customer</th>
                  <th>Daily Target</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dailyReports.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="no-data">
                      No daily reports found for this date.
                    </td>
                  </tr>
                ) : (
                  dailyReports.map((report, index) => (
                    <tr key={report.id || index}>
                      <td>
                        <div className="report-employee">
                          <div className="report-avatar">
                            {report.employee_name?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <div className="report-name">{report.employee_name || 'Unknown'}</div>
                            <div className="report-id">{report.employee_code || 'N/A'}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`report-type-badge ${report.location_type}`}>
                          {report.report_type}
                          {report.leave_type && ` (${report.leave_type})`}
                        </span>
                      </td>
                      <td>{report.display_time}</td>
                      <td>
                        {report.location_type === 'leave' ? (
                          <span className="leave-remark">{report.remark || 'No remark'}</span>
                        ) : (
                          <div>
                            <div><strong>Project Name:</strong> {report.project_name || report.project_no || 'N/A'}</div>
                            <div><strong>Customer:</strong> {report.customer_name || 'N/A'}</div>
                          </div>
                        )}
                      </td>
                      <td className="report-target">
                        {report.daily_target_achieved ? 
                          (report.daily_target_achieved.length > 50 ? 
                            `${report.daily_target_achieved.substring(0, 50)}...` : 
                            report.daily_target_achieved) : 
                          'N/A'}
                      </td>
                      <td>
                        {report.location_type === 'leave' ? (
                          <span className={`leave-status ${report.leave_status || 'pending'}`}>
                            {report.leave_status || 'Pending'}
                          </span>
                        ) : (
                          <span className="status-completed">Completed</span>
                        )}
                        {report.updated_at && report.updated_at !== report.created_at && (
                          <div className="edited-badge">✏️ Edited</div>
                        )}
                      </td>
                      <td>
                        <div className="report-actions">
                          <button 
                            onClick={() => {
                              setSelectedReport(report);
                              setShowReportModal(true);
                            }}
                            className="btn-view-report"
                          >
                            👁️ View
                          </button>
                          <button 
                            onClick={() => alert(`Edit Daily Report ID: ${report.id} - Feature coming soon`)}
                            className="btn-edit-report"
                            title="Edit this report"
                          >
                            ✏️ Edit
                          </button>
                          {report.has_mom && (
                            <button 
                              onClick={() => downloadMomFromReport(report)}
                              className="btn-download-mom"
                            >
                              MOM
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MoM Details Modal */}
      {showMomModal && selectedMom && (
        <div className="mom-modal-overlay">
          <div className="mom-modal">
            <div className="mom-modal-header">
              <h3>Minutes of Meeting Details</h3>
              <button 
                onClick={() => setShowMomModal(false)}
                className="close-modal"
              >
                ×
              </button>
            </div>
            
            <div className="mom-modal-content">
              <div className="mom-details-grid">
                <div className="detail-group">
                  <h4>Customer Information</h4>
                  <div className="detail-row">
                    <span>Customer Name:</span>
                    <strong>{selectedMom.customer_name || 'N/A'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Contact Person:</span>
                    <span>{selectedMom.customer_person || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span>Contact Number:</span>
                    <span>{selectedMom.cust_country_code || '+91'} {selectedMom.cust_contact || 'N/A'}</span>
                  </div>
                </div>
                
                <div className="detail-group">
                  <h4>Site Details</h4>
                  <div className="detail-row">
                    <span>Engineer:</span>
                    <strong>{selectedMom.engg_name || selectedMom.user_name || 'N/A'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Project:</span>
                    <span>{selectedMom.project_name || 'N/A'} ({selectedMom.project_no || 'N/A'})</span>
                  </div>
                  <div className="detail-row">
                    <span>Site Location:</span>
                    <span>{selectedMom.site_location || 'N/A'}</span>
                  </div>
                </div>
                
                <div className="detail-group">
                  <h4>Timing Information</h4>
                  <div className="detail-row">
                    <span>Date:</span>
                    <span>{selectedMom.mom_date || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span>Reporting Time:</span>
                    <span>{selectedMom.reporting_time || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span>Close Time:</span>
                    <span>{selectedMom.mom_close_time || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span>Man Hours:</span>
                    <span>{selectedMom.man_hours || 'N/A'} {selectedMom.man_hours_more_than_9 === 'Yes' ? '(Overtime)' : ''}</span>
                  </div>
                </div>
              </div>
              
              {selectedMom.observation_notes && (
                <div className="detail-section">
                  <h4>Observations</h4>
                  <div className="notes-box">
                    {selectedMom.observation_notes}
                  </div>
                </div>
              )}
              
              {selectedMom.solution_notes && (
                <div className="detail-section">
                  <h4>Solutions</h4>
                  <div className="notes-box">
                    {selectedMom.solution_notes}
                  </div>
                </div>
              )}
              
              {selectedMom.conclusion && (
                <div className="detail-section">
                  <h4>Conclusion</h4>
                  <div className="conclusion-box">
                    {selectedMom.conclusion}
                  </div>
                </div>
              )}
            </div>
            
            <div className="mom-modal-footer">
              <button 
                onClick={() => downloadMomTxt(selectedMom)}
                className="btn-download"
              >
                Download TXT
              </button>
              <button 
                onClick={() => setShowMomModal(false)}
                className="btn-close"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Details Modal */}
      {showReportModal && selectedReport && (
        <div className="report-modal-overlay">
          <div className="report-modal">
            <div className="report-modal-header">
              <h3>Daily Report Details</h3>
              <button onClick={() => setShowReportModal(false)} className="close-modal">×</button>
            </div>
            <div className="report-modal-content">
              <div className="report-details-grid">
                <div className="detail-group">
                  <h4>Employee Information</h4>
                  <div className="detail-row">
                    <span>Name:</span>
                    <strong>{selectedReport.employee_name || 'N/A'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Employee ID:</span>
                    <span>{selectedReport.employee_code || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span>Role:</span>
                    <span>{selectedReport.employee_role || 'N/A'}</span>
                  </div>
                </div>
                
                <div className="detail-group">
                  <h4>Report Information</h4>
                  <div className="detail-row">
                    <span>Report Date:</span>
                    <span>{selectedReport.report_date}</span>
                  </div>
                  <div className="detail-row">
                    <span>Report Type:</span>
                    <span className={`type-badge ${selectedReport.location_type}`}>
                      {selectedReport.report_type}
                    </span>
                  </div>
                  {selectedReport.location_type !== 'leave' && (
                    <>
                      <div className="detail-row">
                        <span>In Time:</span>
                        <span>{selectedReport.in_time || 'N/A'}</span>
                      </div>
                      <div className="detail-row">
                        <span>Out Time:</span>
                        <span>{selectedReport.out_time || 'N/A'}</span>
                      </div>
                    </>
                  )}
                </div>
                
                {selectedReport.location_type === 'leave' ? (
                  <div className="detail-group">
                    <h4>Leave Details</h4>
                    <div className="detail-row">
                      <span>Leave Type:</span>
                      <span>{selectedReport.leave_type || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span>Leave Status:</span>
                      <span className={`status-badge ${selectedReport.leave_status || 'pending'}`}>
                        {selectedReport.leave_status || 'Pending'}
                      </span>
                    </div>
                    {selectedReport.leave_approved_by && (
                      <div className="detail-row">
                        <span>Approved By:</span>
                        <span>{selectedReport.leave_approved_by}</span>
                      </div>
                    )}
                    {selectedReport.remark && (
                      <div className="detail-row">
                        <span>Remark:</span>
                        <span>{selectedReport.remark}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                      <div className="detail-group">
                        <h4>Project Details</h4>
                        <div className="detail-row">
                          <span>Project Name:</span>
                          <span>{selectedReport.project_name || selectedReport.project_no || 'N/A'}</span>
                        </div>
                        <div className="detail-row">
                          <span>Customer:</span>
                          <span>{selectedReport.customer_name || 'N/A'}</span>
                        </div>
                        <div className="detail-row">
                          <span>Contact Person:</span>
                          <span>{selectedReport.customer_person || 'N/A'}</span>
                        </div>
                      </div>
                    
                    <div className="detail-group">
                      <h4>Target Information</h4>
                      <div className="detail-row">
                        <span>Daily Target Planned:</span>
                        <div className="target-content">{selectedReport.daily_target_planned || 'N/A'}</div>
                      </div>
                      <div className="detail-row">
                        <span>Daily Target Achieved:</span>
                        <div className="target-content">{selectedReport.daily_target_achieved || 'N/A'}</div>
                      </div>
                      {/* Additional Activity */}
                      {selectedReport.additional_activity && (
                        <div className="detail-row">
                          <span>Additional Activity:</span>
                          <div className="target-content">{selectedReport.additional_activity}</div>
                        </div>
                      )}
                      {/* Additional Activity Details */}
                      {selectedReport.additional_activity_details && (
                        <div className="detail-row">
                          <span>Additional Activity Details:</span>
                          <div className="target-content">{selectedReport.additional_activity_details}</div>
                        </div>
                      )}
                      {/* Who Added Activity */}
                      {selectedReport.who_added_activity && (
                        <div className="detail-row">
                          <span>Who Added Activity:</span>
                          <div className="target-content">{selectedReport.who_added_activity}</div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="report-modal-footer">
              <button onClick={() => setShowReportModal(false)} className="btn-close">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="info-footer">
        <small>VICKHARDTH Site Engineering Dashboard • {new Date().toLocaleDateString()} • Total Employees: {employees.length}</small>
      </div>
    </div>
  );
}

export default ManagerDashboard;
import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import './ManagerDashboard.css';

function ManagerDashboard() {
  const { user, token } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceSummary, setAttendanceSummary] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [dailyTargets, setDailyTargets] = useState([]);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [selectedProject, setSelectedProject] = useState('all');

  const BASE_URL = 'http://localhost:5000';

  useEffect(() => {
    if (token && user) {
      fetchDashboardData();
    }
  }, [token, user, selectedDate]);

 // In the fetchDashboardData function, remove fetchDailyTargets:
const fetchDashboardData = async () => {
  try {
    setLoading(true);
    setError('');

    await Promise.all([
      fetchHourlyReports(),
      fetchAllUsers(),
      fetchPendingLeaves(),
      // Remove or comment this out: fetchDailyTargets(),
      simulateConsoleLogs()
    ]);
  } catch (error) {
    console.error('Error:', error);
    setError('Failed to load dashboard data.');
  } finally {
    setLoading(false);
  }
};

// Also comment out the state declaration:
// const [dailyTargets, setDailyTargets] = useState([]);

// And update the render section for Daily Target Report:
<div className="report-card">
  <h3>Daily Target Report</h3>
  <p>View and manage daily targets</p>
  <button 
    className="btn-view-targets"
    onClick={() => alert('Target report functionality coming soon')}
  >
    View Report
  </button>
</div>

  const fetchHourlyReports = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/hourly-report/${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setActivities(data);
          calculateAttendance(data);
        }
      } else {
        setActivities([]);
      }
    } catch (error) {
      console.error('Error fetching hourly reports:', error);
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

      if (response.ok) {
        const data = await response.json();
        let usersData = [];
        
        if (Array.isArray(data)) {
          usersData = data;
        } else if (data.users && Array.isArray(data.users)) {
          usersData = data.users;
        }
        
        const filteredUsers = usersData.filter(u => 
          u.role !== 'admin' && u.id !== user?.id
        );
        setEmployees(filteredUsers);
      } else {
        setEmployees([]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setEmployees([]);
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

  const fetchDailyTargets = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/daily-target/${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDailyTargets(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching daily targets:', error);
      setDailyTargets([]);
    }
  };

  const simulateConsoleLogs = () => {
    const logs = [
      { id: 1, message: 'Token api.js:80 added to headers', type: 'info' },
      { id: 2, message: '200 GET api.js:97 /api/projects', type: 'success' },
      { id: 3, message: 'Response: { success: true, projects: Array(6) }', type: 'info' },
      { id: 4, message: 'api.js:733 filtering for current user...', type: 'info' },
      { id: 5, message: 'HourlyReportForm.jsx: Loading employee data...', type: 'info' },
      { id: 6, message: 'Full API Response: { data: {...} }', type: 'info' },
      { id: 7, message: 'Response data: { success: true, projects: Array(6) }', type: 'success' },
      { id: 8, message: 'ENG IN 14-01-2026', type: 'warning' }
    ];
    setConsoleLogs(logs);
  };

  const calculateAttendance = (reports) => {
    const userReports = {};
    
    reports.forEach(report => {
      const userId = report.user_id;
      if (!userReports[userId]) {
        userReports[userId] = {
          reports: [],
          totalReports: 0,
          firstReport: null,
          lastReport: null,
          resolvedIssues: 0,
          projects: new Set(),
          totalHours: 0
        };
      }
      
      userReports[userId].reports.push(report);
      userReports[userId].totalReports++;
      
      if (report.problem_resolved_or_not === 'yes') {
        userReports[userId].resolvedIssues++;
      }
      
      if (report.project_name) {
        userReports[userId].projects.add(report.project_name);
      }
      
      userReports[userId].totalHours++;
      
      if (report.time_period) {
        if (!userReports[userId].firstReport || report.time_period < userReports[userId].firstReport) {
          userReports[userId].firstReport = report.time_period;
        }
        if (!userReports[userId].lastReport || report.time_period > userReports[userId].lastReport) {
          userReports[userId].lastReport = report.time_period;
        }
      }
    });
    
    Object.keys(userReports).forEach(userId => {
      userReports[userId].projects = Array.from(userReports[userId].projects);
    });
    
    setAttendanceSummary(userReports);
  };

  const isEmployeePresent = (userId) => {
    return attendanceSummary[userId] && attendanceSummary[userId].totalReports > 0;
  };

  const getEmployeeReports = (userId) => {
    return attendanceSummary[userId]?.reports || [];
  };

  const getEmployeeStats = (userId) => {
    return attendanceSummary[userId] || { 
      totalReports: 0, 
      resolvedIssues: 0, 
      projects: [], 
      totalHours: 0,
      firstReport: null,
      lastReport: null
    };
  };

  // New function to get project list for filtering
  const getProjectList = () => {
    const projects = new Set();
    employees.forEach(emp => {
      const stats = getEmployeeStats(emp.id);
      stats.projects.forEach(project => {
        projects.add(project);
      });
    });
    return Array.from(projects);
  };

  // Filter employees based on search, status, and project
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

  const formatTime = (timePeriod) => {
    if (!timePeriod) return '';
    const timeMatch = timePeriod.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1]);
      const minute = timeMatch[2];
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour;
      return `${displayHour}:${minute} ${period}`;
    }
    return timePeriod;
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

  // New function to handle project management
  const manageProject = (projectName) => {
    alert(`Manage project: ${projectName}`);
    // Implement project management logic here
  };

  // New function to handle employee monitoring
  const monitorEmployee = (employeeId) => {
    alert(`Monitoring employee: ${employeeId}`);
    // Implement employee monitoring logic here
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
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}

      {/* Reports Section */}
      <div className="reports-section">
        <h2>REPORTS</h2>
        <div className="reports-grid">
          <div className="report-card">
            <h3>All Employees - Daily Status</h3>
            <p>Showing all {employees.length} employees • {Object.keys(attendanceSummary).length} present today</p>
          </div>
          <div className="report-card">
            <h3>Daily Target Report</h3>
            <p>{dailyTargets.length} targets set for today</p>
            {dailyTargets.length > 0 && (
              <div className="targets-preview">
                {dailyTargets.slice(0, 2).map(target => (
                  <div key={target.id} className="target-item">
                    {target.project_name}: {target.target_description}
                  </div>
                ))}
                {dailyTargets.length > 2 && <div>+{dailyTargets.length - 2} more</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Employee Details Table */}
      <div className="employee-details-section">
        <h2>EMPLOYEE DETAILS</h2>
        
        {/* Filters */}
        <div className="details-filters">
          <div className="filter-group">
            <input
              type="text"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="filter-input"
            />
          </div>
          <div className="filter-group">
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
          <div className="filter-group">
            <select 
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Projects</option>
              {getProjectList().map(project => (
                <option key={project} value={project}>{project}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table Section */}
        <div className="details-table-container">
          <div className="table-section">
            <h3>MONITORING</h3>
            <table className="details-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp, index) => {
                  const isPresent = isEmployeePresent(emp.id);
                  const stats = getEmployeeStats(emp.id);
                  
                  return (
                    <tr key={emp.id || index}>
                      <td>
                        <div className="table-employee">
                          <div className="table-avatar">
                            {emp.username?.charAt(0) || 'E'}
                          </div>
                          <div>
                            <div className="table-name">{emp.username}</div>
                            <div className="table-id">{emp.employeeId || emp.id}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${isPresent ? 'present' : 'absent'}`}>
                          {isPresent ? 'Present' : 'Absent'}
                        </span>
                      </td>
                      <td>
                        <button 
                          onClick={() => monitorEmployee(emp.id)}
                          className="btn-monitor"
                        >
                          Monitor
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="table-section">
            <h3>PROJECTS (Manage)</h3>
            <table className="details-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Assigned To</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {getProjectList().slice(0, 5).map((project, index) => {
                  const assignedEmployees = employees.filter(emp => {
                    const stats = getEmployeeStats(emp.id);
                    return stats.projects.includes(project);
                  });
                  
                  return (
                    <tr key={index}>
                      <td>{project}</td>
                      <td>
                        {assignedEmployees.slice(0, 2).map(emp => (
                          <div key={emp.id} className="assigned-employee">
                            {emp.username}
                          </div>
                        ))}
                        {assignedEmployees.length > 2 && (
                          <div>+{assignedEmployees.length - 2} more</div>
                        )}
                      </td>
                      <td>
                        <button 
                          onClick={() => manageProject(project)}
                          className="btn-manage"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Additional Info Sections */}
      <div className="info-sections">
        <div className="info-section">
          <h3>Today's Activities Summary</h3>
          <div className="activity-stats">
            <div className="activity-stat">
              <span className="stat-value">{activities.length}</span>
              <span className="stat-label">Total Reports</span>
            </div>
            <div className="activity-stat">
              <span className="stat-value">
                {activities.filter(a => a.problem_resolved_or_not === 'yes').length}
              </span>
              <span className="stat-label">Resolved Issues</span>
            </div>
            <div className="activity-stat">
              <span className="stat-value">{getProjectList().length}</span>
              <span className="stat-label">Active Projects</span>
            </div>
          </div>
        </div>

        <div className="info-section">
          <h3>Console</h3>
          <div className="console-container">
            {consoleLogs.map(log => (
              <div key={log.id} className={`console-log ${log.type}`}>
                {log.message}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="info-footer">
        <small>VICKHARDTH Site Engineering Dashboard • {new Date().toLocaleDateString()}</small>
      </div>
    </div>
  );
}

export default ManagerDashboard;
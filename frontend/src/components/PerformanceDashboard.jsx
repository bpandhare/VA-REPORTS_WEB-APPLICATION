import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import './PerformanceDashboard.css';

const PerformanceDashboard = () => {
  const { token, user } = useAuth();
  const [period, setPeriod] = useState('weekly');
  const [loading, setLoading] = useState(true);
  const [performanceData, setPerformanceData] = useState(null);
  const [engineers, setEngineers] = useState([]);
  const [selectedEngineer, setSelectedEngineer] = useState('');
  const [isManager, setIsManager] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL?.replace('/api/activity', '') ?? 'http://localhost:5000';

  useEffect(() => {
    if (user) {
      const role = user.role?.toLowerCase() || '';
      setIsManager(role.includes('manager') || role.includes('team leader') || role.includes('group leader'));
      
      if (isManager) {
        fetchEngineers();
      }
    }
  }, [user]);

  useEffect(() => {
    fetchPerformanceData();
  }, [period, selectedEngineer]);

  const fetchEngineers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/activity/engineers-list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setEngineers(data.engineers || []);
      }
    } catch (error) {
      console.error('Error fetching engineers:', error);
    }
  };

  const fetchPerformanceData = async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/api/activity/performance?period=${period}`;
      if (isManager && selectedEngineer) {
        url += `&engineerId=${selectedEngineer}`;
      }
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPerformanceData(data.data);
      }
    } catch (error) {
      console.error('Error fetching performance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
  const LOCATION_COLORS = {
    'site': '#0088FE',
    'office': '#00C49F',
    'leave': '#FFBB28'
  };

  if (loading) {
    return (
      <div className="performance-dashboard loading">
        <div className="spinner"></div>
        <p>Loading performance data...</p>
      </div>
    );
  }

  if (!performanceData) {
    return (
      <div className="performance-dashboard">
        <p>No performance data available</p>
      </div>
    );
  }

  return (
    <div className="performance-dashboard">
      {/* Header with Filters */}
      <div className="dashboard-header">
        <div className="header-left">
          <h2>Employee Performance Dashboard</h2>
          <div className="period-selector">
            <button 
              className={period === 'weekly' ? 'active' : ''}
              onClick={() => setPeriod('weekly')}
            >
              Weekly
            </button>
            <button 
              className={period === 'monthly' ? 'active' : ''}
              onClick={() => setPeriod('monthly')}
            >
              Monthly
            </button>
            <button 
              className={period === 'yearly' ? 'active' : ''}
              onClick={() => setPeriod('yearly')}
            >
              Yearly
            </button>
          </div>
        </div>
        
        {isManager && engineers.length > 0 && (
          <div className="engineer-selector">
            <select 
              value={selectedEngineer} 
              onChange={(e) => setSelectedEngineer(e.target.value)}
            >
              <option value="">All Engineers</option>
              {engineers.map(eng => (
                <option key={eng.id} value={eng.id}>
                  {eng.username} ({eng.employee_id})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        {period === 'weekly' && (
          <>
            <div className="summary-card">
              <h3>Reports This Week</h3>
              <div className="card-value">{performanceData.summary?.totalReports || 0}</div>
              <div className="card-trend">
                <span className="trend-up">↑</span>
                <span>From last week</span>
              </div>
            </div>
            
            <div className="summary-card">
              <h3>Completion Rate</h3>
              <div className="card-value">{performanceData.summary?.completionRate || 0}%</div>
              <div className="card-progress">
                <div 
                  className="progress-bar" 
                  style={{ width: `${performanceData.summary?.completionRate || 0}%` }}
                ></div>
              </div>
            </div>
            
            <div className="summary-card">
              <h3>Site Visits</h3>
              <div className="card-value">{performanceData.summary?.siteVisits || 0}</div>
              <div className="card-subtext">Customer visits this week</div>
            </div>
            
            <div className="summary-card">
              <h3>Productivity Score</h3>
              <div className="card-value">{performanceData.productivityScore || 0}/100</div>
              <div className="card-trend">
                <span className="trend-up">↑</span>
                <span>Based on activity</span>
              </div>
            </div>
          </>
        )}
        
        {period === 'monthly' && (
          <>
            <div className="summary-card">
              <h3>Monthly Reports</h3>
              <div className="card-value">{performanceData.monthlySummary?.totalReports || 0}</div>
              <div className="card-subtext">{performanceData.month} {performanceData.year}</div>
            </div>
            
            <div className="summary-card">
              <h3>Avg Completion</h3>
              <div className="card-value">{performanceData.monthlySummary?.avgCompletionRate || 0}%</div>
              <div className="card-progress">
                <div 
                  className="progress-bar" 
                  style={{ width: `${performanceData.monthlySummary?.avgCompletionRate || 0}%` }}
                ></div>
              </div>
            </div>
            
            <div className="summary-card">
              <h3>Problems Resolved</h3>
              <div className="card-value">{performanceData.problemResolution?.resolvedProblems || 0}</div>
              <div className="card-subtext">
                {performanceData.problemResolution?.resolutionRate || 0}% resolution rate
              </div>
            </div>
            
            <div className="summary-card">
              <h3>Top Customer</h3>
              <div className="card-value">
                {performanceData.customerStats?.[0]?.customer_name || 'N/A'}
              </div>
              <div className="card-subtext">
                {performanceData.customerStats?.[0]?.visits || 0} visits
              </div>
            </div>
          </>
        )}
        
        {period === 'yearly' && (
          <>
            <div className="summary-card">
              <h3>Yearly Reports</h3>
              <div className="card-value">{performanceData.yearlySummary?.totalReports || 0}</div>
              <div className="card-subtext">{performanceData.year}</div>
            </div>
            
            <div className="summary-card">
              <h3>Site Visits</h3>
              <div className="card-value">{performanceData.yearlySummary?.totalSiteVisits || 0}</div>
              <div className="card-trend">
                <span className="trend-up">↑</span>
                <span>Year to date</span>
              </div>
            </div>
            
            <div className="summary-card">
              <h3>Office Days</h3>
              <div className="card-value">{performanceData.yearlySummary?.totalOfficeDays || 0}</div>
              <div className="card-subtext">Days worked from office</div>
            </div>
            
            <div className="summary-card">
              <h3>Leave Days</h3>
              <div className="card-value">{performanceData.yearlySummary?.totalLeaveDays || 0}</div>
              <div className="card-subtext">Total leave taken</div>
            </div>
          </>
        )}
      </div>

      {/* Charts Section */}
      <div className="charts-section">
        {period === 'weekly' && (
          <>
            <div className="chart-container">
              <h3>Daily Activity - This Week</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performanceData.dailyData || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="reports" name="Reports" fill="#0088FE" />
                  <Bar dataKey="siteVisits" name="Site Visits" fill="#00C49F" />
                  <Bar dataKey="officeDays" name="Office Days" fill="#FFBB28" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="chart-container">
              <h3>Project Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={performanceData.projectDistribution || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="project_no"
                  >
                    {performanceData.projectDistribution?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
        
        {period === 'monthly' && (
          <>
            <div className="chart-container full-width">
              <h3>Weekly Performance - {performanceData.month} {performanceData.year}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={performanceData.weeklyBreakdown || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="reports" name="Reports" fill="#0088FE" stroke="#0088FE" />
                  <Area type="monotone" dataKey="completionRate" name="Completion %" fill="#00C49F" stroke="#00C49F" />
                  <Area type="monotone" dataKey="productivity" name="Productivity" fill="#FFBB28" stroke="#FFBB28" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="chart-container">
              <h3>Top Customers</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performanceData.customerStats || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="customer_name" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="visits" name="Visits" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="chart-container">
              <h3>Problem Resolution</h3>
              <div className="problem-resolution">
                <div className="resolution-rate">
                  <div className="rate-circle">
                    <span>{performanceData.problemResolution?.resolutionRate || 0}%</span>
                  </div>
                  <p>Resolution Rate</p>
                </div>
                <div className="resolution-stats">
                  <div className="stat-item">
                    <span className="stat-label">Total Problems:</span>
                    <span className="stat-value">{performanceData.problemResolution?.totalProblems || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Resolved:</span>
                    <span className="stat-value">{performanceData.problemResolution?.resolvedProblems || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Avg Time:</span>
                    <span className="stat-value">{performanceData.problemResolution?.avgResolutionTime || 0} hours</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        
        {period === 'yearly' && (
          <>
            <div className="chart-container full-width">
              <h3>Monthly Performance - {performanceData.year}</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={performanceData.monthlyBreakdown || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="siteVisits" name="Site Visits" fill="#0088FE" />
                  <Bar yAxisId="left" dataKey="officeDays" name="Office Days" fill="#00C49F" />
                  <Line yAxisId="right" type="monotone" dataKey="completionRate" name="Completion %" stroke="#FF8042" strokeWidth={2} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="chart-container">
              <h3>Project Duration</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performanceData.projectStatistics || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="project_no" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total_days" name="Days Spent" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="chart-container">
              <h3>Leave Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={performanceData.leaveStatistics || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="days_taken"
                    nameKey="leave_type"
                  >
                    {performanceData.leaveStatistics?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Additional Stats */}
      <div className="additional-stats">
        {period === 'weekly' && performanceData.dailyData && (
          <div className="daily-details">
            <h3>Daily Breakdown</h3>
            <div className="days-grid">
              {performanceData.dailyData.map((day, index) => (
                <div key={index} className={`day-card ${day.isToday ? 'today' : ''}`}>
                  <div className="day-header">
                    <span className="day-name">{day.day}</span>
                    <span className="day-date">{day.date}</span>
                  </div>
                  <div className="day-stats">
                    <div className="day-stat">
                      <span className="stat-label">Reports:</span>
                      <span className="stat-value">{day.reports}</span>
                    </div>
                    <div className="day-stat">
                      <span className="stat-label">Site Visits:</span>
                      <span className="stat-value">{day.siteVisits}</span>
                    </div>
                    <div className="day-stat">
                      <span className="stat-label">Office:</span>
                      <span className="stat-value">{day.officeDays}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformanceDashboard;
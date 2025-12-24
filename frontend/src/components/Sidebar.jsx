import './Sidebar.css'
import { useAuth } from './AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import logo from '../assets/logo.jpeg'

function Sidebar({ currentPage, onPageChange }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const activePage = location.pathname.substring(1) || 'hourly'
  
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (date) => {
    return date.toLocaleString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleNavigation = (page) => {
    onPageChange(page)
    navigate(`/${page}`)
  }

  // Get day name and formatted date
  const getDayAndDate = () => {
    const date = new Date()
    const dayName = date.toLocaleDateString('en-IN', { weekday: 'long' })
    const formattedDate = date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
    return { dayName, formattedDate }
  }

  const { dayName, formattedDate } = getDayAndDate()

  return (
    <div className="sidebar">
      {/* Date Header */}
      <div className="date-header">
        <div className="date-day">{dayName}</div>
        <div className="date-full">{formattedDate}, {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
      </div>

      {/* Company Branding */}
      <div className="company-brand">
        <div className="company-logo">
          <img src={logo} alt="Vickhardth Logo" className="logo-img" />
          <div className="company-name">VICKHARDTH</div>
        </div>
        <div className="company-tagline">Daily reporting hub for site engineers</div>
      </div>

      {/* Main Navigation */}
      <nav className="main-nav">
        <div className="nav-section">
          <div className="section-title">REPORTS</div>
          <div className="nav-buttons">
            <button
              className={`nav-btn ${activePage === 'hourly' ? 'active' : ''}`}
              onClick={() => handleNavigation('hourly')}
            >
              <span className="btn-icon">⏰</span>
              <span className="btn-text">Hourly Report</span>
            </button>
            <button
              className={`nav-btn ${activePage === 'daily' ? 'active' : ''}`}
              onClick={() => handleNavigation('daily')}
            >
              <span className="btn-icon">📋</span>
              <span className="btn-text">Daily Target Report</span>
            </button>
          </div>
        </div>

        {user && (
          <>
            <div className="nav-section">
              <div className="section-title">MONITORING</div>
              <div className="nav-buttons">
                <button
                  className={`nav-btn ${activePage === 'activity' ? 'active' : ''}`}
                  onClick={() => handleNavigation('activity')}
                >
                  <span className="btn-icon">📊</span>
                  <span className="btn-text">
                    View Activities
                    <span className="btn-tag">
                      {user.role === 'Manager' || user.role === 'Team Leader' ? '(All)' : '(Mine)'}
                    </span>
                  </span>
                </button>
                
                {(user.role === 'Manager' || user.role === 'Team Leader' || user.role === 'Senior Assistant') && (
                  <button
                    className={`nav-btn ${activePage === 'attendance-history' ? 'active' : ''}`}
                    onClick={() => handleNavigation('attendance-history')}
                  >
                    <span className="btn-icon">👥</span>
                    <span className="btn-text">
                      Attendance History
                      <span className="btn-tag manager">(Manager)</span>
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="nav-section">
              <div className="section-title">DOCUMENTS</div>
              <div className="nav-buttons">
                <button 
                  className={`nav-btn ${activePage === 'create-mom' ? 'active' : ''}`} 
                  onClick={() => handleNavigation('create-mom')}
                >
                  <span className="btn-icon">📄</span>
                  <span className="btn-text">Create MoM</span>
                  <span className="btn-download">(Download)</span>
                </button>
              </div>
            </div>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="footer-text">
          Site Activity Monitoring System
        </div>
        <div className="footer-version">
          v1.0 • Professional Edition
        </div>
      </div>
    </div>
  )
}

export default Sidebar
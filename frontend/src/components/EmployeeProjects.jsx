import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listProjects, getUserInfo } from '../services/api'
import { useAuth } from './AuthContext'
import './EmployeeProjects.css'

export default function EmployeeProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchProjects()
  }, [user])

  const fetchProjects = async () => {
    try {
      console.log('Fetching projects for employee:', user)
      const res = await listProjects()
      console.log('Projects API response:', res.data)
      
      if (res.data?.success) {
        setProjects(res.data.projects || [])
      } else {
        setError(res.data?.message || 'Failed to load projects')
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
      setError('Unable to load projects. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getUserInitials = () => {
    const name = user?.username || user?.name || 'U'
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'active'
      case 'completed': return 'completed'
      case 'inactive': return 'inactive'
      case 'on-hold': return 'on-hold'
      default: return 'active'
    }
  }

  const getStatusText = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'Active'
      case 'completed': return 'Completed'
      case 'inactive': return 'Inactive'
      case 'on-hold': return 'On Hold'
      default: return 'Active'
    }
  }

  const handleCardClick = (projectId) => {
    navigate(`/project/${projectId}`)
  }

  const handleRefresh = (e) => {
    e.preventDefault()
    fetchProjects()
  }

  // Filter projects based on status and search term
  const filteredProjects = projects.filter(project => {
    // Filter by status
    if (filter !== 'all' && project.status !== filter) {
      return false
    }
    
    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      return (
        project.name.toLowerCase().includes(searchLower) ||
        project.description?.toLowerCase().includes(searchLower) ||
        project.id.toString().includes(searchTerm)
      )
    }
    
    return true
  })

  // Calculate stats
  const stats = {
    total: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    completed: projects.filter(p => p.status === 'completed').length,
    pending: projects.filter(p => p.status === 'inactive' || p.status === 'on-hold').length
  }

  if (loading) {
    return (
      <div className="employee-dashboard">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading your projects...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="employee-dashboard">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h3>Error Loading Projects</h3>
          <p>{error}</p>
          <button className="retry-btn" onClick={fetchProjects}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="employee-dashboard">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="header-content">
          <h1>Project Dashboard</h1>
          <p className="subtitle">Welcome back, {user?.username || 'Employee'}. Here's an overview of your assigned projects.</p>
        </div>
        <div className="header-actions">
          <button className="refresh-btn" onClick={handleRefresh}>
            <span className="refresh-icon">↻</span>
            Refresh
          </button>
        </div>
      </div>

      {/* User Info Card */}
      <div className="user-info-card">
        <div className="user-avatar">{getUserInitials()}</div>
        <div className="user-details">
          <h3>{user?.username || 'Employee'}</h3>
          <div className="user-meta">
            <span className="meta-item">
              <span className="meta-label">Role:</span>
              <span className="meta-value">{user?.role || 'Employee'}</span>
            </span>
            <span className="meta-item">
              <span className="meta-label">ID:</span>
              <span className="meta-value">{user?.employeeId || user?.id || 'N/A'}</span>
            </span>
            <span className="meta-item">
              <span className="meta-label">Email:</span>
              <span className="meta-value">{user?.email || 'Not provided'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="stats-overview">
        <div className="stat-card total">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Projects</div>
          </div>
        </div>
        
        <div className="stat-card active">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-value">{stats.active}</div>
            <div className="stat-label">Active</div>
          </div>
        </div>
        
        <div className="stat-card completed">
          <div className="stat-icon">🏁</div>
          <div className="stat-content">
            <div className="stat-value">{stats.completed}</div>
            <div className="stat-label">Completed</div>
          </div>
        </div>
        
        <div className="stat-card pending">
          <div className="stat-icon">⏸️</div>
          <div className="stat-content">
            <div className="stat-value">{stats.pending}</div>
            <div className="stat-label">Pending</div>
          </div>
        </div>
      </div>

      {/* Projects Section */}
      <div className="projects-section">
        <div className="section-header">
          <div className="section-title">
            <h2>Your Projects</h2>
            <span className="project-count">({filteredProjects.length} projects)</span>
          </div>
          
          <div className="section-controls">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <span className="search-icon">🔍</span>
            </div>
            
            <div className="filter-tabs">
              <button 
                className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button 
                className={`filter-tab ${filter === 'active' ? 'active' : ''}`}
                onClick={() => setFilter('active')}
              >
                Active
              </button>
              <button 
                className={`filter-tab ${filter === 'completed' ? 'active' : ''}`}
                onClick={() => setFilter('completed')}
              >
                Completed
              </button>
              <button 
                className={`filter-tab ${filter === 'inactive' ? 'active' : ''}`}
                onClick={() => setFilter('inactive')}
              >
                Inactive
              </button>
            </div>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>No Projects Found</h3>
            <p>
              {searchTerm || filter !== 'all' 
                ? 'No projects match your search criteria. Try adjusting your filters.'
                : 'You have not been assigned to any projects yet. Contact your manager.'
              }
            </p>
            {(searchTerm || filter !== 'all') && (
              <button 
                className="clear-filters-btn"
                onClick={() => {
                  setSearchTerm('')
                  setFilter('all')
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="projects-grid">
            {filteredProjects.map(project => (
              <div 
                key={project.id} 
                className="project-card"
                onClick={() => handleCardClick(project.id)}
              >
                <div className="project-header">
                  <div className="project-title-section">
                    <h3 className="project-title">{project.name}</h3>
                    <span className={`project-status ${getStatusClass(project.status)}`}>
                      {getStatusText(project.status)}
                    </span>
                  </div>
                  <div className="project-id">#{project.id}</div>
                </div>
                
                <div className="project-description">
                  {project.description || 'No description provided for this project.'}
                </div>
                
                <div className="project-meta">
                  <div className="meta-item">
                    <span className="meta-icon">👥</span>
                    <span className="meta-text">
                      {project.collaborators_count || 0} team members
                    </span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-icon">📅</span>
                    <span className="meta-text">
                      Created: {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {project.created_by === user?.id && (
                    <div className="meta-item creator">
                      <span className="meta-icon">👑</span>
                      <span className="meta-text">Created by you</span>
                    </div>
                  )}
                </div>
                
                <div className="project-footer">
                  <button 
                    className="view-details-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCardClick(project.id)
                    }}
                  >
                    <span className="btn-icon">🔍</span>
                    View Details
                  </button>
                  <div className="quick-actions">
                    <button 
                      className="quick-action-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Add quick action functionality
                        console.log('Quick action for project:', project.id)
                      }}
                      title="Add file"
                    >
                      📎
                    </button>
                    <button 
                      className="quick-action-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Add quick action functionality
                        console.log('Quick action for project:', project.id)
                      }}
                      title="Add note"
                    >
                      📝
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="recent-activity">
        <h3>Recent Activity</h3>
        <div className="activity-list">
          {projects.slice(0, 3).map(project => (
            <div key={project.id} className="activity-item">
              <div className="activity-icon">📋</div>
              <div className="activity-content">
                <p className="activity-text">
                  <strong>{project.name}</strong> was last updated
                </p>
                <p className="activity-time">
                  {new Date(project.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="activity-item">
              <div className="activity-icon">ℹ️</div>
              <div className="activity-content">
                <p className="activity-text">No recent activity</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
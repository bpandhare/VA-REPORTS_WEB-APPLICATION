import React, { useState, useEffect } from 'react'
import { 
  listProjects, 
  createProject, 
  updateProject, 
  deleteProject,
  getUserInfo 
} from '../services/api'
import './ManagerProjectDashboard.css'

const ManagerProjectDashboard = () => {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false) // ← ADD THIS LINE
  const [editingProject, setEditingProject] = useState(null)
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    active: 0,
    overdue: 0
  })
  // ... rest of your code
  const [newProject, setNewProject] = useState({
    name: '',
    customer: '', // Added customer field
    description: '',
    status: 'active',
    priority: 'medium',
    startDate: '',
    endDate: '',
    budget: ''
  })
  const [userInfo, setUserInfo] = useState(null)

  useEffect(() => {
    fetchUserAndProjects()
  }, [])

  const fetchUserAndProjects = async () => {
    try {
      // Get user info
      const userRes = await getUserInfo()
      if (userRes.data?.success) {
        setUserInfo(userRes.data)
      }

      // Get projects
      await fetchProjects()
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    try {
      const res = await listProjects()
      if (res.data?.success) {
        const projectsData = res.data.projects || []
        setProjects(projectsData)
        
        // Calculate stats
        const total = projectsData.length
        const completed = projectsData.filter(p => p.status === 'completed').length
        const active = projectsData.filter(p => p.status === 'active').length
        const overdue = projectsData.filter(p => p.status === 'overdue').length
        
        setStats({ total, completed, active, overdue })
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }

  const handleCreateProject = async (e) => {
    e.preventDefault()
    try {
      // Prepare project data with all fields
      const projectData = {
        name: newProject.name,
        customer: newProject.customer,
        description: newProject.description,
        status: newProject.status,
        priority: newProject.priority,
        start_date: newProject.startDate || null,
        end_date: newProject.endDate || null,
        budget: newProject.budget || null
      }
      
      const res = await createProject(projectData)
      if (res.data?.success) {
        setShowCreateModal(false)
        // Reset form with all fields
        setNewProject({
          name: '',
          customer: '',
          description: '',
          status: 'active',
          priority: 'medium',
          startDate: '',
          endDate: '',
          budget: ''
        })
        fetchProjects()
      }
    } catch (error) {
      console.error('Failed to create project:', error)
      alert('Failed to create project. Please try again.')
    }
  }

  const handleUpdateProject = async (e) => {
    e.preventDefault()
    try {
      const res = await updateProject(editingProject.id, editingProject)
      if (res.data?.success) {
        setEditingProject(null)
        fetchProjects()
      }
    } catch (error) {
      console.error('Failed to update project:', error)
      alert('Failed to update project. Please try again.')
    }
  }

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm('Are you sure you want to delete this project?')) return
    
    try {
      const res = await deleteProject(projectId)
      if (res.data?.success) {
        fetchProjects()
      }
    } catch (error) {
      console.error('Failed to delete project:', error)
      alert('Failed to delete project. Please try again.')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'var(--status-active)'
      case 'completed': return 'var(--status-completed)'
      case 'overdue': return 'var(--status-overdue)'
      default: return 'var(--status-default)'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'active': return 'ACTIVE'
      case 'completed': return 'COMPLETED'
      case 'overdue': return 'OVERDUE'
      default: return 'PLANNING'
    }
  }

  // Get priority color
  const getPriorityColor = (priority) => {
    switch(priority?.toLowerCase()) {
      case 'low': return '#4CAF50'
      case 'medium': return '#FF9800'
      case 'high': return '#F44336'
      case 'urgent': return '#9C27B0'
      default: return '#757575'
    }
  }

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount) return 'Not set'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'Not set'
    try {
      return new Date(dateString).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="manager-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1>Welcome back, {userInfo?.username || 'Manager'}</h1>
          <p className="subtitle">Here's what's happening with your projects today</p>
        </div>
        <div className="header-right">
          <button 
            className="btn-primary"
            onClick={() => setShowCreateModal(true)} // Now this will work
          >
            <span className="btn-icon">+</span>
            New Project
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon total">📊</div>
          <div className="stat-content">
            <h3>Total Projects</h3>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-subtext">of {stats.total} total</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon completed">✅</div>
          <div className="stat-content">
            <h3>Completed</h3>
            <div className="stat-value">{stats.completed}</div>
            <div className="stat-subtext">Completed projects</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon active">🔄</div>
          <div className="stat-content">
            <h3>Active</h3>
            <div className="stat-value">{stats.active}</div>
            <div className="stat-subtext">Currently active</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon overdue">⚠️</div>
          <div className="stat-content">
            <h3>Overdue</h3>
            <div className="stat-value">{stats.overdue}</div>
            <div className="stat-subtext">Need attention</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-main">
        <div className="projects-section">
          <div className="section-header">
            <h2>Project Overview</h2>
            <div className="section-actions">
              <button className="btn-ghost">View all</button>
            </div>
          </div>

          <div className="projects-grid">
            {projects.length === 0 ? (
              <div className="no-projects">
                <div className="empty-state">
                  <div className="empty-icon">📁</div>
                  <h3>No projects yet</h3>
                  <p>Create your first project to get started</p>
                  <button 
                    className="btn-primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create Project
                  </button>
                </div>
              </div>
            ) : (
              projects.map(project => (
                <div key={project.id} className="project-card">
                  <div className="project-header">
                    <div className="project-title">
                      <h3>{project.name}</h3>
                      <span 
                        className="project-status"
                        style={{ backgroundColor: getStatusColor(project.status) }}
                      >
                        {getStatusText(project.status)}
                      </span>
                    </div>
                    <div className="project-actions">
                      <button 
                        className="btn-icon"
                        onClick={() => setEditingProject(project)}
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button 
                        className="btn-icon"
                        onClick={() => handleDeleteProject(project.id)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  {/* Customer Info */}
                  {project.customer && (
                    <div className="project-customer">
                      <span className="customer-label">Customer:</span>
                      <span className="customer-name">{project.customer}</span>
                    </div>
                  )}
                  
                  <p className="project-description">
                    {project.description || 'No description provided'}
                  </p>
                  
                  {/* Project Details */}
                  <div className="project-details">
                    {project.start_date && (
                      <span className="project-date">Start: {formatDate(project.start_date)}</span>
                    )}
                    {project.end_date && (
                      <span className="project-date">End: {formatDate(project.end_date)}</span>
                    )}
                    {/* {project.budget && (
                      <span className="project-budget">Budget: {formatCurrency(project.budget)}</span>
                    )} */}
                    {project.priority && (
                      <span 
                        className="project-priority" 
                        style={{ color: getPriorityColor(project.priority) }}
                      >
                        {project.priority.toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  <div className="project-footer">
                    <div className="project-meta">
                      <span className="members">
                        👥 {project.collaborators_count || 0} members
                      </span>
                      <span className="date">
                        📅 {new Date(project.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="project-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill"
                          style={{ width: project.progress ? `${project.progress}%` : '0%' }}
                        ></div>
                      </div>
                      <span className="progress-text">
                        {project.progress || 0}%
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="dashboard-sidebar">
          {/* Recent Activity */}
          <div className="sidebar-card">
            <h3>Recent Activity</h3>
            <div className="activity-list">
              {projects.slice(0, 3).map(project => (
                <div key={project.id} className="activity-item">
                  <div className="activity-icon">📝</div>
                  <div className="activity-content">
                    <p><strong>{project.name}</strong> was updated</p>
                    <small>2 hours ago</small>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="sidebar-card">
            <h3>Quick Actions</h3>
            <div className="quick-actions">
              <button className="action-btn">
                <span className="action-icon">📊</span>
                Generate Report
              </button>
              <button className="action-btn">
                <span className="action-icon">👥</span>
                Add Team Member
              </button>
              <button className="action-btn">
                <span className="action-icon">📅</span>
                Schedule Meeting
              </button>
            </div>
          </div>

          {/* Team Overview */}
          <div className="sidebar-card">
            <h3>Team Overview</h3>
            <div className="team-stats">
              <div className="team-stat">
                <span className="stat-label">Active Members</span>
                <span className="stat-value">12</span>
              </div>
              <div className="team-stat">
                <span className="stat-label">Available</span>
                <span className="stat-value">8</span>
              </div>
              <div className="team-stat">
                <span className="stat-label">On Leave</span>
                <span className="stat-value">2</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Create New Project</h2>
              <button 
                className="btn-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              {/* Project Name */}
              <div className="form-group">
                <label>Project Name *</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                  placeholder="Enter project name"
                  required
                />
              </div>

              {/* Customer Name Dropdown */}
              <div className="form-group">
                <label>Customer Name *</label>
                <select
                  value={newProject.customer || ''}
                  onChange={(e) => setNewProject({...newProject, customer: e.target.value})}
                  required
                  className="customer-select"
                >
                  <option value="">Select Customer</option>
                  <option value="CEE DEE">CEE DEE</option>
                  <option value="ABC Corporation">ABC Corporation</option>
                  <option value="XYZ Industries">XYZ Industries</option>
                  <option value="Global Tech Solutions">Global Tech Solutions</option>
                  <option value="Prime Construction">Prime Construction</option>
                  <option value="Infra Builders">Infra Builders</option>
                  <option value="Tech Innovators Ltd">Tech Innovators Ltd</option>
                  <option value="Mega Projects Inc">Mega Projects Inc</option>
                  <option value="City Development Authority">City Development Authority</option>
                  <option value="Other">Other (Specify in Description)</option>
                </select>
              </div>

              {/* Description */}
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                  placeholder="Describe your project, include customer details if 'Other' is selected"
                  rows="4"
                />
              </div>

              {/* Project Details */}
              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={newProject.status}
                    onChange={(e) => setNewProject({...newProject, status: e.target.value})}
                  >
                    <option value="active">Active</option>
                    <option value="planning">Planning</option>
                    <option value="on-hold">On Hold</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <select
                    value={newProject.priority || 'medium'}
                    onChange={(e) => setNewProject({...newProject, priority: e.target.value})}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Additional Fields */}
              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={newProject.startDate || ''}
                    onChange={(e) => setNewProject({...newProject, startDate: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>Estimated End Date</label>
                  <input
                    type="date"
                    value={newProject.endDate || ''}
                    onChange={(e) => setNewProject({...newProject, endDate: e.target.value})}
                  />
                </div>
              </div>

              {/* Budget (Optional) */}
              <div className="form-group">
                <label>Budget (Optional)</label>
                <input
                  type="number"
                  value={newProject.budget || ''}
                  onChange={(e) => setNewProject({...newProject, budget: e.target.value})}
                  placeholder="Enter project budget"
                  min="0"
                />
              </div>

              <div className="modal-actions">
                <button 
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="btn-primary"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Edit Project</h2>
              <button 
                className="btn-close"
                onClick={() => setEditingProject(null)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleUpdateProject}>
              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({...editingProject, name: e.target.value})}
                  placeholder="Enter project name"
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={editingProject.description}
                  onChange={(e) => setEditingProject({...editingProject, description: e.target.value})}
                  placeholder="Describe your project"
                  rows="4"
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select
                  value={editingProject.status || 'active'}
                  onChange={(e) => setEditingProject({...editingProject, status: e.target.value})}
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="on-hold">On Hold</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              <div className="modal-actions">
                <button 
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingProject(null)}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="btn-primary"
                >
                  Update Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ManagerProjectDashboard
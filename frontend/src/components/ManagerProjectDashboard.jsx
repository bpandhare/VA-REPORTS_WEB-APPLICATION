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
  // State declarations
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    active: 0,
    overdue: 0
  })
  const [newProject, setNewProject] = useState({
    name: '',
    customer: '',
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
      const userRes = await getUserInfo()
      if (userRes.data?.success) {
        setUserInfo(userRes.data)
      }
      await fetchProjects()
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

 // In ManagerProjectDashboard.jsx, update the fetchProjects function
const fetchProjects = async () => {
  try {
    console.log('📡 Fetching projects...');
    
    // Try real API first
    const res = await listProjects();
    console.log('Real API response:', res.data);
    
    if (res.data?.success) {
      const projectsData = res.data.projects || [];
      console.log(`✅ Got ${projectsData.length} projects from real API`);
      
      // Check if any projects are missing customer field
      const projectsWithCustomer = projectsData.map(project => ({
        ...project,
        customer: project.customer || 'Not specified' // Default value
      }));
      
      setProjects(projectsWithCustomer);
      
      // Calculate stats
      const total = projectsWithCustomer.length;
      const completed = projectsWithCustomer.filter(p => p.status === 'completed').length;
      const active = projectsWithCustomer.filter(p => p.status === 'active').length;
      const overdue = projectsWithCustomer.filter(p => p.status === 'overdue').length;
      
      setStats({ total, completed, active, overdue });
      
    } else {
      console.warn('Real API returned unsuccessful, using mock data');
      // Fallback to showing mock data if real API fails
      await loadMockProjects();
    }
  } catch (error) {
    console.error('Failed to fetch projects from real API:', error);
    // Load mock projects as fallback
    await loadMockProjects();
  }
};

const loadMockProjects = async () => {
  try {
    const mockRes = await listProjects(); // This will use mock mode now
    if (mockRes.data?.success) {
      const mockProjects = mockRes.data.projects || [];
      console.log(`🛠️ Loaded ${mockProjects.length} mock projects`);
      setProjects(mockProjects);
      
      // Calculate stats for mock projects
      const total = mockProjects.length;
      const completed = mockProjects.filter(p => p.status === 'completed').length;
      const active = mockProjects.filter(p => p.status === 'active').length;
      const overdue = mockProjects.filter(p => p.status === 'overdue').length;
      
      setStats({ total, completed, active, overdue });
    }
  } catch (mockError) {
    console.error('Failed to load mock projects:', mockError);
  }
};

// Add a button to sync mock data to real database when backend is fixed
const syncMockToDatabase = async () => {
  if (!window.confirm('This will attempt to save all mock projects to the real database. Continue?')) return;
  
  try {
    // Get mock projects from localStorage
    const mockProjectsStr = localStorage.getItem('mock_projects');
    if (!mockProjectsStr) {
      alert('No mock projects found');
      return;
    }
    
    const mockProjects = JSON.parse(mockProjectsStr);
    
    // Try to save each project to real database
    let successCount = 0;
    let failCount = 0;
    
    for (const project of mockProjects) {
      try {
        // Prepare data for real API (remove mock-only fields)
        const { id, created_at, updated_at, ...projectData } = project;
        await createProject(projectData);
        successCount++;
      } catch (error) {
        console.error(`Failed to sync project ${project.name}:`, error);
        failCount++;
      }
    }
    
    alert(`Sync complete:\n✅ ${successCount} projects synced\n❌ ${failCount} failed\n\nRefresh to see updated list.`);
    
    // Refresh the project list
    fetchProjects();
    
  } catch (error) {
    console.error('Sync failed:', error);
    alert('Sync failed: ' + error.message);
  }
};
  const handleCreateProject = async (e) => {
    e.preventDefault()
    try {
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
      
      console.log('Sending project data:', projectData) // Debug
      
      const res = await createProject(projectData)
      console.log('Create response:', res.data) // Debug
      
      if (res.data?.success) {
        alert('Project created successfully!')
        setShowCreateModal(false)
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
        // Refresh projects
        await fetchProjects()
      } else {
        alert('Failed to create project: ' + (res.data?.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to create project:', error)
      alert('Failed to create project. Please check console for details.')
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
      case 'active': return '#10B981'
      case 'completed': return '#3B82F6'
      case 'overdue': return '#EF4444'
      default: return '#6B7280'
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

  const getPriorityColor = (priority) => {
    switch(priority?.toLowerCase()) {
      case 'low': return '#4CAF50'
      case 'medium': return '#FF9800'
      case 'high': return '#F44336'
      case 'urgent': return '#9C27B0'
      default: return '#757575'
    }
  }

  const formatCurrency = (amount) => {
    if (!amount) return 'Not set'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

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
          <p className="subtitle">Manage your projects and team</p>
        </div>
        <div className="header-right">
          <button 
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
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
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon completed">✅</div>
          <div className="stat-content">
            <h3>Completed</h3>
            <div className="stat-value">{stats.completed}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon active">🔄</div>
          <div className="stat-content">
            <h3>Active</h3>
            <div className="stat-value">{stats.active}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon overdue">⚠️</div>
          <div className="stat-content">
            <h3>Overdue</h3>
            <div className="stat-value">{stats.overdue}</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-main">
        <div className="projects-section">
          <div className="section-header">
            <h2>All Projects ({projects.length})</h2>
            <div className="section-actions">
              <button 
                className="btn-refresh"
                onClick={() => fetchProjects()}
                title="Refresh projects"
              >
                🔄 Refresh
              </button>
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
                  
                  {/* CUSTOMER FIELD - Now always visible */}
                  <div className="project-meta-row">
                    <div className="meta-item">
                      <span className="meta-icon">🏢</span>
                      <span className="meta-label">Customer:</span>
                      <span className="meta-value">{project.customer || 'Not specified'}</span>
                    </div>
                  </div>
                  
                  <p className="project-description">
                    {project.description || 'No description provided'}
                  </p>
                  
                  {/* Project Details */}
                  <div className="project-details-grid">
                    <div className="detail-item">
                      <span className="detail-label">Start Date:</span>
                      <span className="detail-value">{formatDate(project.start_date)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">End Date:</span>
                      <span className="detail-value">{formatDate(project.end_date)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Budget:</span>
                      <span className="detail-value">{formatCurrency(project.budget)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Priority:</span>
                      <span 
                        className="detail-value priority-badge"
                        style={{ 
                          color: getPriorityColor(project.priority),
                          backgroundColor: `${getPriorityColor(project.priority)}20`
                        }}
                      >
                        {project.priority?.toUpperCase() || 'MEDIUM'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="project-footer">
                    <div className="project-meta">
                      <span className="members">
                        👥 {project.collaborators_count || 0} members
                      </span>
                      <span className="date">
                        📅 {formatDate(project.created_at)}
                      </span>
                    </div>
                    <div className="project-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill"
                          style={{ width: `${project.progress || 0}%` }}
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
          <div className="sidebar-card">
            <h3>Customer Summary</h3>
            <div className="customer-summary">
              <div className="summary-item">
                <span>Projects with Customers:</span>
                <span className="summary-value">
                  {projects.filter(p => p.customer && p.customer.trim() !== '').length}
                </span>
              </div>
              <div className="summary-item">
                <span>Unique Customers:</span>
                <span className="summary-value">
                  {new Set(projects.filter(p => p.customer).map(p => p.customer)).size}
                </span>
              </div>
            </div>
          </div>

          <div className="sidebar-card">
            <h3>Recent Customers</h3>
            <div className="recent-customers">
              {projects
                .filter(p => p.customer)
                .slice(0, 3)
                .map((project, index) => (
                  <div key={index} className="customer-item">
                    <div className="customer-info">
                      <span className="customer-name">{project.customer}</span>
                      <span className="project-name">{project.name}</span>
                    </div>
                  </div>
                ))}
              {projects.filter(p => p.customer).length === 0 && (
                <p className="no-data">No customers yet</p>
              )}
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

              <div className="form-group">
                <label>Customer Name *</label>
                <select
                  value={newProject.customer}
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
                  <option value="Other">Other</option>
                </select>
              </div>

              {newProject.customer === 'Other' && (
                <div className="form-group">
                  <label>Specify Customer Name *</label>
                  <input
                    type="text"
                    value={newProject.otherCustomer || ''}
                    onChange={(e) => setNewProject({...newProject, otherCustomer: e.target.value})}
                    placeholder="Enter customer name"
                    required={newProject.customer === 'Other'}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                  placeholder="Describe your project..."
                  rows="3"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={newProject.status}
                    onChange={(e) => setNewProject({...newProject, status: e.target.value})}
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on-hold">On Hold</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <select
                    value={newProject.priority}
                    onChange={(e) => setNewProject({...newProject, priority: e.target.value})}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={newProject.startDate}
                    onChange={(e) => setNewProject({...newProject, startDate: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={newProject.endDate}
                    onChange={(e) => setNewProject({...newProject, endDate: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Budget (₹)</label>
                <input
                  type="number"
                  value={newProject.budget}
                  onChange={(e) => setNewProject({...newProject, budget: e.target.value})}
                  placeholder="Enter budget amount"
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
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Customer Name</label>
                <select
                  value={editingProject.customer || ''}
                  onChange={(e) => setEditingProject({...editingProject, customer: e.target.value})}
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
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={editingProject.description}
                  onChange={(e) => setEditingProject({...editingProject, description: e.target.value})}
                  rows="3"
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editingProject.status}
                    onChange={(e) => setEditingProject({...editingProject, status: e.target.value})}
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on-hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Priority</label>
                  <select
                    value={editingProject.priority}
                    onChange={(e) => setEditingProject({...editingProject, priority: e.target.value})}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={editingProject.start_date?.split('T')[0] || ''}
                    onChange={(e) => setEditingProject({...editingProject, start_date: e.target.value})}
                  />
                </div>
                
                <div className="form-group">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={editingProject.end_date?.split('T')[0] || ''}
                    onChange={(e) => setEditingProject({...editingProject, end_date: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label>Budget (₹)</label>
                <input
                  type="number"
                  value={editingProject.budget || ''}
                  onChange={(e) => setEditingProject({...editingProject, budget: e.target.value})}
                  min="0"
                />
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
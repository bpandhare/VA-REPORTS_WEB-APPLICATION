import React, { useState, useEffect } from 'react'
import { 
  listProjects, 
  createProject, 
  updateProject, 
  deleteProject,
  getUserInfo,
  // Add these imports for tasks
  getProjectTasks,
  updateTaskStatus
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
  const [currentTime, setCurrentTime] = useState('')
  const [projectTasks, setProjectTasks] = useState({}) // Store tasks for each project

  // Update current time every minute
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const options = { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }
      const timeString = now.toLocaleDateString('en-IN', options)
      setCurrentTime(timeString)
    }
    
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [])

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

  const fetchProjects = async () => {
    try {
      console.log('📡 Fetching projects...');
      
      const res = await listProjects();
      console.log('API response:', res.data);
      
      if (res.data?.success) {
        const projectsData = res.data.projects || [];
        console.log(`✅ Got ${projectsData.length} projects`);
        
        // DEBUG: Log all project fields
        projectsData.forEach((project, index) => {
          console.log(`Project ${index + 1} - ${project.name}:`, {
            id: project.id,
            name: project.name,
            customer: project.customer,
            customerFieldExists: 'customer' in project,
            allKeys: Object.keys(project)
          });
        });

        // Fetch tasks for each project to calculate status
        const projectsWithTasks = await Promise.all(
          projectsData.map(async (project) => {
            // Fetch tasks for this project
            let projectTaskData = { tasks: [], completionPercentage: 0 };
            try {
              const tasksRes = await getProjectTasks(project.id);
              if (tasksRes.data?.success) {
                projectTaskData = {
                  tasks: tasksRes.data.tasks || [],
                  completionPercentage: tasksRes.data.stats?.completionPercentage || 0
                };
                
                // Update project status based on task completion
                let calculatedStatus = project.status;
                
                // If all tasks are completed, set project to "completed"
                if (projectTaskData.tasks.length > 0 && 
                    projectTaskData.tasks.every(task => task.status === 'completed')) {
                  calculatedStatus = 'completed';
                  
                  // Update project status in backend if it's not already completed
                  if (project.status !== 'completed') {
                    try {
                      await updateProject(project.id, { status: 'completed' });
                    } catch (updateError) {
                      console.error('Failed to update project status:', updateError);
                    }
                  }
                }
                // If some tasks are completed but not all, and project is marked as completed, revert to active
                else if (project.status === 'completed' && 
                         projectTaskData.tasks.some(task => task.status !== 'completed')) {
                  calculatedStatus = 'active';
                  
                  // Update project status in backend
                  try {
                    await updateProject(project.id, { status: 'active' });
                  } catch (updateError) {
                    console.error('Failed to update project status:', updateError);
                  }
                }
                
                // Update project with new status
                return {
                  ...project,
                  // IMPORTANT: Check for different possible field names
                  customer: project.customer || project.Customer || 'Not specified',
                  description: project.description || getMockDescription(project.name),
                  status: calculatedStatus,
                  tasks: projectTaskData.tasks,
                  completionPercentage: projectTaskData.completionPercentage
                };
              }
            } catch (taskError) {
              console.error(`Failed to fetch tasks for project ${project.id}:`, taskError);
            }
            
            return {
              ...project,
              // IMPORTANT: Check for different possible field names
              customer: project.customer || project.Customer || 'Not specified',
              description: project.description || getMockDescription(project.name),
              tasks: [],
              completionPercentage: 0
            };
          })
        );
        
        setProjects(projectsWithTasks);
        
        // Calculate stats based on updated statuses
        const total = projectsWithTasks.length;
        const completed = projectsWithTasks.filter(p => 
          p.status === 'completed' || p.is_completed === true
        ).length;
        const active = projectsWithTasks.filter(p => p.status === 'active').length;
        const overdue = projectsWithTasks.filter(p => p.status === 'overdue').length;
        
        setStats({ total, completed, active, overdue });
        
      } else {
        // Load fallback projects
        loadFallbackProjects();
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      loadFallbackProjects();
    }
  };

  // Function to fetch tasks for a specific project
  const fetchProjectTasks = async (projectId) => {
    try {
      const tasksRes = await getProjectTasks(projectId);
      if (tasksRes.data?.success) {
        setProjectTasks(prev => ({
          ...prev,
          [projectId]: {
            tasks: tasksRes.data.tasks || [],
            completionPercentage: tasksRes.data.stats?.completionPercentage || 0
          }
        }));
        return tasksRes.data.tasks || [];
      }
      return [];
    } catch (error) {
      console.error(`Failed to fetch tasks for project ${projectId}:`, error);
      return [];
    }
  };

  // Function to update task status and recalculate project status
  const handleTaskStatusUpdate = async (projectId, taskId, newStatus) => {
    try {
      const response = await updateTaskStatus(projectId, taskId, { status: newStatus });
      
      if (response.data?.success) {
        // Refresh project tasks and recalculate status
        await fetchProjectTasks(projectId);
        
        // Update projects list to reflect new status
        setProjects(prevProjects => 
          prevProjects.map(project => {
            if (project.id === projectId) {
              // Find and update the specific task
              const updatedTasks = project.tasks?.map(task => 
                task.id === taskId ? { ...task, status: newStatus } : task
              ) || [];
              
              // Check if all tasks are now completed
              const allTasksCompleted = updatedTasks.length > 0 && 
                updatedTasks.every(task => task.status === 'completed');
              
              // Update project status if needed
              let newProjectStatus = project.status;
              if (allTasksCompleted && project.status !== 'completed') {
                newProjectStatus = 'completed';
                // Update in backend
                updateProject(projectId, { status: 'completed' });
              } else if (!allTasksCompleted && project.status === 'completed') {
                newProjectStatus = 'active';
                // Update in backend
                updateProject(projectId, { status: 'active' });
              }
              
              return {
                ...project,
                status: newProjectStatus,
                tasks: updatedTasks,
                completionPercentage: updatedTasks.length > 0 ? 
                  Math.round((updatedTasks.filter(t => t.status === 'completed').length / updatedTasks.length) * 100) : 0
              };
            }
            return project;
          })
        );
        
        // Refresh stats
        fetchProjects();
      }
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  };

  const loadFallbackProjects = () => {
    const fallbackProjects = [
      {
        id: 1,
        name: 'ABC',
        customer: 'ABC Corporation',
        description: 'Bridge construction project',
        status: 'active',
        priority: 'medium',
        collaborators_count: 3,
        created_at: new Date().toISOString(),
        is_completed: false,
        completionPercentage: 65
      },
      {
        id: 2,
        name: 'test',
        customer: 'CEE-DEE',
        description: 'PLC automation testing',
        status: 'active',
        priority: 'medium',
        collaborators_count: 1,
        created_at: new Date().toISOString(),
        is_completed: false,
        completionPercentage: 30
      },
      {
        id: 3,
        name: 'VICKHARDTH',
        customer: 'Tech Innovators Ltd',
        description: 'Daily reporting hub for site engineers',
        status: 'active',
        priority: 'high',
        collaborators_count: 2,
        created_at: new Date().toISOString(),
        is_completed: false,
        completionPercentage: 45
      }
    ];
    
    setProjects(fallbackProjects);
    setStats({
      total: 3,
      completed: 0,
      active: 3,
      overdue: 0
    });
  };

  const getMockDescription = (projectName) => {
    const descriptions = {
      'ABC': 'Bridge construction project',
      'test': 'PLC automation testing',
      'VICKHARDTH': 'Daily reporting hub for site engineers'
    };
    return descriptions[projectName] || 'Project description';
  };

  const handleCreateProject = async (e) => {
    e.preventDefault()
    try {
      const projectData = {
        name: newProject.name,
        customer: newProject.customer === 'Other' ? newProject.otherCustomer : newProject.customer,
        description: newProject.description,
        status: newProject.status,
        priority: newProject.priority,
        start_date: newProject.startDate || null,
        end_date: newProject.endDate || null,
        budget: newProject.budget || null
      }
      
      console.log('Sending project data:', projectData)
      
      const res = await createProject(projectData)
      console.log('Create response:', res.data)
      
      if (res.data?.success) {
        alert('✅ Project created successfully!')
        setShowCreateModal(false)
        setNewProject({
          name: '',
          customer: '',
          otherCustomer: '',
          description: '',
          status: 'active',
          priority: 'medium',
          startDate: '',
          endDate: '',
          budget: ''
        })
        await fetchProjects() // Refresh projects list to show new project with customer
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
        fetchProjects() // Refresh projects to get updated status
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
      case 'planning': return '#F59E0B'
      case 'on-hold': return '#6B7280'
      default: return '#6B7280'
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

  // Get day name and date
  const getDayAndDate = () => {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[now.getDay()];
    
    const dateStr = now.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    
    const timeStr = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    
    return `${dayName}\n${dateStr}, ${timeStr}`;
  };

  // Function to render project status with task completion
  const renderProjectStatus = (project) => {
    const statusColor = getStatusColor(project.status);
    const tasksForProject = project.tasks || projectTasks[project.id]?.tasks || [];
    const completionPercentage = project.completionPercentage || 
                                 projectTasks[project.id]?.completionPercentage || 0;
    
    return (
      <div className="project-status-container">
        <div className="status-row">
          <span className="status-label">Status:</span>
          <span 
            className="status-badge" 
            style={{ 
              backgroundColor: `${statusColor}20`, 
              color: statusColor,
              border: `1px solid ${statusColor}`
            }}
          >
            {project.status?.toUpperCase()}
          </span>
        </div>
        
        {tasksForProject.length > 0 && (
          <div className="completion-row">
            <span className="completion-label">Task Completion:</span>
            <div className="completion-bar">
              <div 
                className="completion-fill" 
                style={{ width: `${completionPercentage}%` }}
              ></div>
            </div>
            <span className="completion-text">{completionPercentage}%</span>
          </div>
        )}
        
        <div className="tasks-summary">
          <small>
            {tasksForProject.length} total tasks • 
            {tasksForProject.filter(t => t.status === 'completed').length} completed • 
            {tasksForProject.filter(t => t.status === 'in_progress').length} in progress
          </small>
        </div>
      </div>
    );
  };

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
      {/* Header matching your image */}
      <div className="dashboard-header">
        <div className="header-top">
          <div className="user-info">
            <h1 className="user-name">Vishal</h1>
            <div className="user-role">Manager ID: 16</div>
          </div>
          <div className="date-time">
            <div className="current-day-date">
              {getDayAndDate().split('\n').map((line, index) => (
                <div key={index}>{line}</div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="welcome-section">
          <h2>Welcome back, Vishal</h2>
          <p className="subtitle">Here's what's happening with your projects today</p>
        </div>
      </div>

      {/* Main Content - Grid layout like your image */}
      <div className="dashboard-main-grid">
        {/* Left Column - Projects */}
        <div className="projects-column">
          {/* Projects List */}
          <div className="projects-list">
            {projects.map(project => (
              <div key={project.id} className="project-item">
                <div className="project-header">
                  <div className="project-title-section">
                    <h3 className="project-name">{project.name}</h3>
                    <div className="project-customer-info">
                      <div className="customer-label">CUSTOMER</div>
                      <div className="customer-value">{project.customer}</div>
                    </div>
                  </div>
                  <div className="project-actions">
                    <button 
                      className="btn-icon-small"
                      onClick={() => setEditingProject(project)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button 
                      className="btn-icon-small"
                      onClick={() => handleDeleteProject(project.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                
                <p className="project-description">
                  {project.description}
                </p>
                
                {/* Project Status and Task Completion */}
                {renderProjectStatus(project)}
                
                <div className="project-meta">
                  <span className="members-count">
                    👥 {project.collaborators_count || 0} members
                  </span>
                  <div className="project-action-buttons">
                    <button 
                      className="btn-action"
                      onClick={() => {
                        // Navigate to project details or open task modal
                        console.log('View details for project:', project.id);
                      }}
                    >
                      View Details
                    </button>
                    <button 
                      className="btn-action"
                      onClick={() => setEditingProject(project)}
                    >
                      Edit
                    </button>
                    <button 
                      className="btn-action"
                      onClick={() => handleDeleteProject(project.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Summary Card */}
            <div className="summary-card">
              <h3 className="summary-title">Summary</h3>
              <div className="summary-stats">
                <div className="summary-stat">
                  <span className="stat-label">Total Projects</span>
                  <span className="stat-value">{stats.total}</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Completed</span>
                  <span className="stat-value">{stats.completed}</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Active</span>
                  <span className="stat-value">{stats.active}</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Overdue</span>
                  <span className="stat-value">{stats.overdue}</span>
                </div>
              </div>
            </div>
            
            {/* New Project Card */}
            <div className="new-project-card">
              <h3 className="new-project-title">New Project</h3>
              <p>Start a new project to track your work</p>
              <button 
                className="btn-new-project"
                onClick={() => setShowCreateModal(true)}
              >
                + Create New Project
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Tools & Reports */}
        <div className="tools-column">
          {/* Time Tracking Card */}
          <div className="tool-card">
            <h3 className="tool-title">TIME TRACKING</h3>
            <div className="tool-content">
              <div className="tool-item">
                <span className="tool-item-name">Time Tracker</span>
                <span className="tool-badge">NEW</span>
              </div>
            </div>
          </div>

          {/* Reports Card */}
          <div className="tool-card">
            <h3 className="tool-title">REPORTS</h3>
            <div className="tool-content">
              <div className="tool-item">
                <span className="tool-item-name">Hourly Report</span>
              </div>
              <div className="tool-item">
                <span className="tool-item-name">Daily Target Report</span>
              </div>
            </div>
          </div>

          {/* Monitoring Card */}
          <div className="tool-card">
            <h3 className="tool-title">MONITORING</h3>
            <div className="tool-content">
              <div className="tool-item">
                <span className="tool-item-name">View Activities</span>
                <span className="tool-tag">(vii)</span>
              </div>
            </div>
          </div>

          {/* Weather Widget */}
          <div className="weather-card">
            <div className="weather-info">
              <div className="weather-temp">30°C</div>
              <div className="weather-location">Surrey</div>
            </div>
            <div className="weather-icon">☀️</div>
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
                <input
                  type="text"
                  value={editingProject.customer || ''}
                  onChange={(e) => setEditingProject({...editingProject, customer: e.target.value})}
                  placeholder="Enter customer name"
                  required
                />
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

      {/* Debug Information */}
      <div className="debug-panel">
        <h4>Debug Information</h4>
        <p>Total Projects: {projects.length}</p>
        {projects.map((project, index) => (
          <div key={project.id} className="debug-project">
            <p><strong>Project {index + 1}:</strong> {project.name}</p>
            <p><strong>Customer Field:</strong> "{project.customer}"</p>
            <p><strong>Has Customer:</strong> {!!project.customer ? 'Yes' : 'No'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ManagerProjectDashboard
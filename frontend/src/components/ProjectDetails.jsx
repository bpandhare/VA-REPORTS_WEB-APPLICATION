import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  getProject, 
  getCollaborators, 
  addProjectFile, 
  getProjectFiles, 
  updateProjectStatus, 
  deleteProjectFile,
  getProjectTasks,
  createTask,
  updateTaskStatus
} from '../services/api'
import { useAuth } from './AuthContext'
import './ProjectDetails.css'

const ProjectDetails = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [project, setProject] = useState(null)
  const [collaborators, setCollaborators] = useState([])
  const [files, setFiles] = useState([])
  const [tasks, setTasks] = useState([])
  const [taskStats, setTaskStats] = useState({ 
    completionPercentage: 0,
    total: 0,
    completed: 0,
    inProgress: 0,
    pending: 0,
    blocked: 0
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [newFile, setNewFile] = useState({
    name: '',
    description: '',
    file: null
  })
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assigned_to: '',
    priority: 'medium',
    due_date: ''
  })

  useEffect(() => {
    console.log('ProjectDetails mounted with ID:', id)
    console.log('Current user:', user)
    fetchProjectDetails()
  }, [id])

  const fetchProjectDetails = async () => {
    try {
      setLoading(true)
      setError('')
      console.log('Starting to fetch project details for ID:', id)
      
      // Fetch all data in parallel
      const [projectRes, collaboratorsRes, filesRes, tasksRes] = await Promise.all([
        getProject(id).catch(err => {
          console.error('getProject error:', err)
          return { data: { success: false, message: 'Failed to fetch project' } }
        }),
        getCollaborators(id).catch(err => {
          console.error('getCollaborators error:', err)
          return { data: { success: false, message: 'Failed to fetch collaborators' } }
        }),
        getProjectFiles(id).catch(err => {
          console.error('getProjectFiles error:', err)
          return { data: { success: false, message: 'Failed to fetch files' } }
        }),
        getProjectTasks(id).catch(err => {
          console.error('getProjectTasks error:', err)
          return { data: { success: false, message: 'Failed to fetch tasks' } }
        })
      ])

      console.log('Project response:', projectRes.data)
      console.log('Collaborators response:', collaboratorsRes.data)
      console.log('Files response:', filesRes.data)
      console.log('Tasks response:', tasksRes.data)

      if (projectRes.data?.success) {
        setProject(projectRes.data.project)
        console.log('Project set successfully:', projectRes.data.project)
      } else {
        console.error('Project API returned failure:', projectRes.data)
        setError(projectRes.data?.message || 'Failed to load project')
      }
      
      if (collaboratorsRes.data?.success) {
        setCollaborators(collaboratorsRes.data.collaborators)
        console.log('Collaborators set:', collaboratorsRes.data.collaborators.length)
      }
      
      if (filesRes.data?.success) {
        setFiles(filesRes.data.files)
        console.log('Files set:', filesRes.data.files.length)
      }
      
      if (tasksRes.data?.success) {
        setTasks(tasksRes.data.tasks)
        setTaskStats(tasksRes.data.stats || { completionPercentage: 0 })
        console.log('Tasks set:', tasksRes.data.tasks.length)
        console.log('Task stats:', tasksRes.data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch project details:', error)
      setError(error.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTask = async (e) => {
    e.preventDefault()
    try {
      await createTask(id, newTask)
      setShowTaskForm(false)
      setNewTask({
        title: '',
        description: '',
        assigned_to: '',
        priority: 'medium',
        due_date: ''
      })
      fetchProjectDetails()
      alert('Task created successfully!')
    } catch (error) {
      console.error('Failed to create task:', error)
      alert('Failed to create task: ' + (error.response?.data?.message || error.message))
    }
  }

  const handleUpdateTaskStatus = async (taskId, newStatus, comment = '') => {
    try {
      await updateTaskStatus(id, taskId, { status: newStatus, comment })
      fetchProjectDetails()
      alert('Task status updated!')
    } catch (error) {
      console.error('Failed to update task:', error)
      alert('Failed to update task status: ' + (error.response?.data?.message || error.message))
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setNewFile(prev => ({
        ...prev,
        file,
        name: file.name
      }))
    }
  }

  const handleFileUpload = async (e) => {
    e.preventDefault()
    if (!newFile.file) {
      alert('Please select a file to upload')
      return
    }

    const formData = new FormData()
    formData.append('file', newFile.file)
    formData.append('name', newFile.name)
    formData.append('description', newFile.description)
    formData.append('projectId', id)
    formData.append('uploadedBy', user.id)

    try {
      setUploading(true)
      const res = await addProjectFile(id, formData)
      if (res.data?.success) {
        setNewFile({ name: '', description: '', file: null })
        document.getElementById('fileInput').value = ''
        fetchProjectDetails()
        alert('File uploaded successfully!')
      } else {
        alert(res.data?.message || 'Upload failed')
      }
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Failed to upload file: ' + (error.response?.data?.message || error.message))
    } finally {
      setUploading(false)
    }
  }

  const handleStatusUpdate = async (newStatus) => {
    if (window.confirm(`Change project status to ${newStatus}?`)) {
      try {
        await updateProjectStatus(id, newStatus)
        fetchProjectDetails()
      } catch (error) {
        console.error('Failed to update status:', error)
        alert('Failed to update project status: ' + (error.response?.data?.message || error.message))
      }
    }
  }

  const handleDownloadFile = (fileUrl, fileName) => {
    const link = document.createElement('a')
    link.href = fileUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDeleteFile = async (fileId) => {
    if (window.confirm('Are you sure you want to delete this file?')) {
      try {
        await deleteProjectFile(id, fileId)
        fetchProjectDetails()
      } catch (error) {
        console.error('Failed to delete file:', error)
        alert('Failed to delete file: ' + (error.response?.data?.message || error.message))
      }
    }
  }

  if (loading) {
    return (
      <div className="project-details-loading">
        <div className="loading-spinner"></div>
        <p>Loading project details...</p>
        {id && <p>Project ID: {id}</p>}
      </div>
    )
  }

  if (!project) {
    return (
      <div className="project-not-found">
        <h2>Project Not Found</h2>
        <p>The project you're looking for doesn't exist or you don't have access.</p>
        {error && <p className="error-message">Error: {error}</p>}
        <div className="debug-info">
          <p>Project ID: {id}</p>
          <p>User ID: {user?.id}</p>
          <p>User Role: {user?.role}</p>
        </div>
        <button onClick={() => navigate('/projects')} className="back-button">
          Back to Projects
        </button>
      </div>
    )
  }

  const isManager = user?.role === 'Manager'
  const isCollaborator = collaborators.some(c => c.user_id === user?.id)

  return (
    <div className="project-details-container">
      {/* Header */}
      <div className="project-header">
        <div className="header-left">
          <button onClick={() => navigate('/projects')} className="back-button">
            ← Back to Projects
          </button>
          <h1>{project.name}</h1>
          <div className="project-meta">
            <span className={`project-status ${project.status || 'active'}`}>
              {project.status?.toUpperCase() || 'ACTIVE'}
            </span>
            <span className="project-id">ID: #{project.id}</span>
            <span className="created-date">
              Created: {project.created_at 
                ? new Date(project.created_at).toLocaleDateString() 
                : 'Date not available'}
            </span>
          </div>
        </div>
        
        {isManager && (
          <div className="status-actions">
            <select 
              value={project.status || 'active'} 
              onChange={(e) => handleStatusUpdate(e.target.value)}
              className="status-select"
            >
              <option value="active">Active</option>
              <option value="in-progress">In Progress</option>
              <option value="on-hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="project-description-section">
        <h3>Description</h3>
        <p>{project.description || 'No description provided.'}</p>
      </div>

      {/* Tabs */}
      <div className="project-tabs">
        <button 
          className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab-button ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          Files ({files.length})
        </button>
        <button 
          className={`tab-button ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          Tasks ({tasks.length})
        </button>
        <button 
          className={`tab-button ${activeTab === 'team' ? 'active' : ''}`}
          onClick={() => setActiveTab('team')}
        >
          Team ({collaborators.length})
        </button>
        {(isManager || isCollaborator) && (
          <button 
            className={`tab-button ${activeTab === 'contribute' ? 'active' : ''}`}
            onClick={() => setActiveTab('contribute')}
          >
            + Contribute
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="stats-grid">
              <div className="stat-card">
                <h4>Team Members</h4>
                <div className="stat-value">{collaborators.length}</div>
                <div className="stat-label">Active collaborators</div>
              </div>
              <div className="stat-card">
                <h4>Files & Documents</h4>
                <div className="stat-value">{files.length}</div>
                <div className="stat-label">Uploaded files</div>
              </div>
              <div className="stat-card">
                <h4>Tasks Progress</h4>
                <div className="stat-value">{taskStats.completionPercentage}%</div>
                <div className="stat-label">{taskStats.completed || 0}/{taskStats.total || 0} completed</div>
              </div>
              <div className="stat-card">
                <h4>Created On</h4>
                <div className="stat-value">
                  {project.created_at 
                    ? new Date(project.created_at).toLocaleDateString()
                    : 'N/A'}
                </div>
                <div className="stat-label">Project start date</div>
              </div>
            </div>

            <div className="recent-files">
              <h3>Recent Files</h3>
              {files.slice(0, 5).map(file => (
                <div key={file.id} className="file-item">
                  <div className="file-icon">📄</div>
                  <div className="file-info">
                    <div className="file-name">{file.name}</div>
                    <div className="file-meta">
                      Uploaded by {file.uploaded_by_name || 'Unknown'} • {file.uploaded_at 
                        ? new Date(file.uploaded_at).toLocaleDateString()
                        : 'Unknown date'}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDownloadFile(file.file_url, file.name)}
                    className="download-button"
                    disabled={!file.file_url}
                  >
                    Download
                  </button>
                </div>
              ))}
              {files.length === 0 && (
                <p className="no-files">No files uploaded yet.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="files-tab">
            <div className="files-header">
              <h3>Project Files</h3>
              <p>All documents and files related to this project</p>
            </div>

            <div className="files-grid">
              {files.map(file => (
                <div key={file.id} className="file-card">
                  <div className="file-header">
                    <div className="file-icon-large">
                      {file.file_type === 'pdf' ? '📕' : 
                       file.file_type === 'image' ? '🖼️' : 
                       file.file_type === 'doc' ? '📝' : '📄'}
                    </div>
                    <div className="file-actions">
                      <button 
                        onClick={() => handleDownloadFile(file.file_url, file.name)}
                        className="icon-button"
                        title="Download"
                        disabled={!file.file_url}
                      >
                        ⬇️
                      </button>
                      {(isManager || file.uploaded_by === user?.id) && (
                        <button 
                          onClick={() => handleDeleteFile(file.id)}
                          className="icon-button delete"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="file-body">
                    <h4 className="file-title">{file.name}</h4>
                    <p className="file-description">{file.description || 'No description'}</p>
                    <div className="file-meta">
                      {file.file_size && <span>Size: {file.file_size}</span>}
                      {file.file_type && <span>Type: {file.file_type}</span>}
                    </div>
                    <div className="file-footer">
                      <span className="uploader">
                        Uploaded by {file.uploaded_by_name || 'Unknown'}
                      </span>
                      <span className="upload-date">
                        {file.uploaded_at 
                          ? new Date(file.uploaded_at).toLocaleDateString()
                          : 'Unknown date'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              
              {files.length === 0 && (
                <div className="empty-files">
                  <div className="empty-icon">📁</div>
                  <h4>No Files Yet</h4>
                  <p>Upload the first file to get started</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="tasks-tab">
            <div className="tasks-header">
              <h3>Project Tasks</h3>
              <div className="tasks-stats">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${taskStats.completionPercentage}%` }}
                  ></div>
                </div>
                <span>{taskStats.completionPercentage}% Complete</span>
                <span>{taskStats.completed || 0} of {taskStats.total || 0} tasks done</span>
              </div>
              
              {isManager && (
                <button 
                  className="create-task-btn"
                  onClick={() => setShowTaskForm(!showTaskForm)}
                >
                  {showTaskForm ? 'Cancel' : '+ Create Task'}
                </button>
              )}
            </div>

            {showTaskForm && isManager && (
              <form onSubmit={handleCreateTask} className="task-form">
                <div className="form-group">
                  <label>Task Title *</label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                    placeholder="Enter task title"
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                    placeholder="Describe the task"
                    rows="3"
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Assign To</label>
                    <select
                      value={newTask.assigned_to}
                      onChange={(e) => setNewTask({...newTask, assigned_to: e.target.value})}
                    >
                      <option value="">Select collaborator</option>
                      {collaborators.map(collab => (
                        <option key={collab.user_id} value={collab.user_id}>
                          {collab.username} ({collab.employee_id})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      value={newTask.priority}
                      onChange={(e) => setNewTask({...newTask, priority: e.target.value})}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>Due Date</label>
                    <input
                      type="date"
                      value={newTask.due_date}
                      onChange={(e) => setNewTask({...newTask, due_date: e.target.value})}
                    />
                  </div>
                </div>
                
                <button type="submit" className="submit-task-btn">
                  Create Task
                </button>
              </form>
            )}

            <div className="tasks-list">
              {tasks.map(task => (
                <div key={task.id} className={`task-card ${task.status}`}>
                  <div className="task-header">
                    <div className="task-title">
                      <h4>{task.title}</h4>
                      <span className={`priority-badge ${task.priority}`}>
                        {task.priority}
                      </span>
                      <span className={`status-badge ${task.status}`}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="task-actions">
                      {(isManager || task.assigned_to === user?.id || task.created_by === user?.id) && (
                        <select 
                          value={task.status}
                          onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                          className="status-select"
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="blocked">Blocked</option>
                          <option value="completed">Completed</option>
                        </select>
                      )}
                    </div>
                  </div>
                  
                  <div className="task-body">
                    <p>{task.description || 'No description'}</p>
                    
                    <div className="task-meta">
                      {task.assigned_to_name && (
                        <span>Assigned to: {task.assigned_to_name}</span>
                      )}
                      {task.due_date && (
                        <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                      )}
                      <span>Created: {new Date(task.created_at).toLocaleDateString()}</span>
                    </div>
                    
                    <div className="task-footer">
                      <span>Updates: {task.updates_count || 0}</span>
                      <span>Attachments: {task.attachments_count || 0}</span>
                      {task.completed_at && (
                        <span>Completed: {new Date(task.completed_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {tasks.length === 0 && (
                <div className="no-tasks">
                  <p>No tasks created yet. {isManager && 'Create the first task!'}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="team-tab">
            <h3>Project Team</h3>
            <div className="team-grid">
              {collaborators.map(collab => (
                <div key={collab.id} className="team-member">
                  <div className="member-avatar">
                    {collab.username?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="member-info">
                    <h4>{collab.username || 'Unknown User'}</h4>
                    <p className="member-role">{collab.role || 'Contributor'}</p>
                    <p className="member-id">ID: {collab.employee_id || collab.user_id || 'N/A'}</p>
                  </div>
                  <div className="member-status">
                    <span className="status-dot"></span>
                    Active
                  </div>
                </div>
              ))}
              {collaborators.length === 0 && (
                <div className="no-collaborators">
                  <p>No collaborators added to this project yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'contribute' && (
          <div className="contribute-tab">
            <h3>Contribute to Project</h3>
            <p>Upload files, documents, or add notes to contribute to this project.</p>

            <form onSubmit={handleFileUpload} className="upload-form">
              <div className="form-group">
                <label>File *</label>
                <input
                  type="file"
                  id="fileInput"
                  onChange={handleFileChange}
                  required
                  className="file-input"
                />
                <small>Supported: PDF, DOC, DOCX, Images, Excel (Max 10MB)</small>
              </div>

              <div className="form-group">
                <label>File Name</label>
                <input
                  type="text"
                  value={newFile.name}
                  onChange={(e) => setNewFile({...newFile, name: e.target.value})}
                  placeholder="Enter a descriptive name"
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newFile.description}
                  onChange={(e) => setNewFile({...newFile, description: e.target.value})}
                  placeholder="Describe what this file contains"
                  rows="4"
                />
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  className="cancel-button"
                  onClick={() => setActiveTab('files')}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="upload-button"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload File'}
                </button>
              </div>
            </form>

            <div className="upload-guidelines">
              <h4>Upload Guidelines:</h4>
              <ul>
                <li>Only upload files related to this project</li>
                <li>Maximum file size: 10MB</li>
                <li>Supported formats: PDF, DOC/DOCX, XLS/XLSX, JPG, PNG</li>
                <li>Name files descriptively for easy reference</li>
                <li>Add descriptions to help team members understand the content</li>
              </ul>
            </div>
          </div>
        )}
      </div>
      
      {/* Debug info - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-info" style={{ marginTop: '20px', padding: '10px', background: '#f5f5f5', borderRadius: '4px' }}>
          <h4>Debug Info:</h4>
          <p>Project ID: {id}</p>
          <p>Project Loaded: {project ? 'Yes' : 'No'}</p>
          <p>User Role: {user?.role}</p>
          <p>Is Manager: {isManager ? 'Yes' : 'No'}</p>
          <p>Is Collaborator: {isCollaborator ? 'Yes' : 'No'}</p>
          <p>Tasks: {tasks.length}</p>
          <p>Completion: {taskStats.completionPercentage}%</p>
          {error && <p>Error: {error}</p>}
        </div>
      )}
    </div>
  )
}
{/* Tabs */}
<div className="project-tabs">
  <button 
    className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
    onClick={() => setActiveTab('overview')}
  >
    Overview
  </button>
  <button 
    className={`tab-button ${activeTab === 'files' ? 'active' : ''}`}
    onClick={() => setActiveTab('files')}
  >
    Files ({files.length})
  </button>
  <button 
    className={`tab-button ${activeTab === 'tasks' ? 'active' : ''}`}
    onClick={() => setActiveTab('tasks')}
  >
    Tasks ({tasks.length})
  </button>
  <button 
    className={`tab-button ${activeTab === 'team' ? 'active' : ''}`}
    onClick={() => setActiveTab('team')}
  >
    Team ({collaborators.length})
  </button>
  {(isManager || isCollaborator) && (
    <button 
      className={`tab-button ${activeTab === 'contribute' ? 'active' : ''}`}
      onClick={() => setActiveTab('contribute')}
    >
      + Contribute
    </button>
  )}
</div>
{activeTab === 'contribute' && (
  <div className="contribute-tab">
    <div className="contribute-header">
      <h2>Contribute to Project</h2>
      <p className="contribute-subtitle">
        Share updates, upload files, or report progress on this project
      </p>
    </div>

    <div className="contribute-options">
      {/* Option 1: Quick Status Update */}
      <div className="contribute-option">
        <div className="option-icon">📝</div>
        <div className="option-content">
          <h4>Quick Status Update</h4>
          <p>Share what you're working on or provide a brief progress update</p>
          <button 
            className="option-button"
            onClick={() => setShowQuickUpdate(true)}
          >
            Add Update
          </button>
        </div>
      </div>

      {/* Option 2: File Upload */}
      <div className="contribute-option">
        <div className="option-icon">📎</div>
        <div className="option-content">
          <h4>Upload File</h4>
          <p>Share documents, images, or other files related to the project</p>
          <button 
            className="option-button"
            onClick={() => setShowFileUpload(true)}
          >
            Upload File
          </button>
        </div>
      </div>

      {/* Option 3: Task Progress */}
      <div className="contribute-option">
        <div className="option-icon">✅</div>
        <div className="option-content">
          <h4>Update Task Progress</h4>
          <p>Mark tasks as complete or update their status</p>
          <button 
            className="option-button"
            onClick={() => setShowTaskUpdate(true)}
          >
            Update Tasks
          </button>
        </div>
      </div>

      {/* Option 4: Add Note/Comment */}
      <div className="contribute-option">
        <div className="option-icon">💬</div>
        <div className="option-content">
          <h4>Add Comment</h4>
          <p>Share thoughts, questions, or feedback about the project</p>
          <button 
            className="option-button"
            onClick={() => setShowCommentForm(true)}
          >
            Add Comment
          </button>
        </div>
      </div>
    </div>

    {/* File Upload Form */}
    {showFileUpload && (
      <div className="contribute-form">
        <div className="form-header">
          <h3>Upload File</h3>
          <button 
            className="close-button"
            onClick={() => setShowFileUpload(false)}
          >
            ×
          </button>
        </div>
        <form onSubmit={handleFileUpload} className="upload-form">
          <div className="form-group">
            <label>File *</label>
            <input
              type="file"
              id="fileInput"
              onChange={handleFileChange}
              required
              className="file-input"
            />
            <small>Supported: PDF, DOC, DOCX, Images, Excel (Max 10MB)</small>
          </div>

          <div className="form-group">
            <label>File Name</label>
            <input
              type="text"
              value={newFile.name}
              onChange={(e) => setNewFile({...newFile, name: e.target.value})}
              placeholder="Enter a descriptive name"
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={newFile.description}
              onChange={(e) => setNewFile({...newFile, description: e.target.value})}
              placeholder="Describe what this file contains"
              rows="4"
            />
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              className="cancel-button"
              onClick={() => setShowFileUpload(false)}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="upload-button"
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        </form>
      </div>
    )}

    {/* Quick Update Form */}
    {showQuickUpdate && (
      <div className="contribute-form">
        <div className="form-header">
          <h3>Quick Status Update</h3>
          <button 
            className="close-button"
            onClick={() => setShowQuickUpdate(false)}
          >
            ×
          </button>
        </div>
        <form onSubmit={handleQuickUpdate} className="update-form">
          <div className="form-group">
            <label>What are you working on? *</label>
            <textarea
              value={quickUpdate}
              onChange={(e) => setQuickUpdate(e.target.value)}
              placeholder="E.g., Completed site inspection, working on report, encountered issue with..."
              rows="4"
              required
            />
          </div>

          <div className="form-group">
            <label>Progress Percentage</label>
            <div className="progress-slider">
              <input
                type="range"
                min="0"
                max="100"
                value={progressPercentage}
                onChange={(e) => setProgressPercentage(e.target.value)}
                className="slider"
              />
              <span className="slider-value">{progressPercentage}%</span>
            </div>
          </div>

          <div className="form-group">
            <label>Status</label>
            <select
              value={updateStatus}
              onChange={(e) => setUpdateStatus(e.target.value)}
            >
              <option value="on_track">On Track</option>
              <option value="at_risk">At Risk</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              className="cancel-button"
              onClick={() => setShowQuickUpdate(false)}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="submit-button"
            >
              Post Update
            </button>
          </div>
        </form>
      </div>
    )}

    {/* Recent Contributions */}
    <div className="recent-contributions">
      <h3>Recent Contributions</h3>
      {recentContributions.length > 0 ? (
        <div className="contributions-list">
          {recentContributions.map(contribution => (
            <div key={contribution.id} className="contribution-item">
              <div className="contribution-icon">
                {contribution.type === 'file' ? '📎' : 
                 contribution.type === 'update' ? '📝' : 
                 contribution.type === 'task' ? '✅' : '💬'}
              </div>
              <div className="contribution-content">
                <div className="contribution-header">
                  <span className="contributor">{contribution.userName}</span>
                  <span className="contribution-type">{contribution.type}</span>
                  <span className="contribution-time">{contribution.time}</span>
                </div>
                <p className="contribution-text">{contribution.content}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="no-contributions">No contributions yet. Be the first to contribute!</p>
      )}
    </div>
  </div>
)}
// Add these to your existing state declarations
const [showQuickUpdate, setShowQuickUpdate] = useState(false)
const [showTaskUpdate, setShowTaskUpdate] = useState(false)
const [showCommentForm, setShowCommentForm] = useState(false)
const [quickUpdate, setQuickUpdate] = useState('')
const [progressPercentage, setProgressPercentage] = useState(0)
const [updateStatus, setUpdateStatus] = useState('on_track')
const [recentContributions, setRecentContributions] = useState([])

// Add this useEffect to fetch recent contributions
useEffect(() => {
  if (activeTab === 'contribute') {
    fetchRecentContributions()
  }
}, [activeTab])

const fetchRecentContributions = async () => {
  try {
    // You'll need to create this API endpoint
    const res = await api.get(`/api/projects/${id}/contributions`)
    if (res.data?.success) {
      setRecentContributions(res.data.contributions)
    }
  } catch (error) {
    console.error('Failed to fetch contributions:', error)
  }
}

const handleQuickUpdate = async (e) => {
  e.preventDefault()
  try {
    const res = await api.post(`/api/projects/${id}/updates`, {
      content: quickUpdate,
      progress: progressPercentage,
      status: updateStatus
    })
    
    if (res.data?.success) {
      alert('Update posted successfully!')
      setQuickUpdate('')
      setProgressPercentage(0)
      setUpdateStatus('on_track')
      setShowQuickUpdate(false)
      fetchRecentContributions()
    }
  } catch (error) {
    console.error('Failed to post update:', error)
    alert('Failed to post update: ' + (error.response?.data?.message || error.message))
  }
}
export default ProjectDetails
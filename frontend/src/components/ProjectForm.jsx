import { useState, useEffect } from 'react'
import { createProject, updateProject } from '../services/api'

export default function ProjectForm({ onCreated, onClose, initial, isManager = false }) {
  const [name, setName] = useState(initial?.name || '')
  const [customer, setCustomer] = useState(initial?.customer || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [collaboratorIds, setCollaboratorIds] = useState(initial?.collaborator_ids || [])
  const [status, setStatus] = useState(initial?.status || 'active')
  const [priority, setPriority] = useState(initial?.priority || 'medium')
  const [startDate, setStartDate] = useState(initial?.start_date || '')
  const [endDate, setEndDate] = useState(initial?.end_date || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Customer options
  const customerOptions = [
    'CEE DEE',
    'ABC Corporation',
    'XYZ Industries',
    'Global Tech Solutions',
    'Prime Construction',
    'Infra Builders',
    'Tech Innovators Ltd',
    'Mega Projects Inc',
    'City Development Authority',
    'Other'
  ]

  useEffect(() => {
    setName(initial?.name || '')
    setCustomer(initial?.customer || '')
    setDescription(initial?.description || '')
    setCollaboratorIds(initial?.collaborator_ids || [])
    setStatus(initial?.status || 'active')
    setPriority(initial?.priority || 'medium')
    setStartDate(initial?.start_date || '')
    setEndDate(initial?.end_date || '')
  }, [initial])

  const isEdit = !!initial?.id

  const handleSubmit = async (e) => {
    e && e.preventDefault()
    setError(null)
    
    // Validation
    if (!name) return setError('Project name is required')
    if (!customer) return setError('Please select a customer')
    
    // Only managers can create projects
    if (!isManager && !isEdit) {
      return setError('Only managers can create new projects')
    }
    
    setLoading(true)
    
    try {
      // Prepare data WITHOUT budget
      const projectData = {
        name: name.trim(),
        customer: customer,
        description: description.trim(),
        status: status,
        priority: priority,
        start_date: startDate || null,
        end_date: endDate || null
      }
      
      // Add collaborators only for new projects
      if (!isEdit && collaboratorIds.length > 0) {
        projectData.collaborator_ids = collaboratorIds
      }
      
      console.log('Submitting project data:', projectData)
      
      let response
      
      if (isEdit) {
        // Update existing project
        response = await updateProject(initial.id, projectData)
      } else {
        // Create new project
        response = await createProject(projectData)
      }
      
      console.log('API Response:', response)
      
      if (response.data?.success) {
        // Reset form
        setName('')
        setCustomer('')
        setDescription('')
        setCollaboratorIds([])
        setStatus('active')
        setPriority('medium')
        setStartDate('')
        setEndDate('')
        
        // Notify parent
        if (onCreated) {
          onCreated(response.data)
        }
        
        // Close modal
        if (onClose) {
          onClose()
        }
        
        alert('✅ Project saved successfully!')
      } else {
        setError(response.data?.message || 'Failed to save project')
      }
    } catch (err) {
      console.error('Full error details:', err)
      console.error('Error response:', err.response)
      
      if (err.response) {
        switch (err.response.status) {
          case 404:
            setError('API endpoint not found (404). Please check if the server is running.')
            break
          case 500:
            setError('Server error (500). Please check server logs.')
            break
          case 401:
            setError('Unauthorized. Please login again.')
            break
          case 403:
            setError('Permission denied. You may not have access.')
            break
          default:
            setError(`Error ${err.response.status}: ${err.response.data?.message || 'Unknown error'}`)
        }
      } else if (err.request) {
        setError('No response from server. Please check if the server is running.')
      } else {
        setError(`Request error: ${err.message}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const showCollaboratorField = isManager && !isEdit
  const showFullForm = isManager

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="projectName">Project Name *</label>
        <input 
          id="projectName"
          type="text"
          value={name} 
          onChange={e => setName(e.target.value)} 
          placeholder="Enter project name" 
          required
          disabled={loading}
        />
      </div>
      
      <div className="form-row">
        <label htmlFor="customer">Customer *</label>
        <select
          id="customer"
          value={customer}
          onChange={e => setCustomer(e.target.value)}
          required
          className="customer-select"
          disabled={loading}
        >
          <option value="">Select a customer</option>
          {customerOptions.map((customerOption, index) => (
            <option key={index} value={customerOption}>
              {customerOption}
            </option>
          ))}
        </select>
      </div>
      
      <div className="form-row">
        <label htmlFor="description">Description</label>
        <textarea 
          id="description"
          value={description} 
          onChange={e => setDescription(e.target.value)} 
          placeholder="Project description..." 
          rows="3"
          disabled={loading}
        />
      </div>
      
      {/* Additional fields for managers */}
      {showFullForm && (
        <>
          <div className="form-row double">
            <div className="form-col">
              <label>Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                disabled={loading}
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on-hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
            <div className="form-col">
              <label>Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                disabled={loading}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          
          <div className="form-row double">
            <div className="form-col">
              <label>Start Date</label>
              <input 
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="form-col">
              <label>End Date</label>
              <input 
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </>
      )}
      
      {/* Collaborator field (only for new projects by managers) */}
      {showCollaboratorField && (
        <div className="form-row">
          <label htmlFor="collaborators">Add Collaborators (Optional)</label>
          <input 
            id="collaborators"
            type="text"
            value={collaboratorIds.join(', ')}
            onChange={e => setCollaboratorIds(e.target.value.split(',').map(id => id.trim()).filter(id => id))}
            placeholder="Enter employee IDs or usernames separated by commas"
            disabled={loading}
          />
          <div className="form-help">
            This project will be added to the dashboard of each collaborator
          </div>
        </div>
      )}
      
      {error && (
        <div className="form-error">
          <strong>Error:</strong> {error}
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
            <strong>Troubleshooting steps:</strong>
            <ol style={{ margin: '5px 0', paddingLeft: '20px' }}>
              <li>Check if backend server is running</li>
              <li>Verify API endpoint exists: /api/projects</li>
              <li>Check browser console for network errors</li>
              <li>Verify authentication token is valid</li>
            </ol>
          </div>
        </div>
      )}
      
      <div className="form-actions">
        <button 
          type="button" 
          className="btn-secondary" 
          onClick={() => onClose && onClose()}
          disabled={loading}
        >
          Cancel
        </button>
        <button 
          type="submit" 
          className="btn-primary" 
          disabled={loading}
        >
          {loading ? (
            <span className="loading-text">
              <span className="spinner"></span>
              {isEdit ? 'Updating...' : 'Creating...'}
            </span>
          ) : (
            isEdit ? 'Update Project' : 'Create Project'
          )}
        </button>
      </div>
    </form>
  )
}
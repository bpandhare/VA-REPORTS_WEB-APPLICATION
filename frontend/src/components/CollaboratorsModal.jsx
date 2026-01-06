import { useState, useEffect } from 'react'
import { 
  getCollaborators, 
  addCollaborator, 
  deleteCollaborator, 
  getAvailableUsers
} from '../services/api'
import './CollaboratorsModal.css'

export default function CollaboratorsModal({ project, onClose, onChanged }) {
  const [collaborators, setCollaborators] = useState([])
  const [availableUsers, setAvailableUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [usersLoading, setUsersLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [role, setRole] = useState('Contributor')
  const [message, setMessage] = useState({ type: '', text: '' })
  const [useManualInput, setUseManualInput] = useState(false)
  const [hasFetchedUsers, setHasFetchedUsers] = useState(false)

  useEffect(() => {
    console.log('🔍 CollaboratorsModal mounted for project:', project?.id, project?.name)
    fetchCollaborators()
    fetchAvailableUsers()
  }, [project?.id])

  const fetchCollaborators = async () => {
    if (!project?.id) return
    
    setLoading(true)
    setMessage({ type: '', text: '' })
    
    try {
      console.log('📋 Fetching collaborators for project:', project.id)
      const res = await getCollaborators(project.id)
      console.log('📦 Collaborators response:', res.data)
      
      if (res.data?.success) {
        setCollaborators(res.data.collaborators || [])
        console.log(`✅ Loaded ${res.data.collaborators?.length || 0} collaborators`)
      } else {
        console.error('❌ Failed to fetch collaborators:', res.data?.message)
        setMessage({ type: 'error', text: res.data?.message || 'Failed to load collaborators' })
      }
    } catch (error) {
      console.error('❌ Error fetching collaborators:', error)
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.message || error.message || 'Failed to load collaborators' 
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchAvailableUsers = async () => {
    if (hasFetchedUsers && availableUsers.length > 0) {
      console.log('📊 Users already loaded:', availableUsers.length)
      return
    }
    
    setUsersLoading(true)
    setMessage({ type: '', text: '' })
    
    try {
      console.log('👥 Fetching REAL users from database...')
      const res = await getAvailableUsers()
      console.log('📦 REAL Users API response:', res.data)
      
      if (res.data?.success) {
        const users = res.data.users || []
        
        setAvailableUsers(users)
        setHasFetchedUsers(true)
        
        console.log(`✅ Loaded ${users.length} REAL users from database`)
        
        if (users.length === 0) {
          // REMOVED ALERT: No more popup when no users found
          // Just set to manual input mode and show a message in UI
          setUseManualInput(true)
          setMessage({ 
            type: 'info', 
            text: 'No employees found in database. Using manual input mode.' 
          })
        } else {
          setMessage({ 
            type: 'success', 
            text: `Found ${users.length} employees` 
          })
        }
        
      } else {
        console.error('❌ API failed:', res.data?.message)
        setMessage({ 
          type: 'error', 
          text: res.data?.message || 'Failed to load employees' 
        })
        setUseManualInput(true)
      }
    } catch (error) {
      console.error('❌ Error fetching users:', error)
      setMessage({ 
        type: 'error', 
        text: 'Cannot connect to database. Please check backend.' 
      })
      setUseManualInput(true)
    } finally {
      setUsersLoading(false)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    
    let employeeId = ''
    let userId = null
    
    if (useManualInput) {
      if (!selectedEmployeeId.trim()) {
        setMessage({ type: 'error', text: 'Please enter Employee ID' })
        return
      }
      employeeId = selectedEmployeeId.trim()
    } else {
      if (!selectedUserId) {
        setMessage({ type: 'error', text: 'Please select an employee' })
        return
      }
      
      // Find the selected user
      const selectedUser = availableUsers.find(u => u.id === parseInt(selectedUserId))
      if (selectedUser) {
        userId = selectedUser.id
        employeeId = selectedUser.employee_id || selectedUser.username
      }
    }

    if (!employeeId) {
      setMessage({ type: 'error', text: 'Please provide employee information' })
      return
    }

    setAdding(true)
    setMessage({ type: '', text: '' })

    console.log('➕ Adding collaborator:', {
      projectId: project.id,
      userId,
      employeeId,
      role
    })

    try {
      const data = { role }
      
      if (userId) {
        data.userId = userId
      } else {
        data.collaboratorEmployeeId = employeeId
      }

      console.log('📤 Sending data:', data)
      const res = await addCollaborator(project.id, data)
      console.log('✅ Add response:', res.data)

      if (res.data?.success) {
        setMessage({ type: 'success', text: res.data.message || 'Collaborator added successfully' })
        setSelectedUserId('')
        setSelectedEmployeeId('')
        setRole('Contributor')
        fetchCollaborators() // Refresh list
        if (onChanged) onChanged()
      } else {
        setMessage({ 
          type: 'error', 
          text: res.data?.message || 'Failed to add collaborator' 
        })
      }
    } catch (error) {
      console.error('❌ Add collaborator error:', error)
      
      let errorMessage = 'Failed to add collaborator'
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      }
      
      setMessage({ type: 'error', text: errorMessage })
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (collabId) => {
    // REMOVED ALERT: Use a more subtle approach
    // Instead of alert, show a confirmation message in the UI
    setMessage({ 
      type: 'confirm', 
      text: 'Remove this collaborator?',
      onConfirm: async () => {
        try {
          const res = await deleteCollaborator(project.id, collabId)

          if (res.data?.success) {
            setMessage({ type: 'success', text: 'Collaborator removed successfully' })
            fetchCollaborators()
            if (onChanged) onChanged()
          } else {
            setMessage({ type: 'error', text: res.data?.message || 'Failed to remove collaborator' })
          }
        } catch (error) {
          console.error('Remove collaborator error:', error)
          setMessage({ 
            type: 'error', 
            text: error.response?.data?.message || error.message || 'Failed to remove collaborator' 
          })
        }
      }
    })
  }

  const clearMessage = () => {
    setMessage({ type: '', text: '' })
  }

  const toggleInputMethod = () => {
    setUseManualInput(!useManualInput)
    setSelectedUserId('')
    setSelectedEmployeeId('')
    setMessage({ 
      type: 'info', 
      text: useManualInput ? 'Switched to dropdown selection' : 'Switched to manual input' 
    })
    
    if (!useManualInput && !hasFetchedUsers) {
      fetchAvailableUsers()
    }
  }

  // Filter out users who are already collaborators
  const filteredUsers = availableUsers.filter(user => 
    !collaborators.some(collab => collab.user_id === user.id)
  )

  // Auto-fetch users when dropdown is shown
  useEffect(() => {
    if (!useManualInput && !hasFetchedUsers && !usersLoading) {
      fetchAvailableUsers()
    }
  }, [useManualInput])

  // Handle message confirmations
  const handleMessageAction = () => {
    if (message.type === 'confirm' && message.onConfirm) {
      message.onConfirm()
      setMessage({ type: '', text: '' })
    } else {
      clearMessage()
    }
  }

  if (!project) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-pane" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h2>Project Collaborators</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="project-name">{project.name}</div>
            <button className="btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Message display with different types */}
        {message.text && (
          <div 
            className={`message ${message.type}`} 
            onClick={message.type === 'confirm' ? handleMessageAction : clearMessage}
            style={{ cursor: 'pointer' }}
          >
            {message.text}
            {message.type === 'confirm' ? (
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button 
                  className="btn-primary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (message.onConfirm) {
                      message.onConfirm()
                      setMessage({ type: '', text: '' })
                    }
                  }}
                >
                  Yes
                </button>
                <button 
                  className="btn-ghost btn-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMessage({ type: '', text: '' })
                  }}
                >
                  No
                </button>
              </div>
            ) : (
              <span className="message-close">×</span>
            )}
          </div>
        )}

        {/* Debug info */}
        <div style={{ 
          backgroundColor: '#f5f5f5', 
          padding: '8px 12px', 
          margin: '0 20px 15px 20px',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#666',
          border: '1px dashed #ddd'
        }}>
          <div><strong>Project ID:</strong> {project.id}</div>
          <div><strong>Current Collaborators:</strong> {collaborators.length}</div>
          <div><strong>Available Users:</strong> {availableUsers.length}</div>
          <div><strong>Input Mode:</strong> {useManualInput ? 'Manual' : 'Dropdown'}</div>
        </div>

        {/* Add Collaborator Form */}
        <div className="add-collaborator-form">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <h3 style={{ margin: 0 }}>Add New Collaborator</h3>
            <button 
              type="button" 
              onClick={fetchAvailableUsers}
              className="btn-ghost"
              style={{ fontSize: '12px', padding: '4px 8px' }}
              disabled={usersLoading}
            >
              {usersLoading ? 'Loading...' : 'Refresh List'}
            </button>
          </div>
          
          <div style={{ marginBottom: 15, display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              type="button" 
              onClick={toggleInputMethod}
              className="btn-ghost"
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              {useManualInput ? '← Use Dropdown' : 'Use Manual Input →'}
            </button>
            <small style={{ color: '#666' }}>
              {useManualInput ? 'Enter Employee ID manually' : 'Select from employee list'}
            </small>
          </div>

          <form onSubmit={handleAdd}>
            <div className="form-row">
              <div className="form-group">
                {useManualInput ? (
                  <input
                    type="text"
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    placeholder="Enter Employee ID (e.g., E0001, EMP001)"
                    disabled={adding}
                    required
                    style={{ width: '100%' }}
                  />
                ) : (
                  <>
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      disabled={adding || usersLoading || filteredUsers.length === 0}
                      required
                      style={{ width: '100%' }}
                    >
                      <option value="">Select Employee</option>
                      {filteredUsers.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.username} ({user.employee_id}) - {user.job_role || 'Employee'}
                        </option>
                      ))}
                    </select>
                    {usersLoading && <div className="loading-small">Loading employees...</div>}
                    {!usersLoading && filteredUsers.length === 0 && availableUsers.length > 0 && (
                      <div className="hint">All employees are already collaborators</div>
                    )}
                    {!usersLoading && availableUsers.length === 0 && (
                      <div className="hint">
                        No employees found. Try <button type="button" onClick={toggleInputMethod} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>manual input</button>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="form-group" style={{ width: 150 }}>
                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)}
                  disabled={adding}
                  style={{ width: '100%' }}
                >
                  <option value="Contributor">Contributor</option>
                  <option value="Viewer">Viewer</option>
                  <option value="Manager">Manager</option>
                </select>
              </div>
              <button 
                type="submit" 
                disabled={adding || (useManualInput ? !selectedEmployeeId.trim() : !selectedUserId)}
                className="btn-primary"
                style={{ height: '38px', minWidth: '80px' }}
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
            <div className="form-hint">
              {useManualInput 
                ? 'Enter the Employee ID or Username'
                : `Select from ${filteredUsers.length} available employees`}
            </div>
          </form>
        </div>

        {/* Collaborators List */}
        <div className="collaborators-list">
          <h3>Current Collaborators ({collaborators.length})</h3>
          
          {loading ? (
            <div className="loading">Loading collaborators...</div>
          ) : collaborators.length === 0 ? (
            <div className="no-collaborators">
              No collaborators yet. Add one above.
            </div>
          ) : (
            <div className="collaborators-grid">
              {collaborators.map(collab => (
                <div key={collab.id} className="collaborator-card">
                  <div className="collaborator-info">
                    <div className="collaborator-name">
                      {collab.display_name || collab.username || 
                       (collab.user_id ? `User ID: ${collab.user_id}` : 
                       collab.collaborator_employee_id || 'Employee ID: ' + (collab.collaborator_employee_id || 'Unknown'))}
                    </div>
                    <div className="collaborator-details">
                      <span className="collaborator-role">{collab.role}</span>
                      {collab.job_role && (
                        <span className="collaborator-job-role">{collab.job_role}</span>
                      )}
                      {collab.email && (
                        <span className="collaborator-email">{collab.email}</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn-ghost remove-btn"
                    onClick={() => handleRemove(collab.id)}
                    title="Remove collaborator"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
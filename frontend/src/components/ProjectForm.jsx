import { useState, useEffect } from 'react'
import { createProject } from '../services/api'
import { updateProject } from '../services/api'

export default function ProjectForm({ onCreated, onClose, initial, isManager = false }) {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [collaboratorIds, setCollaboratorIds] = useState(initial?.collaborator_ids || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setName(initial?.name || '')
    setDescription(initial?.description || '')
    setCollaboratorIds(initial?.collaborator_ids || [])
  }, [initial])

  const isEdit = !!initial?.id

  const handleSubmit = async (e) => {
    e && e.preventDefault()
    setError(null)
    if (!name) return setError('Name is required')
    
    // Only managers can create projects
    if (!isManager && !isEdit) {
      return setError('Only managers can create new projects')
    }
    
    setLoading(true)
    try {
      let res
      if (isEdit) {
        // update
        res = await updateProject(initial.id, { name, description })
      } else {
        // create with collaborators if provided
        res = await createProject({ 
          name, 
          description, 
          collaborator_ids: collaboratorIds 
        })
      }
      if (res.data?.success) {
        setName('')
        setDescription('')
        setCollaboratorIds([])
        onCreated && onCreated(res.data)
        onClose && onClose()
      } else {
        setError(res.data?.message || 'Failed')
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message)
    } finally {
      setLoading(false)
    }
  }

  // Only show collaborator field for managers creating new projects
  const showCollaboratorField = isManager && !isEdit

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-row">
        <label>Name</label>
        <input 
          value={name} 
          onChange={e => setName(e.target.value)} 
          placeholder="Project name" 
        />
      </div>
      <div className="form-row">
        <label>Description</label>
        <textarea 
          value={description} 
          onChange={e => setDescription(e.target.value)} 
          placeholder="Short description" 
        />
      </div>
      
      {showCollaboratorField && (
        <div className="form-row">
          <label>Add Collaborators (Employee IDs or Usernames)</label>
          <input 
            value={collaboratorIds.join(', ')}
            onChange={e => setCollaboratorIds(e.target.value.split(',').map(id => id.trim()).filter(id => id))}
            placeholder="Enter employee IDs or usernames separated by commas"
          />
          <div className="form-help">
            This project will be added to the dashboard of each collaborator
          </div>
        </div>
      )}
      
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <div className="form-actions">
        <button 
          type="button" 
          className="btn-ghost" 
          onClick={() => onClose && onClose()}
        >
          Cancel
        </button>
        <button 
          type="submit" 
          className="btn-primary" 
          disabled={loading}
        >
          {loading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Project' : 'Create Project')}
        </button>
      </div>
    </form>
  )
}
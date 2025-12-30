import { useEffect, useState } from 'react'
import { getCollaborators, addCollaborator, updateCollaborator, deleteCollaborator } from '../services/api'
import './Projects.css'

export default function CollaboratorsModal({ project, onClose, onChanged }) {
  const [collaborators, setCollaborators] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ employeeId: '', userId: '', role: 'Contributor' })

  const fetch = async () => {
    setLoading(true)
    try {
      const res = await getCollaborators(project.id)
      setCollaborators(res.data?.collaborators || [])
    } catch (e) { 
      console.error('Failed to fetch collaborators:', e) 
    }
    setLoading(false)
  }

  useEffect(() => { 
    if (project) fetch() 
  }, [project])

  const handleAdd = async (e) => {
    e.preventDefault()
    
    // Debug log
    console.log('Adding collaborator with data:', {
      projectId: project.id,
      formData: form,
      requestData: {
        userId: form.userId || null,
        employeeId: form.employeeId || null,
        role: form.role
      }
    })
    
    try {
      // Send employeeId instead of collaboratorEmployeeId
      await addCollaborator(project.id, { 
        userId: form.userId || null, 
        employeeId: form.employeeId || null, 
        role: form.role 
      })
      setForm({ employeeId: '', userId: '', role: 'Contributor' })
      fetch()
      onChanged && onChanged()
    } catch (e) { 
      console.error('Failed to add collaborator:', e) 
      alert('Failed to add collaborator: ' + (e.response?.data?.message || e.message))
    }
  }

  const handleUpdate = async (c) => {
    try {
      await updateCollaborator(project.id, c.id, { 
        role: c.role, 
        userId: c.user_id || null, 
        employeeId: c.collaborator_employee_id || null 
      })
      fetch()
      onChanged && onChanged()
      setEditing(null)
    } catch (e) { 
      console.error('Failed to update:', e) 
      alert('Failed to update: ' + (e.response?.data?.message || e.message))
    }
  }

  const handleDelete = async (c) => {
    if (!confirm('Remove collaborator?')) return
    try {
      await deleteCollaborator(project.id, c.id)
      fetch()
      onChanged && onChanged()
    } catch (e) { 
      console.error('Failed to delete:', e) 
      alert('Failed to delete: ' + (e.response?.data?.message || e.message))
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-pane">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Collaborators for {project.name}</h3>
          <div>
            <button className="btn-ghost" onClick={() => onClose && onClose()}>Close</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: 1 }}>
            <h4>Add Collaborator</h4>
            <form onSubmit={handleAdd}>
              <div className="form-row">
                <label>Employee ID *</label>
                <input 
                  value={form.employeeId} 
                  onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} 
                  placeholder="Enter employee ID"
                  required
                />
                <small style={{ color: '#666', fontSize: '12px' }}>
                  Enter the employee ID or username
                </small>
              </div>
              <div className="form-row">
                <label>User ID (optional)</label>
                <input 
                  value={form.userId} 
                  onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} 
                  placeholder="Leave empty if adding by employee ID"
                />
                <small style={{ color: '#666', fontSize: '12px' }}>
                  Only fill if you know the user's database ID
                </small>
              </div>
              <div className="form-row">
                <label>Role</label>
                <select 
                  value={form.role} 
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="Contributor">Contributor</option>
                  <option value="Developer">Developer</option>
                  <option value="Manager">Manager</option>
                  <option value="Reviewer">Reviewer</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setForm({ employeeId: '', userId: '', role: 'Contributor' })}>
                  Clear
                </button>
                <button type="submit" className="btn-primary">
                  Add Collaborator
                </button>
              </div>
            </form>
          </div>

          <div style={{ flex: 1 }}>
            <h4 style={{ marginTop: 0 }}>Existing Collaborators ({collaborators.length})</h4>
            {loading ? (
              <div>Loading collaborators...</div>
            ) : collaborators.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '20px', 
                color: '#666',
                border: '1px dashed #ddd',
                borderRadius: '8px'
              }}>
                No collaborators yet. Add one using the form.
              </div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {collaborators.map(c => (
                  <div key={c.id} style={{ 
                    border: '1px solid #eef3f7', 
                    padding: '12px', 
                    borderRadius: '8px', 
                    marginBottom: '8px',
                    backgroundColor: '#f9fafb'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>
                          {c.username || c.collaborator_employee_id || `User ID: ${c.user_id}`}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                          <span>Role: {c.role || 'Contributor'}</span>
                          {c.employee_id && <span>Emp ID: {c.employee_id}</span>}
                          <span>Added: {new Date(c.added_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn-ghost" 
                          onClick={() => setEditing(c)}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn-ghost" 
                          onClick={() => handleDelete(c)}
                          style={{ fontSize: '12px', padding: '4px 8px', color: '#ef4444' }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {editing && editing.id === c.id && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                        <div className="form-row" style={{ marginBottom: '8px' }}>
                          <label style={{ fontSize: '12px' }}>Role</label>
                          <select 
                            value={editing.role || ''} 
                            onChange={e => setEditing(s => ({ ...s, role: e.target.value }))}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                          >
                            <option value="Contributor">Contributor</option>
                            <option value="Developer">Developer</option>
                            <option value="Manager">Manager</option>
                            <option value="Reviewer">Reviewer</option>
                            <option value="Viewer">Viewer</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn-ghost" 
                            onClick={() => setEditing(null)}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                          >
                            Cancel
                          </button>
                          <button 
                            className="btn-primary" 
                            onClick={() => handleUpdate(editing)}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
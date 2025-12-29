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
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { if (project) fetch() }, [project])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      await addCollaborator(project.id, { userId: form.userId || null, collaboratorEmployeeId: form.employeeId || null, role: form.role })
      setForm({ employeeId: '', userId: '', role: 'Contributor' })
      fetch()
      onChanged && onChanged()
    } catch (e) { console.error(e); alert('Failed to add collaborator') }
  }

  const handleUpdate = async (c) => {
    try {
      await updateCollaborator(project.id, c.id, { role: c.role, userId: c.user_id || null, collaboratorEmployeeId: c.collaborator_employee_id || null })
      fetch()
      onChanged && onChanged()
      setEditing(null)
    } catch (e) { console.error(e); alert('Failed to update') }
  }

  const handleDelete = async (c) => {
    if (!confirm('Remove collaborator?')) return
    try {
      await deleteCollaborator(project.id, c.id)
      fetch()
      onChanged && onChanged()
    } catch (e) { console.error(e); alert('Failed to delete') }
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
                <label>Employee ID</label>
                <input value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} />
              </div>
              <div className="form-row">
                <label>User ID (optional)</label>
                <input value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} />
              </div>
              <div className="form-row">
                <label>Role</label>
                <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
              </div>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setForm({ employeeId: '', userId: '', role: 'Contributor' })}>Cancel</button>
                <button type="submit" className="btn-primary">Add Collaborator</button>
              </div>
            </form>
          </div>

          <div style={{ flex: 1 }}>
            <h4 style={{ marginTop: 0 }}>Existing Collaborators</h4>
            {loading ? <div>Loading...</div> : (
              <div>
                {collaborators.length === 0 && <div>No collaborators</div>}
                {collaborators.map(c => (
                  <div key={c.id} style={{ border: '1px solid #eef3f7', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{c.collaborator_employee_id || c.user_id || 'Unknown'}</div>
                        <div style={{ color: '#6b7280', fontSize: 13 }}>{c.role || 'Contributor'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-ghost" onClick={() => setEditing(c)}>Edit</button>
                        <button className="btn-ghost" onClick={() => handleDelete(c)}>Delete</button>
                      </div>
                    </div>

                    {editing && editing.id === c.id && (
                      <div style={{ marginTop: 8 }}>
                        <div className="form-row">
                          <label>Role</label>
                          <input value={editing.role || ''} onChange={e => setEditing(s => ({ ...s, role: e.target.value }))} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                          <button className="btn-primary" onClick={() => handleUpdate(editing)}>Save</button>
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

import { useState } from 'react'
import { addCollaborator } from '../services/api'

export default function CollaboratorForm({ projectId, onAdded }) {
  const [employeeId, setEmployeeId] = useState('')
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('Contributor')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!employeeId && !userId) return setError('Provide employee id or user id')
    setLoading(true)
    try {
      await addCollaborator(projectId, { userId: userId || null, collaboratorEmployeeId: employeeId || null, role })
      setEmployeeId('')
      setUserId('')
      onAdded && onAdded()
    } catch (err) {
      setError(err?.response?.data?.message || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 12 }}>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div>
        <label>Employee ID</label>
        <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} />
      </div>
      <div>
        <label>User ID (optional)</label>
        <input value={userId} onChange={e => setUserId(e.target.value)} />
      </div>
      <div>
        <label>Role</label>
        <input value={role} onChange={e => setRole(e.target.value)} />
      </div>
      <button type="submit" disabled={loading}>{loading ? 'Adding...' : 'Add Collaborator'}</button>
    </form>
  )
}

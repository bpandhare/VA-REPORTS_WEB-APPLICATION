import { useState, useEffect } from 'react'
import { createProject } from '../services/api'
import { updateProject } from '../services/api'

export default function ProjectForm({ onCreated, onClose, initial }) {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setName(initial?.name || '')
    setDescription(initial?.description || '')
  }, [initial])

  const isEdit = !!initial?.id
  const handleSubmit = async (e) => {
    e && e.preventDefault()
    setError(null)
    if (!name) return setError('Name is required')
    setLoading(true)
    try {
      let res
      if (isEdit) {
        // update
        res = await updateProject(initial.id, { name, description })
      } else {
        res = await createProject({ name, description })
      }
      if (res.data?.success) {
        setName('')
        setDescription('')
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

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-row">
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Project name" />
      </div>
      <div className="form-row">
        <label>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description" />
      </div>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={() => onClose && onClose()}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Creating...' : 'Create Project'}</button>
      </div>
    </form>
  )
}

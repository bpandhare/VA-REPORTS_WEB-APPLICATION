import { useEffect, useState } from 'react'
import { listProjects, getCollaborators } from '../services/api'
import CollaboratorForm from './CollaboratorForm'
import CollaboratorsModal from './CollaboratorsModal'
import ProjectForm from './ProjectForm'
import { deleteProject } from '../services/api'
import './Projects.css'

export default function ProjectList() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showCollaborators, setShowCollaborators] = useState(false)

  const fetch = async () => {
    setLoading(true)
    try {
      const res = await listProjects()
      setProjects(res.data?.projects || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetch() }, [])

  const openCollaborators = async (project) => {
    setSelected({ project })
    setShowCollaborators(true)
  }

  return (
    <div className="projects-page">
      <div className="projects-hero">
        <div>
          <div className="title">Welcome back, User</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>Here's what's happening with your projects today</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="projects-stats">
            <div className="stat-card">
              <div className="label">Total Projects</div>
              <div className="value">{projects.length}</div>
            </div>
            <div className="stat-card">
              <div className="label">Completed</div>
              <div className="value">0</div>
            </div>
          </div>
          <button className="new-project-btn" onClick={() => setShowNew(true)}>+ New Project</button>
        </div>
      </div>

      <div className="projects-list">
        {loading ? (
          <div>Loading...</div>
        ) : (
          projects.map(p => (
            <div key={p.id} className="project-card">
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                <div className="meta">{p.description}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{p.collaborators_count || 0} members</div>
                <div>
                  <button className="btn-ghost" onClick={() => openCollaborators(p)}>Collaborators</button>
                  <button className="btn-ghost" style={{ marginLeft: 8 }} onClick={() => setEditing(p)}>Edit</button>
                  <button className="btn-ghost" style={{ marginLeft: 8 }} onClick={async () => {
                    if (!confirm('Delete project "' + p.name + '"? This cannot be undone.')) return
                    try {
                      await deleteProject(p.id)
                      fetch()
                    } catch (e) { console.error(e); alert('Failed to delete project') }
                  }}>Delete</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showCollaborators && selected && (
        <CollaboratorsModal project={selected.project} onClose={() => { setShowCollaborators(false); setSelected(null) }} onChanged={() => { fetch() }} />
      )}

      {showNew && (
        <div className="modal-backdrop">
          <div className="modal-pane">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Create New Project</h3>
              <div>
                <button className="btn-ghost" onClick={() => setShowNew(false)}>Close</button>
              </div>
            </div>
            <ProjectForm onCreated={(data) => { fetch() }} onClose={() => setShowNew(false)} />
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop">
          <div className="modal-pane">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Edit Project</h3>
              <div>
                <button className="btn-ghost" onClick={() => setEditing(null)}>Close</button>
              </div>
            </div>
            <ProjectForm initial={editing} onCreated={() => { fetch(); setEditing(null) }} onClose={() => setEditing(null)} />
          </div>
        </div>
      )}
    </div>
  )
}

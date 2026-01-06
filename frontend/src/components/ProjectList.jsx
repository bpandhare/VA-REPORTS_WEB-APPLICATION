import { useEffect, useState } from 'react'
import { listProjects, getCollaborators, getUserInfo, updateProjectStatus } from '../services/api'
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
  const [userRole, setUserRole] = useState('')
  const [userInfo, setUserInfo] = useState(null)
  const [userInfoLoading, setUserInfoLoading] = useState(true)

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const res = await getUserInfo()
        if (res.data?.success) {
          setUserRole(res.data.role || '')
          setUserInfo(res.data)
        }
      } catch (error) {
        setUserRole('Employee')
        setUserInfo({ id: 1, role: 'Employee' })
      } finally {
        setUserInfoLoading(false)
      }
    }
    fetchUserInfo()
  }, [])

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const res = await listProjects()
      if (res.data?.success) {
        setProjects(res.data.projects || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { 
    if (!userInfoLoading) fetchProjects()
  }, [userInfoLoading])

 const handleMarkComplete = async (project) => {
  if (!window.confirm(`Mark project "${project.name}" as complete?`)) return
  
  try {
    const result = await updateProjectStatus(project.id, 'completed');
    
    if (result.data?.success) {
      setProjects(prev => prev.map(p => 
        p.id === project.id ? { ...p, status: 'completed' } : p
      ))
      
      if (result.data.message.includes('MOCK')) {
        alert(`✅ Project "${project.name}" marked as complete! (Using local data - Backend is offline)`);
      } else {
        alert(`✅ Project "${project.name}" marked as complete!`);
      }
    } else {
      alert(`Failed: ${result.data?.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Complete error:', error);
    
    try {
      const altStatuses = ['completed', 'done', 'finished', 'closed'];
      let success = false;
      
      for (const status of altStatuses) {
        try {
          const result = await updateProjectStatus(project.id, status);
          if (result.data?.success) {
            setProjects(prev => prev.map(p => 
              p.id === project.id ? { ...p, status: 'completed' } : p
            ))
            alert(`✅ Project "${project.name}" marked as complete! (Used status: ${status})`);
            success = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!success) {
        setProjects(prev => prev.map(p => 
          p.id === project.id ? { ...p, status: 'completed' } : p
        ))
        alert(`✅ Project "${project.name}" marked as complete! (Local update only)`);
      }
    } catch (fallbackError) {
      alert('Failed to update project status. Please try again.');
    }
  }
}

  const handleUndoComplete = async (project) => {
    if (!window.confirm(`Re-open project "${project.name}"?`)) return
    
    try {
      await updateProjectStatus(project.id, 'active')
      setProjects(prev => prev.map(p => 
        p.id === project.id ? { ...p, status: 'active' } : p
      ))
      alert(`Project "${project.name}" re-opened!`)
    } catch (error) {
      alert('Failed to re-open project')
    }
  }

  const isManager = userRole === 'Manager'
  const activeProjects = projects.filter(p => p.status !== 'completed')
  const completedProjects = projects.filter(p => p.status === 'completed')

  if (userInfoLoading) {
    return <div className="loading-container">Loading...</div>
  }

  return (
    <div className="projects-page">
      <div className="projects-hero">
        <div>
          <div className="title">Welcome back, {userInfo?.username || 'User'}</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>
            {isManager ? "Your projects dashboard" : "Your assigned projects"}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="projects-stats">
            <div className="stat-card">
              <div className="label">Total</div>
              <div className="value">{projects.length}</div>
            </div>
            <div className="stat-card">
              <div className="label">Active</div>
              <div className="value">{activeProjects.length}</div>
            </div>
            <div className="stat-card">
              <div className="label">Completed</div>
              <div className="value">{completedProjects.length}</div>
            </div>
          </div>
          
          {isManager && (
            <button className="new-project-btn" onClick={() => setShowNew(true)}>
              + New Project
            </button>
          )}
        </div>
      </div>

      {/* Active Projects */}
      {activeProjects.length > 0 && (
        <div className="projects-section">
          <h2 className="section-title">Active Projects ({activeProjects.length})</h2>
          <div className="projects-list">
            {activeProjects.map(p => (
              <div key={p.id} className="project-card">
                <div>
                  <div className="project-title">{p.name}</div>
                  <div className="project-customer">
                    Customer: {p.customer || p.customer_name || 'Not specified'}
                  </div>
                  <div className="project-description">{p.description || 'No description'}</div>
                  {!isManager && p.created_by !== userInfo?.id && (
                    <div className="assigned-badge">Assigned to you</div>
                  )}
                </div>
                <div className="project-footer">
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span className="collaborator-count">{p.collaborators_count || 0} members</span>
                    <span className={`project-status ${p.status || 'active'}`}>
                      {p.status || 'Active'}
                    </span>
                  </div>
                  <div className="project-actions">
                    <button 
                      className="btn-ghost view-details"
                      onClick={() => {setSelected({ project: p }); setShowCollaborators(true)}}
                    >
                      View Details
                    </button>
                    {(isManager || p.created_by === userInfo?.id) && (
                      <button 
                        className="btn-ghost complete"
                        onClick={() => handleMarkComplete(p)}
                      >
                        Mark Complete
                      </button>
                    )}
                    {isManager && (
                      <>
                        <button className="btn-ghost edit" onClick={() => setEditing(p)}>
                          Edit
                        </button>
                        <button 
                          className="btn-ghost delete" 
                          onClick={async () => {
                            if (!confirm('Delete project "' + p.name + '"? This cannot be undone.')) return
                            try {
                              await deleteProject(p.id)
                              fetchProjects()
                            } catch (e) { 
                              alert('Failed to delete project') 
                            }
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Projects */}
      {completedProjects.length > 0 && (
        <div className="projects-section completed-section">
          <h2 className="section-title">Completed Projects ({completedProjects.length})</h2>
          <div className="projects-list">
            {completedProjects.map(p => (
              <div key={p.id} className="project-card completed">
                <div>
                  <div className="project-title">{p.name}</div>
                  <div className="project-customer">
                    Customer: {p.customer || p.customer_name || 'Not specified'}
                  </div>
                  <div className="project-description">{p.description || 'No description'}</div>
                  <div className="completed-badge">Completed</div>
                </div>
                <div className="project-footer">
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span className="collaborator-count">{p.collaborators_count || 0} members</span>
                    <span className="project-status completed">Completed</span>
                  </div>
                  <div className="project-actions">
                    <button 
                      className="btn-ghost view-details"
                      onClick={() => {setSelected({ project: p }); setShowCollaborators(true)}}
                    >
                      View Details
                    </button>
                    {isManager && (
                      <button 
                        className="btn-ghost reopen"
                        onClick={() => handleUndoComplete(p)}
                      >
                        Re-open
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {projects.length === 0 && !loading && (
        <div className="no-projects">
          {isManager ? 'No projects yet. Create your first project!' : 'No projects assigned to you.'}
        </div>
      )}

      {/* Modals */}
      {showCollaborators && selected && (
        <CollaboratorsModal 
          project={selected.project} 
          onClose={() => { setShowCollaborators(false); setSelected(null) }} 
          onChanged={fetchProjects} 
        />
      )}

      {showNew && (
        <div className="modal-backdrop">
          <div className="modal-pane">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Create New Project</h3>
              <button className="btn-ghost" onClick={() => setShowNew(false)}>Close</button>
            </div>
            <ProjectForm 
              projectId={null}  // Null for create mode
              initialData={null} // No initial data for create
              onSuccess={() => { 
                fetchProjects(); 
                setShowNew(false); 
              }} 
              onClose={() => setShowNew(false)} 
            />
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop">
          <div className="modal-pane">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Edit Project: {editing.name}</h3>
              <button className="btn-ghost" onClick={() => setEditing(null)}>Close</button>
            </div>
            <ProjectForm 
              projectId={editing.id}  // Pass project ID for edit mode
              initialData={editing}    // Pass the entire project data
              onSuccess={() => { 
                fetchProjects(); 
                setEditing(null); 
                alert('Project updated successfully!');
              }} 
              onClose={() => setEditing(null)} 
            />
          </div>
        </div>
      )}
    </div>
  )
}
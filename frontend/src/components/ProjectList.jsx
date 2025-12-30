import { useEffect, useState } from 'react'
import { listProjects, getCollaborators, getUserInfo } from '../services/api'
import CollaboratorForm from './CollaboratorForm'
import CollaboratorsModal from './CollaboratorsModal'
import ProjectForm from './ProjectForm'
import { deleteProject } from '../services/api'
import './Projects.css'
import ManagerProjectDashboard from './ManagerProjectDashboard'


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
    // Fetch user info to check role and get user ID
    const fetchUserInfo = async () => {
      try {
        const res = await getUserInfo()
        if (res.data?.success) {
          setUserRole(res.data.role || '')
          setUserInfo(res.data)
        }
      } catch (error) {
        console.error('Failed to fetch user info:', error)
        // If endpoint doesn't exist yet, default for testing
        if (error.response?.status === 404) {
          setUserRole('Employee') // Default for testing
          setUserInfo({ id: 1, role: 'Employee' })
        }
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
        let userProjects = res.data.projects || []
        
        // If user is not a manager, filter projects to only show those they're assigned to
        if (userRole !== 'Manager' && userInfo) {
          // Filter projects where user is a collaborator or is assigned to the project
          userProjects = userProjects.filter(project => {
            // Check if user is the creator
            if (project.created_by === userInfo.id) return true
            
            // Check if user is in collaborators (you'll need to fetch collaborators for each project)
            // For now, we'll rely on the backend filtering
            return true // Backend should filter this
          })
        }
        
        setProjects(userProjects)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { 
    if (!userInfoLoading) {
      fetchProjects() 
    }
  }, [userInfoLoading])

  const openCollaborators = async (project) => {
    setSelected({ project })
    setShowCollaborators(true)
  }

  const isManager = userRole === 'Manager'

  // Show loading while fetching user info
  if (userInfoLoading) {
    return (
      <div className="projects-page">
        <div className="loading-container">
          <div>Loading...</div>
        </div>
      </div>
    )
  }


  return (
    <div className="projects-page">
      <div className="projects-hero">
        <div>
          <div className="title">Welcome back, {userInfo?.username || 'User'}</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>
            {isManager 
              ? "Here's what's happening with your projects today" 
              : "Here are the projects assigned to you"}
          </div>
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
          
          {/* Only show New Project button for managers */}
          {isManager && (
            <button 
              className="new-project-btn" 
              onClick={() => setShowNew(true)}
            >
              + New Project
            </button>
          )}
        </div>
      </div>

      <div className="projects-list">
        {loading ? (
          <div>Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="no-projects">
            {isManager 
              ? 'No projects found. Create your first project!' 
              : 'No projects assigned to you yet.'}
          </div>
        ) : (
          projects.map(p => (
            <div key={p.id} className="project-card">
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                <div className="meta">{p.description}</div>
                {!isManager && p.created_by !== userInfo?.id && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Assigned to you
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{p.collaborators_count || 0} members</div>
                <div>
                  <button 
                    className="btn-ghost" 
                    onClick={() => openCollaborators(p)}
                  >
                    View Details
                  </button>
                  
                  {/* Only managers can edit/delete */}
                  {isManager && (
                    <>
                      <button 
                        className="btn-ghost" 
                        style={{ marginLeft: 8 }} 
                        onClick={() => setEditing(p)}
                      >
                        Edit
                      </button>
                      <button 
                        className="btn-ghost" 
                        style={{ marginLeft: 8 }} 
                        onClick={async () => {
                          if (!confirm('Delete project "' + p.name + '"? This cannot be undone.')) return
                          try {
                            await deleteProject(p.id)
                            fetchProjects()
                          } catch (e) { 
                            console.error(e); 
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
          ))
        )}
      </div>

      {showCollaborators && selected && (
        <CollaboratorsModal 
          project={selected.project} 
          onClose={() => { setShowCollaborators(false); setSelected(null) }} 
          onChanged={() => { fetchProjects() }} 
        />
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
            <ProjectForm 
              isManager={isManager}
              onCreated={(data) => { fetchProjects(); setShowNew(false) }} 
              onClose={() => setShowNew(false)} 
            />
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
            <ProjectForm 
              initial={editing} 
              isManager={isManager}
              onCreated={() => { fetchProjects(); setEditing(null) }} 
              onClose={() => setEditing(null)} 
            />
          </div>
        </div>
      )}
    </div>
  )
  return <ManagerProjectDashboard />
  
}
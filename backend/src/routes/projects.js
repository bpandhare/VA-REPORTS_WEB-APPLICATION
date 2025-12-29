import { Router } from 'express'
import pool from '../db.js'
import jwt from 'jsonwebtoken'
import { sendMail } from '../mailer.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? 'vickhardth-site-pulse-secret'

// Simple token verification middleware with dev fallback
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization
  if ((!authHeader || !authHeader.startsWith('Bearer ')) && process.env.NODE_ENV !== 'production') {
    req.user = { id: 1, username: 'dev', role: 'Manager' }
    return next()
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing token' })
  }

  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      req.user = { id: 1, username: 'dev', role: 'Manager' }
      return next()
    }
    res.status(401).json({ success: false, message: 'Invalid token' })
  }
}

// Create a new project
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, description } = req.body
    if (!name) return res.status(400).json({ success: false, message: 'Project name is required' })

    const createdBy = req.user?.id || null
    const [result] = await pool.execute(
      'INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)',
      [name, description || '', createdBy]
    )

    res.json({ success: true, id: result.insertId, name, description })
  } catch (error) {
    console.error('Failed to create project:', error)
    res.status(500).json({ success: false, message: 'Unable to create project' })
  }
})

// List projects
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT p.*, COUNT(pc.id) as collaborators_count
      FROM projects p
      LEFT JOIN project_collaborators pc ON pc.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `)
    res.json({ success: true, projects: rows })
  } catch (error) {
    console.error('Failed to list projects:', error)
    res.status(500).json({ success: false, message: 'Unable to fetch projects' })
  }
})

// Get single project with collaborators
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id)
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    const [projects] = await pool.execute('SELECT * FROM projects WHERE id = ?', [projectId])
    if (!projects || projects.length === 0) return res.status(404).json({ success: false, message: 'Project not found' })
    const project = projects[0]

    const [collaborators] = await pool.execute('SELECT * FROM project_collaborators WHERE project_id = ? ORDER BY added_at DESC', [projectId])

    res.json({ success: true, project, collaborators })
  } catch (error) {
    console.error('Failed to get project:', error)
    res.status(500).json({ success: false, message: 'Unable to fetch project' })
  }
})

// Add collaborator to a project
router.post('/:id/collaborators', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id)
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    const { userId, collaboratorEmployeeId, role } = req.body
    const addedBy = req.user?.id || null

    await pool.execute(
      'INSERT INTO project_collaborators (project_id, user_id, collaborator_employee_id, role, added_by) VALUES (?, ?, ?, ?, ?)',
      [projectId, userId || null, collaboratorEmployeeId || null, role || null, addedBy]
    )
    // If a user id or employee id is provided, update the users table to assign this project
    try {
      if (userId) {
        await pool.execute('UPDATE users SET assigned_project_id = ? WHERE id = ?', [projectId, userId])
        // attempt to notify user by email
        try {
          const [rows] = await pool.execute('SELECT email, username FROM users WHERE id = ?', [userId])
          if (rows && rows[0] && rows[0].email) {
            const email = rows[0].email
            const name = rows[0].username || rows[0].email
            const subject = `You were added to project (ID: ${projectId})`
            const text = `Hello ${name},\n\nYou have been added as a collaborator to project (ID: ${projectId}).\n\nRegards,\nTeam`
            sendMail({ to: email, subject, text }).catch(e => console.warn('Email notify failed:', e?.message || e))
          }
        } catch (e) { console.warn('Email lookup failed:', e?.message || e) }
      } else if (collaboratorEmployeeId) {
        await pool.execute('UPDATE users SET assigned_project_id = ? WHERE employee_id = ? OR username = ?', [projectId, collaboratorEmployeeId, collaboratorEmployeeId])
        // attempt to notify user by email using employee id lookup
        try {
          const [rows] = await pool.execute('SELECT email, username FROM users WHERE employee_id = ? OR username = ?', [collaboratorEmployeeId, collaboratorEmployeeId])
          if (rows && rows[0] && rows[0].email) {
            const email = rows[0].email
            const name = rows[0].username || rows[0].email
            const subject = `You were added to project (ID: ${projectId})`
            const text = `Hello ${name},\n\nYou have been added as a collaborator to project (ID: ${projectId}).\n\nRegards,\nTeam`
            sendMail({ to: email, subject, text }).catch(e => console.warn('Email notify failed:', e?.message || e))
          }
        } catch (e) { console.warn('Email lookup failed:', e?.message || e) }
      }
    } catch (e) {
      console.warn('Warning: failed to update user assigned_project_id', e?.message || e)
    }

    res.json({ success: true, message: 'Collaborator added' })
  } catch (error) {
    console.error('Failed to add collaborator:', error)
    res.status(500).json({ success: false, message: 'Unable to add collaborator' })
  }
})

// Get collaborators for a project
router.get('/:id/collaborators', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id)
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    const [rows] = await pool.execute(
      'SELECT * FROM project_collaborators WHERE project_id = ? ORDER BY added_at DESC',
      [projectId]
    )
    res.json({ success: true, collaborators: rows })
  } catch (error) {
    console.error('Failed to fetch collaborators:', error)
    res.status(500).json({ success: false, message: 'Unable to fetch collaborators' })
  }
})

// Update a collaborator
router.put('/:projectId/collaborators/:collabId', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    const collabId = parseInt(req.params.collabId)
    if (!projectId || !collabId) return res.status(400).json({ success: false, message: 'Invalid ids' })

    const { role, userId, collaboratorEmployeeId } = req.body
    await pool.execute(
      'UPDATE project_collaborators SET role = ?, user_id = ?, collaborator_employee_id = ? WHERE id = ? AND project_id = ?',
      [role || null, userId || null, collaboratorEmployeeId || null, collabId, projectId]
    )

    // If userId or collaboratorEmployeeId provided, also update users.assigned_project_id
    try {
      if (userId) {
        await pool.execute('UPDATE users SET assigned_project_id = ? WHERE id = ?', [projectId, userId])
      } else if (collaboratorEmployeeId) {
        await pool.execute('UPDATE users SET assigned_project_id = ? WHERE employee_id = ? OR username = ?', [projectId, collaboratorEmployeeId, collaboratorEmployeeId])
      }
    } catch (e) {
      console.warn('Warning: failed to update user assigned_project_id', e?.message || e)
    }

    res.json({ success: true, message: 'Collaborator updated' })
  } catch (error) {
    console.error('Failed to update collaborator:', error)
    res.status(500).json({ success: false, message: 'Unable to update collaborator' })
  }
})

// Delete a collaborator
router.delete('/:projectId/collaborators/:collabId', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    const collabId = parseInt(req.params.collabId)
    if (!projectId || !collabId) return res.status(400).json({ success: false, message: 'Invalid ids' })

    // Find collaborator to know user/employee id
    const [rows] = await pool.execute('SELECT * FROM project_collaborators WHERE id = ? AND project_id = ?', [collabId, projectId])
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Collaborator not found' })
    const collab = rows[0]

    // Delete collaborator row
    await pool.execute('DELETE FROM project_collaborators WHERE id = ? AND project_id = ?', [collabId, projectId])

    // If user_id present, clear assigned_project_id for that user
    try {
      if (collab.user_id) {
        await pool.execute('UPDATE users SET assigned_project_id = NULL WHERE id = ?', [collab.user_id])
      } else if (collab.collaborator_employee_id) {
        await pool.execute('UPDATE users SET assigned_project_id = NULL WHERE employee_id = ? OR username = ?', [collab.collaborator_employee_id, collab.collaborator_employee_id])
      }
    } catch (e) {
      console.warn('Warning: failed to clear assigned_project_id for user on collaborator delete', e?.message || e)
    }

    res.json({ success: true, message: 'Collaborator deleted' })
  } catch (error) {
    console.error('Failed to delete collaborator:', error)
    res.status(500).json({ success: false, message: 'Unable to delete collaborator' })
  }
})

// Update project
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id)
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    const { name, description } = req.body
    await pool.execute('UPDATE projects SET name = ?, description = ? WHERE id = ?', [name || '', description || '', projectId])
    res.json({ success: true, message: 'Project updated' })
  } catch (error) {
    console.error('Failed to update project:', error)
    res.status(500).json({ success: false, message: 'Unable to update project' })
  }
})

// Delete project (and related collaborators); clear assigned_project_id for users
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id)
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    // Delete collaborators
    await pool.execute('DELETE FROM project_collaborators WHERE project_id = ?', [projectId])

    // Clear assignment for users assigned to this project
    try {
      await pool.execute('UPDATE users SET assigned_project_id = NULL WHERE assigned_project_id = ?', [projectId])
    } catch (e) {
      console.warn('Warning: failed to clear assigned_project_id for users', e?.message || e)
    }

    // Delete project
    await pool.execute('DELETE FROM projects WHERE id = ?', [projectId])

    res.json({ success: true, message: 'Project deleted' })
  } catch (error) {
    console.error('Failed to delete project:', error)
    res.status(500).json({ success: false, message: 'Unable to delete project' })
  }
})

export default router

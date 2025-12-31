import { Router } from 'express'
import pool from '../db.js'
import jwt from 'jsonwebtoken'
import { sendMail } from '../mailer.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? 'vickhardth-site-pulse-secret'

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

const isManager = (req, res, next) => {
  if (req.user?.role !== 'Manager') {
    return res.status(403).json({ 
      success: false, 
      message: 'Only managers can perform this action' 
    })
  }
  next()
}

// Helper function to safely add column if it doesn't exist
const ensureColumnExists = async (connection, columnName, columnDefinition) => {
  try {
    // Check if column exists by trying to select it
    await connection.execute(`SELECT ${columnName} FROM projects LIMIT 1`)
    console.log(`✅ Column ${columnName} already exists`)
    return true
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      console.log(`⚠️ Column ${columnName} not found, adding it...`)
      try {
        // Add the column
        await connection.execute(`ALTER TABLE projects ADD COLUMN ${columnName} ${columnDefinition}`)
        console.log(`✅ Column ${columnName} added successfully`)
        return true
      } catch (alterError) {
        console.error(`❌ Failed to add column ${columnName}:`, alterError.message)
        return false
      }
    }
    console.error(`❌ Error checking column ${columnName}:`, error.message)
    return false
  }
}

// ========== PROJECT ROUTES ==========

// Create a new project - MANAGER ONLY (FIXED)
// In your backend routes/projects.js - Update the create project route
router.post('/', verifyToken, isManager, async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    
    const { 
      name, 
      customer, 
      description, 
      priority = 'medium', 
      start_date, 
      end_date,
      // REMOVED: budget
      collaborator_ids = [] 
    } = req.body
    
    if (!name) return res.status(400).json({ success: false, message: 'Project name is required' })
    if (!customer) return res.status(400).json({ success: false, message: 'Customer name is required' })

    const createdBy = req.user?.id || null
    
    // Ensure all required columns exist (REMOVED budget)
    await ensureColumnExists(connection, 'customer', 'VARCHAR(255) DEFAULT NULL')
    await ensureColumnExists(connection, 'priority', "VARCHAR(50) DEFAULT 'medium'")
    await ensureColumnExists(connection, 'start_date', 'DATE DEFAULT NULL')
    await ensureColumnExists(connection, 'end_date', 'DATE DEFAULT NULL')
    await ensureColumnExists(connection, 'status', "VARCHAR(20) DEFAULT 'active'")

    // Create project WITHOUT budget
    const [result] = await connection.execute(
      `INSERT INTO projects 
       (name, customer, description, priority, start_date, end_date, status, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, 
        customer, 
        description || '', 
        priority, 
        start_date || null, 
        end_date || null, 
        'active',  // default status
        createdBy
      ]
    )
    
    const projectId = result.insertId
    
    // ... rest of the collaborator code remains the same ...
    
    await connection.commit()
    
    // Get the created project with all details
    const [createdProjects] = await connection.execute(
      'SELECT * FROM projects WHERE id = ?',
      [projectId]
    )
    
    res.json({ 
      success: true, 
      message: 'Project created successfully',
      project: createdProjects[0] || { id: projectId, name, customer }
    })
  } catch (error) {
    await connection.rollback()
    console.error('Failed to create project:', error)
    
    // Provide helpful error message for missing customer column
    let errorMessage = 'Unable to create project'
    if (error.code === 'ER_BAD_FIELD_ERROR' && error.sqlMessage?.includes('customer')) {
      errorMessage = 'Database error: Customer column is missing. Please run: ALTER TABLE projects ADD COLUMN customer VARCHAR(255) DEFAULT NULL;'
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      details: error.message 
    })
  } finally {
    connection.release()
  }
})

// Also update the update project route to remove budget
router.put('/:id', verifyToken, isManager, async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    
    const projectId = parseInt(req.params.id)
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    const { 
      name, 
      customer, 
      description, 
      priority, 
      start_date, 
      end_date,
      // REMOVED: budget
      status 
    } = req.body
    
    // Build update query dynamically (REMOVED budget)
    const updates = []
    const values = []
    
    if (name !== undefined) {
      updates.push('name = ?')
      values.push(name)
    }
    if (customer !== undefined) {
      updates.push('customer = ?')
      values.push(customer)
    }
    if (description !== undefined) {
      updates.push('description = ?')
      values.push(description || '')
    }
    if (priority !== undefined) {
      updates.push('priority = ?')
      values.push(priority)
    }
    if (start_date !== undefined) {
      updates.push('start_date = ?')
      values.push(start_date || null)
    }
    if (end_date !== undefined) {
      updates.push('end_date = ?')
      values.push(end_date || null)
    }
    // REMOVED: budget handling
    if (status !== undefined) {
      updates.push('status = ?')
      values.push(status)
    }
    
    if (updates.length === 0) {
      await connection.rollback()
      return res.status(400).json({ success: false, message: 'No fields to update' })
    }
    
    values.push(projectId)
    
    const query = `UPDATE projects SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    
    await connection.execute(query, values)
    
    await connection.commit()
    
    res.json({ 
      success: true, 
      message: 'Project updated successfully'
    })
  } catch (error) {
    await connection.rollback()
    console.error('Failed to update project:', error)
    res.status(500).json({ 
      success: false, 
      message: 'Unable to update project',
      details: error.message 
    })
  } finally {
    connection.release()
  }
})

// Get single project with collaborators
router.get('/:id', verifyToken, async (req, res) => {
  const connection = await pool.getConnection()
  try {
    const projectId = parseInt(req.params.id)
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    // Ensure columns exist
    await ensureColumnExists(connection, 'customer', 'VARCHAR(255) DEFAULT NULL')
    await ensureColumnExists(connection, 'priority', "VARCHAR(50) DEFAULT 'medium'")
    await ensureColumnExists(connection, 'start_date', 'DATE DEFAULT NULL')
    await ensureColumnExists(connection, 'end_date', 'DATE DEFAULT NULL')
    await ensureColumnExists(connection, 'budget', 'DECIMAL(15,2) DEFAULT NULL')
    await ensureColumnExists(connection, 'status', "VARCHAR(20) DEFAULT 'active'")

    const [projects] = await connection.execute('SELECT * FROM projects WHERE id = ?', [projectId])
    if (!projects || projects.length === 0) return res.status(404).json({ success: false, message: 'Project not found' })
    const project = projects[0]

    const [collaborators] = await connection.execute(
      `SELECT pc.*, 
              u.username, 
              u.employee_id,
              u.email,
              CONCAT(COALESCE(u.username, pc.collaborator_employee_id), 
                     ' (', COALESCE(u.employee_id, pc.collaborator_employee_id), ')') as display_name
       FROM project_collaborators pc
       LEFT JOIN users u ON pc.user_id = u.id
       WHERE pc.project_id = ? 
       ORDER BY pc.added_at DESC`,
      [projectId]
    )

    res.json({ 
      success: true, 
      project, 
      collaborators 
    })
  } catch (error) {
    console.error('Failed to get project:', error)
    res.status(500).json({ 
      success: false, 
      message: 'Unable to fetch project',
      error: error.message 
    })
  } finally {
    connection.release()
  }
})

// List projects (FIXED - shows only user's projects or all if manager)
router.get('/', verifyToken, async (req, res) => {
  const connection = await pool.getConnection()
  try {
    const userId = req.user?.id
    const userIsManager = req.user?.role === 'Manager'
    const employeeId = req.user?.employeeId || req.user?.employee_id
    
    console.log('Listing projects for user:', {
      userId,
      isManager: userIsManager,
      employeeId,
      userRole: req.user?.role,
      username: req.user?.username
    })

    // Ensure columns exist
    await ensureColumnExists(connection, 'customer', 'VARCHAR(255) DEFAULT NULL')
    await ensureColumnExists(connection, 'priority', "VARCHAR(50) DEFAULT 'medium'")
    await ensureColumnExists(connection, 'start_date', 'DATE DEFAULT NULL')
    await ensureColumnExists(connection, 'end_date', 'DATE DEFAULT NULL')
    await ensureColumnExists(connection, 'budget', 'DECIMAL(15,2) DEFAULT NULL')
    await ensureColumnExists(connection, 'status', "VARCHAR(20) DEFAULT 'active'")

    if (userIsManager) {
      // Managers see all projects
      const [rows] = await connection.execute(`
        SELECT p.*, 
               COUNT(DISTINCT pc.id) as collaborators_count
        FROM projects p
        LEFT JOIN project_collaborators pc ON p.id = pc.project_id
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `)
      console.log('Manager sees', rows.length, 'projects')
      return res.json({ success: true, projects: rows })
    } else {
      // Non-managers see projects they're assigned to
      const [rows] = await connection.execute(`
        SELECT DISTINCT p.*, 
               COUNT(DISTINCT pc.id) as collaborators_count
        FROM projects p
        LEFT JOIN project_collaborators pc ON p.id = pc.project_id
        WHERE (
          p.created_by = ? OR
          pc.user_id = ? OR
          pc.collaborator_employee_id = ? OR
          pc.collaborator_employee_id = ?
        )
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `, [userId, userId, employeeId, req.user?.username])
      
      console.log('Non-manager sees', rows.length, 'projects')
      return res.json({ success: true, projects: rows })
    }
  } catch (error) {
    console.error('Failed to list projects:', error)
    res.status(500).json({ 
      success: false, 
      message: 'Unable to fetch projects',
      error: error.message 
    })
  } finally {
    connection.release()
  }
})

// ========== COLLABORATOR ROUTES ==========

// Add collaborator to a project (FIXED - handles both user_id and employee_id correctly)
router.post('/:id/collaborators', verifyToken, isManager, async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    
    const projectId = parseInt(req.params.id)
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    const { 
      userId, 
      employeeId, 
      collaboratorEmployeeId, 
      role = 'Contributor' 
    } = req.body
    
    const addedBy = req.user?.id || null

    console.log('Adding collaborator:', {
      projectId,
      body: req.body,
      userId,
      employeeId,
      collaboratorEmployeeId,
      role
    })

    // Check if project exists
    const [projects] = await connection.execute('SELECT * FROM projects WHERE id = ?', [projectId])
    if (projects.length === 0) {
      await connection.rollback()
      return res.status(404).json({ success: false, message: 'Project not found' })
    }

    // Determine the actual user_id and employee_id
    let finalUserId = null
    let finalEmployeeId = null

    // If userId is provided
    if (userId) {
      // Check if userId exists in users table
      const [users] = await connection.execute('SELECT id, employee_id FROM users WHERE id = ?', [userId])
      if (users.length > 0) {
        finalUserId = users[0].id
        finalEmployeeId = users[0].employee_id
      }
    }
    
    // If employeeId is provided but userId isn't found
    if ((employeeId || collaboratorEmployeeId) && !finalUserId) {
      const searchId = employeeId || collaboratorEmployeeId
      const [users] = await connection.execute(
        'SELECT id, employee_id FROM users WHERE employee_id = ? OR username = ?',
        [searchId, searchId]
      )
      if (users.length > 0) {
        finalUserId = users[0].id
        finalEmployeeId = users[0].employee_id
      } else {
        // If not found in users table, store as collaborator_employee_id only
        finalEmployeeId = searchId
      }
    }

    if (!finalUserId && !finalEmployeeId) {
      await connection.rollback()
      return res.status(400).json({ 
        success: false, 
        message: 'Could not identify user. Please provide a valid user ID, employee ID, or username.' 
      })
    }

    // Check if collaborator already exists
    const [existingCollabs] = await connection.execute(
      'SELECT * FROM project_collaborators WHERE project_id = ? AND (user_id = ? OR collaborator_employee_id = ?)',
      [projectId, finalUserId, finalEmployeeId]
    )
    
    if (existingCollabs.length > 0) {
      await connection.rollback()
      return res.status(400).json({ 
        success: false, 
        message: 'User is already a collaborator on this project' 
      })
    }

    // Add collaborator
    await connection.execute(
      'INSERT INTO project_collaborators (project_id, user_id, collaborator_employee_id, role, added_by) VALUES (?, ?, ?, ?, ?)',
      [projectId, finalUserId || null, finalEmployeeId || null, role, addedBy]
    )

    // Update user's assigned_project_id if we have a user_id
    if (finalUserId) {
      await connection.execute(
        'UPDATE users SET assigned_project_id = ? WHERE id = ?',
        [projectId, finalUserId]
      )
    }

    await connection.commit()
    
    res.json({ success: true, message: 'Collaborator added successfully' })
  } catch (error) {
    await connection.rollback()
    console.error('Failed to add collaborator:', error)
    res.status(500).json({ 
      success: false, 
      message: 'Unable to add collaborator', 
      error: error.message 
    })
  } finally {
    connection.release()
  }
})

// Get collaborators for a project
router.get('/:id/collaborators', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id)
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    const [collaborators] = await pool.execute(
      `SELECT pc.*, 
              u.username, 
              u.employee_id,
              u.email,
              CONCAT(COALESCE(u.username, pc.collaborator_employee_id), 
                     ' (', COALESCE(u.employee_id, pc.collaborator_employee_id), ')') as display_name
       FROM project_collaborators pc
       LEFT JOIN users u ON pc.user_id = u.id
       WHERE pc.project_id = ? 
       ORDER BY pc.added_at DESC`,
      [projectId]
    )

    res.json({ success: true, collaborators })
  } catch (error) {
    console.error('Failed to fetch collaborators:', error)
    res.status(500).json({ success: false, message: 'Unable to fetch collaborators', error: error.message })
  }
})

// Update a collaborator
router.put('/:projectId/collaborators/:collabId', verifyToken, isManager, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    const collabId = parseInt(req.params.collabId)
    if (!projectId || !collabId) return res.status(400).json({ success: false, message: 'Invalid ids' })

    const { role } = req.body
    
    await pool.execute(
      'UPDATE project_collaborators SET role = ? WHERE id = ? AND project_id = ?',
      [role || 'Collaborator', collabId, projectId]
    )

    res.json({ success: true, message: 'Collaborator updated' })
  } catch (error) {
    console.error('Failed to update collaborator:', error)
    res.status(500).json({ success: false, message: 'Unable to update collaborator' })
  }
})

// Delete a collaborator
router.delete('/:projectId/collaborators/:collabId', verifyToken, isManager, async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    
    const projectId = parseInt(req.params.projectId)
    const collabId = parseInt(req.params.collabId)
    if (!projectId || !collabId) return res.status(400).json({ success: false, message: 'Invalid ids' })

    // Get collaborator details
    const [collaborators] = await connection.execute(
      'SELECT * FROM project_collaborators WHERE id = ? AND project_id = ?',
      [collabId, projectId]
    )
    
    if (collaborators.length === 0) {
      await connection.rollback()
      return res.status(404).json({ success: false, message: 'Collaborator not found' })
    }
    
    const collaborator = collaborators[0]

    // Delete collaborator
    await connection.execute(
      'DELETE FROM project_collaborators WHERE id = ? AND project_id = ?',
      [collabId, projectId]
    )

    // Clear assigned_project_id if we have a user_id
    if (collaborator.user_id) {
      await connection.execute(
        'UPDATE users SET assigned_project_id = NULL WHERE id = ? AND assigned_project_id = ?',
        [collaborator.user_id, projectId]
      )
    }

    await connection.commit()
    
    res.json({ success: true, message: 'Collaborator deleted' })
  } catch (error) {
    await connection.rollback()
    console.error('Failed to delete collaborator:', error)
    res.status(500).json({ success: false, message: 'Unable to delete collaborator' })
  } finally {
    connection.release()
  }
})

// Delete project - MANAGER ONLY
router.delete('/:id', verifyToken, isManager, async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    
    const projectId = parseInt(req.params.id)
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    // Get all collaborators
    const [collaborators] = await connection.execute(
      'SELECT user_id, collaborator_employee_id FROM project_collaborators WHERE project_id = ?',
      [projectId]
    )

    // Delete collaborators
    await connection.execute('DELETE FROM project_collaborators WHERE project_id = ?', [projectId])

    // Clear assignment for users
    for (const collab of collaborators) {
      if (collab.user_id) {
        await connection.execute('UPDATE users SET assigned_project_id = NULL WHERE id = ?', [collab.user_id])
      }
    }

    // Delete project
    await connection.execute('DELETE FROM projects WHERE id = ?', [projectId])

    await connection.commit()
    
    res.json({ success: true, message: 'Project deleted' })
  } catch (error) {
    await connection.rollback()
    console.error('Failed to delete project:', error)
    res.status(500).json({ success: false, message: 'Unable to delete project' })
  } finally {
    connection.release()
  }
})

// Update project status
router.put('/:id/status', verifyToken, isManager, async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    
    const projectId = parseInt(req.params.id)
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    const { status } = req.body
    const validStatuses = ['active', 'completed', 'on-hold', 'overdue', 'planning']
    
    if (!validStatuses.includes(status)) {
      await connection.rollback()
      return res.status(400).json({ success: false, message: 'Invalid status' })
    }

    // Ensure status column exists
    await ensureColumnExists(connection, 'status', "VARCHAR(20) DEFAULT 'active'")

    await connection.execute('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, projectId])
    
    await connection.commit()
    
    res.json({ success: true, message: 'Project status updated' })
  } catch (error) {
    await connection.rollback()
    console.error('Failed to update project status:', error)
    res.status(500).json({ success: false, message: 'Unable to update project status' })
  } finally {
    connection.release()
  }
})

// Get project statistics
router.get('/stats', verifyToken, async (req, res) => {
  const connection = await pool.getConnection()
  try {
    const userId = req.user?.id
    
    // Ensure status column exists
    await ensureColumnExists(connection, 'status', "VARCHAR(20) DEFAULT 'active'")

    const [total] = await connection.execute('SELECT COUNT(*) as count FROM projects WHERE created_by = ?', [userId])
    const [completed] = await connection.execute("SELECT COUNT(*) as count FROM projects WHERE created_by = ? AND status = 'completed'", [userId])
    const [active] = await connection.execute("SELECT COUNT(*) as count FROM projects WHERE created_by = ? AND status = 'active'", [userId])
    const [overdue] = await connection.execute("SELECT COUNT(*) as count FROM projects WHERE created_by = ? AND status = 'overdue'", [userId])

    res.json({
      success: true,
      stats: {
        total: total[0]?.count || 0,
        completed: completed[0]?.count || 0,
        active: active[0]?.count || 0,
        overdue: overdue[0]?.count || 0
      }
    })
  } catch (error) {
    console.error('Failed to fetch project stats:', error)
    res.status(500).json({ success: false, message: 'Unable to fetch project statistics' })
  } finally {
    connection.release()
  }
})



// ========== TASK MANAGEMENT ROUTES ==========

// Get all tasks for a project
router.get('/:projectId/tasks', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    const userId = req.user?.id
    const isManager = req.user?.role === 'Manager'
    
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    // Check if user has access to project
    const [projectAccess] = await pool.execute(
      `SELECT p.* FROM projects p
       LEFT JOIN project_collaborators pc ON p.id = pc.project_id
       WHERE p.id = ? AND (
         p.created_by = ? OR 
         pc.user_id = ? OR 
         pc.collaborator_employee_id = ?
       )`,
      [projectId, userId, userId, req.user?.employeeId]
    )
    
    if (projectAccess.length === 0 && !isManager) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    const [tasks] = await pool.execute(
      `SELECT t.*, 
              u.username as assigned_to_name,
              u.employee_id as assigned_to_employee_id,
              uc.username as created_by_name,
              COUNT(DISTINCT tu.id) as updates_count,
              COUNT(DISTINCT ta.id) as attachments_count
       FROM project_tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users uc ON t.created_by = uc.id
       LEFT JOIN task_updates tu ON t.id = tu.task_id
       LEFT JOIN task_attachments ta ON t.id = ta.task_id
       WHERE t.project_id = ?
       GROUP BY t.id
       ORDER BY 
         CASE t.priority 
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
         END,
         t.due_date ASC,
         t.created_at DESC`,
      [projectId]
    )

    // Calculate project completion percentage
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(t => t.status === 'completed').length
    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    res.json({
      success: true,
      tasks,
      stats: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        pending: tasks.filter(t => t.status === 'pending').length,
        blocked: tasks.filter(t => t.status === 'blocked').length,
        completionPercentage
      }
    })
  } catch (error) {
    console.error('Failed to fetch tasks:', error)
    res.status(500).json({ success: false, message: 'Unable to fetch tasks' })
  }
})

// Create a new task
router.post('/:projectId/tasks', verifyToken, async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    
    const projectId = parseInt(req.params.projectId)
    const userId = req.user?.id
    const isManager = req.user?.role === 'Manager'
    
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project id' })

    const { 
      title, 
      description, 
      assigned_to, 
      priority = 'medium', 
      due_date,
      estimated_hours 
    } = req.body

    if (!title) {
      return res.status(400).json({ success: false, message: 'Task title is required' })
    }

    // Only managers or project creators can create tasks
    const [project] = await connection.execute(
      'SELECT * FROM projects WHERE id = ? AND created_by = ?',
      [projectId, userId]
    )
    
    if (project.length === 0 && !isManager) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only managers or project creators can create tasks' 
      })
    }

    // Insert task
    const [result] = await connection.execute(
      `INSERT INTO project_tasks 
       (project_id, title, description, assigned_to, priority, due_date, estimated_hours, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, title, description || null, assigned_to || null, priority, due_date || null, estimated_hours || null, userId]
    )

    const taskId = result.insertId

    // Create initial task update
    await connection.execute(
      `INSERT INTO task_updates (task_id, user_id, content, old_status, new_status)
       VALUES (?, ?, ?, ?, ?)`,
      [taskId, userId, 'Task created', null, 'pending']
    )

    // Send notification to assigned user if any
    if (assigned_to) {
      const [assignedUser] = await connection.execute(
        'SELECT email, username FROM users WHERE id = ?',
        [assigned_to]
      )
      
      if (assignedUser.length > 0 && assignedUser[0].email) {
        const subject = `New Task Assigned: ${title}`
        const text = `Hello ${assignedUser[0].username},\n\nYou have been assigned a new task in project.\n\nTask: ${title}\n\nPlease check your dashboard for more details.\n\nRegards,\nManagement Team`
        sendMail({ to: assignedUser[0].email, subject, text }).catch(e => console.warn('Email notify failed:', e?.message || e))
      }
    }

    await connection.commit()

    res.json({
      success: true,
      message: 'Task created successfully',
      taskId
    })
  } catch (error) {
    await connection.rollback()
    console.error('Failed to create task:', error)
    res.status(500).json({ success: false, message: 'Unable to create task' })
  } finally {
    connection.release()
  }
})

// Update task status
router.put('/:projectId/tasks/:taskId/status', verifyToken, async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    
    const projectId = parseInt(req.params.projectId)
    const taskId = parseInt(req.params.taskId)
    const userId = req.user?.id
    
    if (!projectId || !taskId) {
      return res.status(400).json({ success: false, message: 'Invalid IDs' })
    }

    const { status, comment } = req.body
    
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' })
    }

    // Check if user can update this task
    const [task] = await connection.execute(
      `SELECT t.*, p.created_by as project_creator 
       FROM project_tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE t.id = ? AND t.project_id = ?`,
      [taskId, projectId]
    )
    
    if (task.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' })
    }

    const currentTask = task[0]
    
    // Check permissions: assigned user, creator, or manager can update
    const canUpdate = currentTask.assigned_to === userId || 
                     currentTask.created_by === userId || 
                     currentTask.project_creator === userId ||
                     req.user?.role === 'Manager'
    
    if (!canUpdate) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to update this task' 
      })
    }

    const oldStatus = currentTask.status
    const completedAt = status === 'completed' ? new Date() : null

    // Update task
    await connection.execute(
      `UPDATE project_tasks 
       SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, completedAt, taskId]
    )

    // Create task update record
    await connection.execute(
      `INSERT INTO task_updates (task_id, user_id, content, old_status, new_status)
       VALUES (?, ?, ?, ?, ?)`,
      [taskId, userId, comment || `Status changed from ${oldStatus} to ${status}`, oldStatus, status]
    )

    // Check if all tasks are completed and update project status if so
    if (status === 'completed') {
      const [allTasks] = await connection.execute(
        'SELECT COUNT(*) as total, SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed FROM project_tasks WHERE project_id = ?',
        [projectId]
      )
      
      if (allTasks[0].total > 0 && allTasks[0].total === allTasks[0].completed) {
        await connection.execute(
          'UPDATE projects SET status = "completed", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [projectId]
        )
      }
    }

    await connection.commit()

    res.json({
      success: true,
      message: 'Task status updated'
    })
  } catch (error) {
    await connection.rollback()
    console.error('Failed to update task status:', error)
    res.status(500).json({ success: false, message: 'Unable to update task status' })
  } finally {
    connection.release()
  }
})

// Get task details with updates
router.get('/:projectId/tasks/:taskId', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    const taskId = parseInt(req.params.taskId)
    
    if (!projectId || !taskId) {
      return res.status(400).json({ success: false, message: 'Invalid IDs' })
    }

    // Get task details
    const [tasks] = await pool.execute(
      `SELECT t.*, 
              u.username as assigned_to_name,
              u.email as assigned_to_email,
              u.employee_id as assigned_to_employee_id,
              uc.username as created_by_name,
              p.name as project_name
       FROM project_tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users uc ON t.created_by = uc.id
       JOIN projects p ON t.project_id = p.id
       WHERE t.id = ? AND t.project_id = ?`,
      [taskId, projectId]
    )
    
    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' })
    }

    // Get task updates
    const [updates] = await pool.execute(
      `SELECT tu.*, u.username, u.employee_id
       FROM task_updates tu
       JOIN users u ON tu.user_id = u.id
       WHERE tu.task_id = ?
       ORDER BY tu.created_at DESC`,
      [taskId]
    )

    // Get task attachments
    const [attachments] = await pool.execute(
      `SELECT ta.*, u.username as uploaded_by_name
       FROM task_attachments ta
       LEFT JOIN users u ON ta.uploaded_by = u.id
       WHERE ta.task_id = ?
       ORDER BY ta.uploaded_at DESC`,
      [taskId]
    )

    res.json({
      success: true,
      task: tasks[0],
      updates,
      attachments
    })
  } catch (error) {
    console.error('Failed to fetch task details:', error)
    res.status(500).json({ success: false, message: 'Unable to fetch task details' })
  }
})

// Add task comment/update
router.post('/:projectId/tasks/:taskId/updates', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    const taskId = parseInt(req.params.taskId)
    const userId = req.user?.id
    
    if (!projectId || !taskId) {
      return res.status(400).json({ success: false, message: 'Invalid IDs' })
    }

    const { content } = req.body
    
    if (!content) {
      return res.status(400).json({ success: false, message: 'Content is required' })
    }

    // Check if task exists and user has access
    const [task] = await pool.execute(
      `SELECT t.* FROM project_tasks t
       JOIN project_collaborators pc ON t.project_id = pc.project_id
       WHERE t.id = ? AND t.project_id = ? AND (
         t.assigned_to = ? OR 
         t.created_by = ? OR 
         pc.user_id = ? OR 
         pc.collaborator_employee_id = ?
       )`,
      [taskId, projectId, userId, userId, userId, req.user?.employeeId]
    )
    
    if (task.length === 0 && req.user?.role !== 'Manager') {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    await pool.execute(
      'INSERT INTO task_updates (task_id, user_id, content) VALUES (?, ?, ?)',
      [taskId, userId, content]
    )

    res.json({
      success: true,
      message: 'Update added successfully'
    })
  } catch (error) {
    console.error('Failed to add task update:', error)
    res.status(500).json({ success: false, message: 'Unable to add update' })
  }
})

// ========== FILE MANAGEMENT ROUTES ==========

// Upload project file
router.post('/:projectId/files', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    const userId = req.user?.id
    
    console.log('File upload request received:', {
      projectId,
      userId,
      headers: req.headers,
      bodyKeys: Object.keys(req.body || {}),
      files: req.files
    })

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Invalid project id' })
    }

    // Check if user has access to project
    const [projectAccess] = await pool.execute(
      `SELECT p.* FROM projects p
       LEFT JOIN project_collaborators pc ON p.id = pc.project_id
       WHERE p.id = ? AND (
         p.created_by = ? OR 
         pc.user_id = ? OR 
         pc.collaborator_employee_id = ? OR
         ? = 'Manager'
       )`,
      [projectId, userId, userId, req.user?.employeeId, req.user?.role]
    )
    
    if (projectAccess.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to upload files to this project' 
      })
    }

    // Note: For file uploads, you need to use middleware like multer
    // First install multer: npm install multer
    // Then add to your projects.js:
    // const multer = require('multer')
    // const upload = multer({ dest: 'uploads/' })
    // And change the route to: router.post('/:projectId/files', verifyToken, upload.single('file'), async (req, res) => {

    // For now, let's create a simple implementation
    if (!req.body || !req.body.name) {
      return res.status(400).json({ 
        success: false, 
        message: 'File name is required' 
      })
    }

    // Create a simple file record (you'll need to implement actual file storage)
    const [result] = await pool.execute(
      `INSERT INTO project_files 
       (project_id, name, description, file_url, file_type, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        req.body.name || 'Untitled',
        req.body.description || '',
        '/uploads/temp-placeholder', // You need to implement actual file storage
        req.body.fileType || 'unknown',
        req.body.fileSize || 0,
        userId
      ]
    )

    res.json({
      success: true,
      message: 'File uploaded successfully',
      fileId: result.insertId
    })
  } catch (error) {
    console.error('Failed to upload file:', error)
    res.status(500).json({ 
      success: false, 
      message: 'Unable to upload file',
      error: error.message 
    })
  }
})

// Get project files
router.get('/:projectId/files', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    const userId = req.user?.id
    
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Invalid project id' })
    }

    // Check if user has access to project
    const [projectAccess] = await pool.execute(
      `SELECT p.* FROM projects p
       LEFT JOIN project_collaborators pc ON p.id = pc.project_id
       WHERE p.id = ? AND (
         p.created_by = ? OR 
         pc.user_id = ? OR 
         pc.collaborator_employee_id = ? OR
         ? = 'Manager'
       )`,
      [projectId, userId, userId, req.user?.employeeId, req.user?.role]
    )
    
    if (projectAccess.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have access to this project' 
      })
    }

    const [files] = await pool.execute(
      `SELECT pf.*, u.username as uploaded_by_name
       FROM project_files pf
       LEFT JOIN users u ON pf.uploaded_by = u.id
       WHERE pf.project_id = ?
       ORDER BY pf.uploaded_at DESC`,
      [projectId]
    )

    res.json({
      success: true,
      files: files || []
    })
  } catch (error) {
    console.error('Failed to fetch files:', error)
    res.status(500).json({ 
      success: false, 
      message: 'Unable to fetch files',
      error: error.message 
    })
  }
})

// Delete project file
router.delete('/:projectId/files/:fileId', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    const fileId = parseInt(req.params.fileId)
    const userId = req.user?.id
    const isManager = req.user?.role === 'Manager'
    
    if (!projectId || !fileId) {
      return res.status(400).json({ success: false, message: 'Invalid IDs' })
    }

    // Get file details
    const [files] = await pool.execute(
      'SELECT * FROM project_files WHERE id = ? AND project_id = ?',
      [fileId, projectId]
    )
    
    if (files.length === 0) {
      return res.status(404).json({ success: false, message: 'File not found' })
    }
    
    const file = files[0]
    
    // Check permissions: only file uploader or manager can delete
    if (file.uploaded_by !== userId && !isManager) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to delete this file' 
      })
    }

    await pool.execute(
      'DELETE FROM project_files WHERE id = ? AND project_id = ?',
      [fileId, projectId]
    )

    // TODO: Also delete the actual file from storage

    res.json({
      success: true,
      message: 'File deleted successfully'
    })
  } catch (error) {
    console.error('Failed to delete file:', error)
    res.status(500).json({ 
      success: false, 
      message: 'Unable to delete file',
      error: error.message 
    })
  }
})

// Debug endpoint to check user's project assignments
router.get('/debug/my-assignments', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id
    const employeeId = req.user?.employeeId || req.user?.employee_id
    
    console.log('Debug - User info:', req.user)
    
    // Check what projects user is directly assigned to
    const [directAssignments] = await pool.execute(
      'SELECT assigned_project_id FROM users WHERE id = ?',
      [userId]
    )
    
    // Check project_collaborators entries
    const [collaboratorEntries] = await pool.execute(
      'SELECT * FROM project_collaborators WHERE user_id = ? OR collaborator_employee_id = ?',
      [userId, employeeId]
    )
    
    // Check projects created by user
    const [createdProjects] = await pool.execute(
      'SELECT * FROM projects WHERE created_by = ?',
      [userId]
    )
    
    res.json({
      success: true,
      userInfo: {
        id: userId,
        employeeId: employeeId,
        username: req.user?.username,
        role: req.user?.role
      },
      directAssignments,
      collaboratorEntries,
      createdProjects
    })
  } catch (error) {
    console.error('Debug error:', error)
    res.status(500).json({ success: false, message: 'Debug failed' })
  }
})

export default router
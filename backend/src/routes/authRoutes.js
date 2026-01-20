// routes/authRoutes.js
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import pool from '../db.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? 'vickhardth-site-pulse-secret'

// Middleware to verify token and attach user info
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

// Get all users (for managers only)
router.get('/users', verifyToken, async (req, res) => {
  try {
    console.log('📋 [GET /api/auth/users] Request received from user:', req.user);
    
    const role = req.user.role || ''
    const r = role.toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (!isManagerish) {
      return res.status(403).json({ 
        success: false,
        message: 'Only managers can view all users' 
      })
    }

    const [users] = await pool.execute(`
      SELECT 
        id, 
        username, 
        employee_id, 
        role, 
        manager_id, 
        dob,
        email,
        phone,
        created_at
      FROM users
      WHERE role != 'admin'
      ORDER BY role DESC, username ASC
    `)

    console.log(`📋 [GET /api/auth/users] Found ${users.length} users`);
    
    res.json({ 
      success: true,
      users: users || [] 
    })
  } catch (error) {
    console.error('❌ Failed to fetch users:', error)
    res.status(500).json({ 
      success: false,
      message: 'Unable to fetch users: ' + error.message 
    })
  }
})

// Get user by ID
router.get('/users/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.params.id
    const [rows] = await pool.execute(
      'SELECT id, username, employee_id, role, manager_id, dob, email, phone FROM users WHERE id = ?',
      [userId]
    )
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    res.json({ success: true, user: rows[0] })
  } catch (error) {
    console.error('Failed to fetch user:', error)
    res.status(500).json({ success: false, message: 'Unable to fetch user' })
  }
})

export default router
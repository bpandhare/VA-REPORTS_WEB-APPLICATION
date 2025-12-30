import { Router } from 'express'
import pool from '../db.js'
import jwt from 'jsonwebtoken'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? 'vickhardth-site-pulse-secret'

// Reuse the same verifyToken middleware from your projects.js
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

// Get current user info
router.get('/me', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id
    
    const [rows] = await pool.execute(
      'SELECT id, username, email, role, employee_id FROM users WHERE id = ?',
      [userId]
    )
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    res.json({ success: true, ...rows[0] })
  } catch (error) {
    console.error('Failed to fetch user info:', error)
    res.status(500).json({ success: false, message: 'Unable to fetch user info' })
  }
})

export default router
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import pool from '../db.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? 'vickhardth-site-pulse-secret'

// Middleware to verify token and attach user info
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' })
  }

  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' })
  }
}

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Employee activity route is working!' })
})

// Get all employees (for Manager/Team Leader to see team structure)
// activityRoutes.js - Update the /employees endpoint
// In your employeeActivity.js file, update the /employees endpoint:
router.get('/employees', verifyToken, async (req, res) => {
  try {
    console.log('👥 [GET /api/activity/employees] Request received from user:', req.user);
    
    const role = req.user.role || ''
    const r = role.toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (!isManagerish) {
      return res.status(403).json({ 
        success: false,
        message: 'Only Managers or Team Leaders can view all employees' 
      })
    }

    const [employees] = await pool.execute(`
      SELECT 
        id, 
        username, 
        employee_id, 
        role, 
        manager_id AS managerId, 
        dob,
        email,
        phone
      FROM users
      WHERE role != 'admin'
      ORDER BY role DESC, username ASC
    `)

    console.log(`👥 [GET /api/activity/employees] Found ${employees.length} employees`);
    
    res.json({ 
      success: true,
      employees: employees || [] 
    })
  } catch (error) {
    console.error('❌ Failed to fetch employees', error)
    res.status(500).json({ 
      success: false,
      message: 'Unable to fetch employees: ' + error.message 
    })
  }
})

// Get all activities based on user role and hierarchy
router.get('/activities', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const role = req.user.role || ''
    const { page = 1, limit = 20 } = req.query

    const pageNum = parseInt(page) || 1
    const limitNum = parseInt(limit) || 20
    const offset = (pageNum - 1) * limitNum

    // Get user details for filtering
    const [userRows] = await pool.execute(
      'SELECT username, employee_id FROM users WHERE id = ?',
      [userId]
    )
    
    const username = userRows[0]?.username
    const employeeId = userRows[0]?.employee_id

    // Build WHERE clause based on role
    let whereClause = ''
    let params = []
    let countParams = []

    const r = (role || '').toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (!isManagerish) {
      // Regular employee - see only their own activities
      whereClause = ' WHERE (a.engineer_id = ? OR a.engineer_name = ? OR u.id = ?)'
      params = [employeeId, username, userId, limitNum, offset]
      countParams = [employeeId, username, userId]
    } else {
      // Manager - see all activities
      whereClause = ''
      params = [limitNum, offset]
      countParams = []
    }

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM activities a
      LEFT JOIN users u ON (a.engineer_id = u.employee_id OR a.engineer_name = u.username)
      ${whereClause}
    `

    // Main query
    const mainQuery = `
      SELECT
        a.id,
        DATE_FORMAT(a.date, '%Y-%m-%d') as date,
        TIME_FORMAT(a.time, '%H:%i:%s') as time,
        COALESCE(u.username, a.engineer_name) as engineer_name,
        COALESCE(u.employee_id, a.engineer_id) as engineer_id,
        a.project,
        a.location,
        a.activity_target,
        a.problem,
        a.status,
        a.leave_reason,
        TIME_FORMAT(a.start_time, '%H:%i:%s') as start_time,
        TIME_FORMAT(a.end_time, '%H:%i:%s') as end_time,
        a.activity_type,
        DATE_FORMAT(a.logged_at, '%Y-%m-%d %H:%i:%s') as logged_at
      FROM activities a
      LEFT JOIN users u ON (a.engineer_id = u.employee_id OR a.engineer_name = u.username)
      ${whereClause}
      ORDER BY a.date DESC, a.logged_at DESC
      LIMIT ? OFFSET ?
    `

    // Execute queries
    const [countResult] = await pool.execute(countQuery, countParams)
    const [activities] = await pool.execute(mainQuery, params)

    const total = countResult[0]?.total || 0

    res.json({
      success: true,
      activities: activities || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        totalPages: Math.ceil(total / limitNum)
      },
    })
  } catch (error) {
    console.error('Failed to fetch activities:', error)
    res.status(500).json({ 
      success: false,
      message: 'Unable to fetch activities: ' + error.message,
      error: error.toString()
    })
  }
})

// Get activities for a specific date
router.get('/activities/:date', verifyToken, async (req, res) => {
  try {
    const date = req.params.date
    const userId = req.user.id
    const role = req.user.role || ''

    // Get user details for filtering
    const [userRows] = await pool.execute(
      'SELECT username, employee_id FROM users WHERE id = ?',
      [userId]
    )
    
    const username = userRows[0]?.username
    const employeeId = userRows[0]?.employee_id

    // Build WHERE clause based on role
    let whereClause = 'WHERE DATE(a.date) = DATE(?)'
    let params = [date]

    const r = (role || '').toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (!isManagerish) {
      // Regular employee - see only their own activities
      whereClause += ' AND (a.engineer_id = ? OR a.engineer_name = ? OR u.id = ?)'
      params.push(employeeId, username, userId)
    }

    const query = `
      SELECT
        a.id,
        DATE_FORMAT(a.date, '%Y-%m-%d') as date,
        TIME_FORMAT(a.time, '%H:%i:%s') as time,
        COALESCE(u.username, a.engineer_name) as engineer_name,
        COALESCE(u.employee_id, a.engineer_id) as engineer_id,
        a.project,
        a.location,
        a.activity_target,
        a.problem,
        a.status,
        a.leave_reason,
        TIME_FORMAT(a.start_time, '%H:%i:%s') as start_time,
        TIME_FORMAT(a.end_time, '%H:%i:%s') as end_time,
        a.activity_type,
        DATE_FORMAT(a.logged_at, '%Y-%m-%d %H:%i:%s') as logged_at
      FROM activities a
      LEFT JOIN users u ON (a.engineer_id = u.employee_id OR a.engineer_name = u.username)
      ${whereClause}
      ORDER BY a.logged_at DESC
    `

    const [activities] = await pool.execute(query, params)
    
    res.json({
      success: true,
      activities: activities || [],
      date
    })
  } catch (error) {
    console.error('Failed to fetch activities for date:', error)
    res.status(500).json({ 
      success: false,
      message: 'Unable to fetch activities: ' + error.message
    })
  }
})

// Get subordinates for a Team Leader (direct reports)
router.get('/subordinates', verifyToken, async (req, res) => {
  try {
    const role = req.user.role || ''
    const userId = req.user.id
    const r = role.toLowerCase()

    // Allow Team Leaders and Managers to fetch direct reports
    const allowed = r.includes('team leader') || r.includes('manager') || r.includes('group leader')
    if (!allowed) {
      return res.status(403).json({ message: 'Only Team Leaders or Managers can view subordinates' })
    }

    const [subordinates] = await pool.execute(`
      SELECT id, username, employee_id, role, manager_id AS managerId, dob
      FROM users
      WHERE manager_id = ?
      ORDER BY username ASC
    `, [userId])

    res.json({ subordinates: subordinates || [] })
  } catch (error) {
    console.error('Failed to fetch subordinates', error)
    res.status(500).json({ message: 'Unable to fetch subordinates' })
  }
})

// Get activity summary/statistics by role
router.get('/summary', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const role = req.user.role
    const user = { id: userId }

    let query = ''
    let params = []

    const r = (role || '').toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (isManagerish) {
      // Total activities across all employees
      query = `
        SELECT COUNT(*) as totalActivities, COUNT(DISTINCT engineer_name) as activeEmployees
        FROM activities
        WHERE DATE(date) = CURDATE()
      `
      params = []
    } else {
      // Personal activity count
      query = `
        SELECT COUNT(*) as totalActivities
        FROM activities a
        LEFT JOIN users u ON (a.engineer_id = u.employee_id OR a.engineer_name = u.username)
        WHERE (a.engineer_id = ? OR a.engineer_name = ? OR u.id = ?)
        AND DATE(a.date) = CURDATE()
      `
      
      const [userRows] = await pool.execute(
        'SELECT username, employee_id FROM users WHERE id = ?',
        [userId]
      )
      
      const username = userRows[0]?.username
      const employeeId = userRows[0]?.employee_id
      
      params = [employeeId, username, userId]
    }

    const [summary] = await pool.execute(query, params)

    res.json({ summary: summary[0] || { totalActivities: 0, activeEmployees: 0 } })
  } catch (error) {
    console.error('Failed to fetch summary', error)
    res.status(500).json({ message: 'Unable to fetch summary' })
  }
})

// Get available dates with activities
router.get('/available-dates', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const role = req.user.role || ''

    const [userRows] = await pool.execute(
      'SELECT username, employee_id FROM users WHERE id = ?',
      [userId]
    )
    
    const username = userRows[0]?.username
    const employeeId = userRows[0]?.employee_id

    let whereClause = ''
    let params = []

    const r = (role || '').toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (!isManagerish) {
      whereClause = 'WHERE (a.engineer_id = ? OR a.engineer_name = ? OR u.id = ?)'
      params = [employeeId, username, userId]
    }

    const query = `
      SELECT DISTINCT DATE(a.date) as date
      FROM activities a
      LEFT JOIN users u ON (a.engineer_id = u.employee_id OR a.engineer_name = u.username)
      ${whereClause}
      ORDER BY a.date DESC
      LIMIT 30
    `

    const [dates] = await pool.execute(query, params)
    
    res.json({
      success: true,
      dates: dates.map(d => d.date) || []
    })
  } catch (error) {
    console.error('Failed to fetch available dates:', error)
    res.status(500).json({ 
      success: false,
      message: 'Unable to fetch dates'
    })
  }
})


// Get date summary (activities for a specific date)
router.get('/date-summary', verifyToken, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const userId = req.user.id
    const role = req.user.role || ''
    
    console.log(`📊 [DATE-SUMMARY] Fetching summary for date: ${date} by user ${userId} (${role})`)

    // Get user details for filtering
    const [userRows] = await pool.execute(
      'SELECT username, employee_id FROM users WHERE id = ?',
      [userId]
    )
    
    const username = userRows[0]?.username
    const employeeId = userRows[0]?.employee_id

    // Build WHERE clause based on role
    let whereClause = 'WHERE DATE(a.date) = DATE(?)'
    let params = [date]

    const r = (role || '').toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (!isManagerish) {
      whereClause += ' AND (a.engineer_id = ? OR a.engineer_name = ? OR u.id = ?)'
      params.push(employeeId, username, userId)
    }

    const query = `
      SELECT
        a.id,
        DATE_FORMAT(a.date, '%Y-%m-%d') as date,
        TIME_FORMAT(a.time, '%H:%i:%s') as time,
        COALESCE(u.username, a.engineer_name) as engineer_name,
        COALESCE(u.employee_id, a.engineer_id) as engineer_id,
        a.project,
        a.location,
        a.activity_target,
        a.problem,
        a.status,
        a.leave_reason,
        TIME_FORMAT(a.start_time, '%H:%i:%s') as start_time,
        TIME_FORMAT(a.end_time, '%H:%i:%s') as end_time,
        a.activity_type,
        DATE_FORMAT(a.logged_at, '%Y-%m-%d %H:%i:%s') as logged_at
      FROM activities a
      LEFT JOIN users u ON (a.engineer_id = u.employee_id OR a.engineer_name = u.username)
      ${whereClause}
      ORDER BY a.logged_at DESC
    `

    console.log('🔍 [DATE-SUMMARY] Activities query:', query)
    console.log('🔍 [DATE-SUMMARY] Activities params:', params)

    const [activities] = await pool.execute(query, params)

    // Also get daily reports for the same date
    let dailyReportsQuery = 'SELECT COUNT(*) as count FROM daily_target_reports WHERE report_date = ?'
    let dailyReportsParams = [date]
    
    if (!isManagerish) {
      dailyReportsQuery += ' AND (user_id = ? OR incharge = ?)'
      dailyReportsParams.push(userId, username)
    }
    
    const [dailyReportsResult] = await pool.execute(dailyReportsQuery, dailyReportsParams)
    const dailyReportCount = dailyReportsResult[0]?.count || 0

    console.log(`📊 Found ${activities.length} activity records and ${dailyReportCount} daily report records for ${date}`)

    res.json({
      success: true,
      date,
      activities: activities || [],
      dailyReportCount,
      totalActivities: activities.length
    })
  } catch (error) {
    console.error('Failed to fetch date summary:', error)
    res.status(500).json({ 
      success: false,
      message: 'Unable to fetch date summary: ' + error.message
    })
  }
})

// Get attendance for a specific date
router.get('/attendance', verifyToken, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const userId = req.user.id
    const role = req.user.role || ''
    
    console.log(`👥 [ATTENDANCE] Fetching for date: ${date} by user ${userId} (${role})`)

    // Build WHERE clause based on role
    let whereClause = 'WHERE DATE(a.date) = DATE(?) AND (a.engineer_name IS NOT NULL AND a.engineer_name != \'\')'
    let params = [date]

    const r = (role || '').toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (!isManagerish) {
      // Get current user's details
      const [userRows] = await pool.execute(
        'SELECT username, employee_id FROM users WHERE id = ?',
        [userId]
      )
      
      const username = userRows[0]?.username
      const employeeId = userRows[0]?.employee_id
      
      whereClause += ' AND (a.engineer_id = ? OR a.engineer_name = ? OR u.id = ?)'
      params.push(employeeId, username, userId)
    }

    const query = `
      SELECT
        COALESCE(u.username, a.engineer_name) as engineer_name,
        COALESCE(u.employee_id, a.engineer_id) as engineer_id,
        a.status,
        a.project,
        a.activity_target,
        TIME_FORMAT(a.start_time, '%H:%i') as start_time,
        TIME_FORMAT(a.end_time, '%H:%i') as end_time,
        a.leave_reason,
        a.problem
      FROM activities a
      LEFT JOIN users u ON (a.engineer_id = u.employee_id OR a.engineer_name = u.username)
      ${whereClause}
      ORDER BY engineer_name
    `

    console.log('🔍 [ATTENDANCE] Activities query:', query)
    console.log('🔍 [ATTENDANCE] Activities params:', params)

    const [attendance] = await pool.execute(query, params)

    // Group by engineer
    const grouped = {}
    attendance.forEach(record => {
      const key = record.engineer_name || 'Unknown'
      if (!grouped[key]) {
        grouped[key] = {
          engineer_name: record.engineer_name,
          engineer_id: record.engineer_id,
          activities: []
        }
      }
      grouped[key].activities.push(record)
    })

    const result = Object.values(grouped)

    res.json({
      success: true,
      date,
      attendance: result,
      totalEngineers: result.length
    })
  } catch (error) {
    console.error('Failed to fetch attendance:', error)
    res.status(500).json({ 
      success: false,
      message: 'Unable to fetch attendance: ' + error.message
    })
  }
})

// Get absentees (users without activities for a given date)
router.get('/absentees', verifyToken, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const userId = req.user.id
    const role = req.user.role || ''

    const r = role.toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (!isManagerish) {
      return res.status(403).json({ 
        success: false,
        message: 'Only managers can view absentees'
      })
    }

    // Get all active users
    const [allUsers] = await pool.execute(`
      SELECT id, username, employee_id, role
      FROM users
      WHERE role != 'admin' AND role != 'Manager'
      ORDER BY username ASC
    `)

    // Get users with activities on the given date
    const [usersWithActivities] = await pool.execute(`
      SELECT DISTINCT COALESCE(u.username, a.engineer_name) as username
      FROM activities a
      LEFT JOIN users u ON (a.engineer_id = u.employee_id OR a.engineer_name = u.username)
      WHERE DATE(a.date) = DATE(?)
        AND (a.engineer_name IS NOT NULL AND a.engineer_name != '')
    `, [date])

    const presentUsernames = new Set(usersWithActivities.map(u => u.username))
    const absentees = allUsers.filter(user => !presentUsernames.has(user.username))

    res.json({
      success: true,
      date,
      absentees,
      totalAbsent: absentees.length,
      totalPresent: presentUsernames.size
    })
  } catch (error) {
    console.error('Failed to fetch absentees:', error)
    res.status(500).json({ 
      success: false,
      message: 'Unable to fetch absentees'
    })
  }
})

export default router
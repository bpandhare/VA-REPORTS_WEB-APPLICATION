// In your routes/timeTracking.js
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import pool from '../db.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? 'vickhardth-site-pulse-secret'

// Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'No token provided' })
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' })
  }
}

// 1. CLOCK IN
router.post('/clock-in', verifyToken, async (req, res) => {
  try {
    const { latitude, longitude, locationName } = req.body
    const userId = req.user.id
    
    // Check if already clocked in
    const [existing] = await pool.execute(
      'SELECT id FROM time_tracking WHERE user_id = ? AND clock_out_time IS NULL',
      [userId]
    )
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You are already clocked in'
      })
    }
    
    // Create new time tracking entry
    const [result] = await pool.execute(
      `INSERT INTO time_tracking 
       (user_id, clock_in_time, clock_in_lat, clock_in_lng, location_name, status) 
       VALUES (?, NOW(), ?, ?, ?, 'clocked_in')`,
      [userId, latitude, longitude, locationName]
    )
    
    res.json({
      success: true,
      message: 'Clocked in successfully',
      data: {
        id: result.insertId,
        clockInTime: new Date().toISOString(),
        location: locationName
      }
    })
    
  } catch (error) {
    console.error('Clock-in error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to clock in',
      error: error.message
    })
  }
})

// 2. CLOCK OUT
router.post('/clock-out', verifyToken, async (req, res) => {
  try {
    const { latitude, longitude, locationName } = req.body
    const userId = req.user.id
    
    // Get active time tracking
    const [activeTrackings] = await pool.execute(
      `SELECT id, clock_in_time FROM time_tracking 
       WHERE user_id = ? AND clock_out_time IS NULL 
       ORDER BY clock_in_time DESC LIMIT 1`,
      [userId]
    )
    
    if (activeTrackings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active clock-in found'
      })
    }
    
    const tracking = activeTrackings[0]
    const clockInTime = new Date(tracking.clock_in_time)
    const clockOutTime = new Date()
    
    // Calculate total hours
    const diffMs = clockOutTime - clockInTime
    const totalHours = diffMs / (1000 * 60 * 60)
    
    // Calculate overtime (if > 8 hours)
    const regularHours = 8
    const overtimeHours = Math.max(0, totalHours - regularHours - (60 / 60)) // Subtract 60min break
    
    // Update time tracking
    await pool.execute(
      `UPDATE time_tracking SET 
        clock_out_time = ?,
        clock_out_lat = ?,
        clock_out_lng = ?,
        total_hours = ?,
        overtime_hours = ?,
        status = 'clocked_out',
        updated_at = NOW()
       WHERE id = ?`,
      [clockOutTime, latitude, longitude, totalHours.toFixed(2), overtimeHours.toFixed(2), tracking.id]
    )
    
    // Calculate today's summary
    const [summary] = await pool.execute(
      `SELECT 
        COUNT(*) as total_days,
        SUM(total_hours) as total_hours,
        SUM(overtime_hours) as total_overtime
       FROM time_tracking 
       WHERE user_id = ? AND DATE(clock_in_time) = CURDATE()`,
      [userId]
    )
    
    res.json({
      success: true,
      message: 'Clocked out successfully',
      data: {
        clockOutTime: clockOutTime.toISOString(),
        totalHours: totalHours.toFixed(2),
        overtimeHours: overtimeHours.toFixed(2),
        todaySummary: summary[0]
      }
    })
    
  } catch (error) {
    console.error('Clock-out error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to clock out',
      error: error.message
    })
  }
})

// 3. START ACTIVITY TIMER
router.post('/activity/start', verifyToken, async (req, res) => {
  try {
    const { projectId, activityType, taskDescription } = req.body
    const userId = req.user.id
    
    // Get active time tracking
    const [activeTrackings] = await pool.execute(
      'SELECT id FROM time_tracking WHERE user_id = ? AND clock_out_time IS NULL',
      [userId]
    )
    
    if (activeTrackings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please clock in first'
      })
    }
    
    const timeTrackingId = activeTrackings[0].id
    
    // Check if already has active activity
    const [activeActivities] = await pool.execute(
      'SELECT id FROM activity_sessions WHERE user_id = ? AND end_time IS NULL',
      [userId]
    )
    
    if (activeActivities.length > 0) {
      // Stop previous activity
      await pool.execute(
        'UPDATE activity_sessions SET end_time = NOW() WHERE id = ?',
        [activeActivities[0].id]
      )
    }
    
    // Start new activity
    const [result] = await pool.execute(
      `INSERT INTO activity_sessions 
       (time_tracking_id, user_id, project_id, activity_type, task_description, start_time) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [timeTrackingId, userId, projectId, activityType, taskDescription]
    )
    
    res.json({
      success: true,
      message: 'Activity timer started',
      data: {
        activityId: result.insertId,
        startTime: new Date().toISOString()
      }
    })
    
  } catch (error) {
    console.error('Start activity error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to start activity timer',
      error: error.message
    })
  }
})

// 4. STOP ACTIVITY TIMER
router.post('/activity/stop', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    
    // Get active activity
    const [activeActivities] = await pool.execute(
      'SELECT id, start_time FROM activity_sessions WHERE user_id = ? AND end_time IS NULL',
      [userId]
    )
    
    if (activeActivities.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active activity found'
      })
    }
    
    const activity = activeActivities[0]
    const startTime = new Date(activity.start_time)
    const endTime = new Date()
    const durationMinutes = Math.round((endTime - startTime) / (1000 * 60))
    
    // Update activity
    await pool.execute(
      'UPDATE activity_sessions SET end_time = ?, duration_minutes = ? WHERE id = ?',
      [endTime, durationMinutes, activity.id]
    )
    
    res.json({
      success: true,
      message: 'Activity timer stopped',
      data: {
        activityId: activity.id,
        durationMinutes,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      }
    })
    
  } catch (error) {
    console.error('Stop activity error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to stop activity timer',
      error: error.message
    })
  }
})

// 5. START BREAK
router.post('/break/start', verifyToken, async (req, res) => {
  try {
    const { breakType, notes } = req.body
    const userId = req.user.id
    
    // Get active time tracking
    const [activeTrackings] = await pool.execute(
      'SELECT id FROM time_tracking WHERE user_id = ? AND clock_out_time IS NULL',
      [userId]
    )
    
    if (activeTrackings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please clock in first'
      })
    }
    
    const timeTrackingId = activeTrackings[0].id
    
    // Start break
    const [result] = await pool.execute(
      `INSERT INTO breaks (time_tracking_id, break_type, start_time, notes) 
       VALUES (?, ?, NOW(), ?)`,
      [timeTrackingId, breakType, notes]
    )
    
    // Update time tracking status
    await pool.execute(
      'UPDATE time_tracking SET status = "on_break" WHERE id = ?',
      [timeTrackingId]
    )
    
    res.json({
      success: true,
      message: 'Break started',
      data: {
        breakId: result.insertId,
        startTime: new Date().toISOString(),
        breakType
      }
    })
    
  } catch (error) {
    console.error('Start break error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to start break',
      error: error.message
    })
  }
})

// 6. END BREAK
router.post('/break/end', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    
    // Get active time tracking
    const [activeTrackings] = await pool.execute(
      'SELECT id FROM time_tracking WHERE user_id = ? AND status = "on_break"',
      [userId]
    )
    
    if (activeTrackings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active break found'
      })
    }
    
    const timeTrackingId = activeTrackings[0].id
    
    // Get active break
    const [activeBreaks] = await pool.execute(
      'SELECT id, start_time FROM breaks WHERE time_tracking_id = ? AND end_time IS NULL',
      [timeTrackingId]
    )
    
    if (activeBreaks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active break found'
      })
    }
    
    const breakRecord = activeBreaks[0]
    const startTime = new Date(breakRecord.start_time)
    const endTime = new Date()
    const durationMinutes = Math.round((endTime - startTime) / (1000 * 60))
    
    // Update break
    await pool.execute(
      'UPDATE breaks SET end_time = ?, duration_minutes = ? WHERE id = ?',
      [endTime, durationMinutes, breakRecord.id]
    )
    
    // Update time tracking status and break minutes
    await pool.execute(
      `UPDATE time_tracking SET 
        status = 'clocked_in',
        break_minutes = break_minutes + ?
       WHERE id = ?`,
      [durationMinutes, timeTrackingId]
    )
    
    res.json({
      success: true,
      message: 'Break ended',
      data: {
        breakId: breakRecord.id,
        durationMinutes,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      }
    })
    
  } catch (error) {
    console.error('End break error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to end break',
      error: error.message
    })
  }
})

// 7. GET TODAY'S SUMMARY
router.get('/today-summary', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    
    const [summary] = await pool.execute(
      `SELECT 
        t.id,
        t.clock_in_time,
        t.clock_out_time,
        t.total_hours,
        t.overtime_hours,
        t.break_minutes,
        t.status,
        t.location_name,
        COUNT(DISTINCT a.id) as activity_count,
        SUM(a.duration_minutes) as total_activity_minutes,
        COUNT(DISTINCT b.id) as break_count,
        SUM(b.duration_minutes) as total_break_minutes
       FROM time_tracking t
       LEFT JOIN activity_sessions a ON t.id = a.time_tracking_id
       LEFT JOIN breaks b ON t.id = b.time_tracking_id
       WHERE t.user_id = ? AND DATE(t.clock_in_time) = CURDATE()
       GROUP BY t.id
       ORDER BY t.clock_in_time DESC
       LIMIT 1`,
      [userId]
    )
    
    const [activities] = await pool.execute(
      `SELECT 
        a.id,
        a.project_id,
        a.activity_type,
        a.task_description,
        a.start_time,
        a.end_time,
        a.duration_minutes
       FROM activity_sessions a
       JOIN time_tracking t ON a.time_tracking_id = t.id
       WHERE t.user_id = ? AND DATE(t.clock_in_time) = CURDATE()
       ORDER BY a.start_time DESC`,
      [userId]
    )
    
    const [breaks] = await pool.execute(
      `SELECT 
        b.id,
        b.break_type,
        b.start_time,
        b.end_time,
        b.duration_minutes,
        b.notes
       FROM breaks b
       JOIN time_tracking t ON b.time_tracking_id = t.id
       WHERE t.user_id = ? AND DATE(t.clock_in_time) = CURDATE()
       ORDER BY b.start_time DESC`,
      [userId]
    )
    
    res.json({
      success: true,
      data: {
        summary: summary[0] || null,
        activities: activities || [],
        breaks: breaks || []
      }
    })
    
  } catch (error) {
    console.error('Get summary error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get today\'s summary',
      error: error.message
    })
  }
})

// 8. GET WEEKLY REPORT
router.get('/weekly-report', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { startDate, endDate } = req.query
    
    const query = `
      SELECT 
        DATE(t.clock_in_time) as date,
        COUNT(DISTINCT t.id) as days_worked,
        SUM(t.total_hours) as total_hours,
        SUM(t.overtime_hours) as overtime_hours,
        SUM(t.break_minutes) as break_minutes,
        COUNT(DISTINCT a.id) as activity_count,
        COUNT(DISTINCT b.id) as break_count
      FROM time_tracking t
      LEFT JOIN activity_sessions a ON t.id = a.time_tracking_id
      LEFT JOIN breaks b ON t.id = b.time_tracking_id
      WHERE t.user_id = ? 
        AND t.clock_in_time >= ? 
        AND t.clock_in_time <= ?
      GROUP BY DATE(t.clock_in_time)
      ORDER BY date DESC`
    
    const [report] = await pool.execute(query, [
      userId,
      startDate || new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
      endDate || new Date().toISOString().split('T')[0]
    ])
    
    res.json({
      success: true,
      data: report
    })
    
  } catch (error) {
    console.error('Weekly report error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get weekly report',
      error: error.message
    })
  }
})

export default router
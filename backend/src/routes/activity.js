import { Router } from 'express'
import pool from '../db.js'

const router = Router()

// GET - Get all activities with filters (NEW endpoint for activity monitoring)
router.get('/activities', async (req, res) => {
  try {
    const { 
      date, 
      engineerId, 
      status, 
      startDate, 
      endDate,
      page = 1,
      limit = 50 
    } = req.query;

    let baseQuery = `
      SELECT 
        id,
        DATE_FORMAT(date, '%Y-%m-%d') as date,
        TIME_FORMAT(time, '%H:%i:%s') as time,
        engineer_name,
        engineer_id,
        project,
        location,
        activity_target,
        problem,
        status,
        leave_reason,
        TIME_FORMAT(start_time, '%H:%i:%s') as start_time,
        TIME_FORMAT(end_time, '%H:%i:%s') as end_time,
        activity_type,
        DATE_FORMAT(logged_at, '%Y-%m-%d %H:%i:%s') as logged_at
      FROM activities
      WHERE 1=1
    `;
    
    const params = [];

    // Date filter
    if (date) {
      baseQuery += ` AND DATE(date) = DATE(?)`;
      params.push(date);
    }

    // Date range filter
    if (startDate && endDate) {
      baseQuery += ` AND DATE(date) BETWEEN DATE(?) AND DATE(?)`;
      params.push(startDate, endDate);
    }

    // Engineer filter
    if (engineerId) {
      baseQuery += ` AND engineer_id = ?`;
      params.push(engineerId);
    }

    // Status filter
    if (status) {
      baseQuery += ` AND status = ?`;
      params.push(status);
    }

    // Count total records
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as subquery`;
    const [countResult] = await pool.execute(countQuery, params);
    const total = countResult[0]?.total || 0;

    // Add ordering and pagination
    baseQuery += ` ORDER BY date DESC, logged_at DESC`;
    
    const offset = (page - 1) * limit;
    const finalQuery = `${baseQuery} LIMIT ? OFFSET ?`;
    const finalParams = [...params, parseInt(limit), offset];

    console.log('Executing activities query:', finalQuery);
    console.log('With params:', finalParams);

    const [activities] = await pool.execute(finalQuery, finalParams);

    // Get today's stats
    const today = new Date().toISOString().split('T')[0];
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(DISTINCT engineer_id) as active_employees,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as on_leave,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count
      FROM activities 
      WHERE DATE(date) = DATE(?)
    `, [today]);

    // Get absentees list
    const [absentees] = await pool.execute(`
      SELECT 
        engineer_name,
        engineer_id,
        problem as reason
      FROM activities 
      WHERE status = 'absent' 
        AND DATE(date) = DATE(?)
    `, [today]);

    res.json({
      activities: activities.map(act => ({
        id: act.id,
        date: act.date,
        time: act.time,
        engineerName: act.engineer_name,
        engineerId: act.engineer_id,
        project: act.project,
        location: act.location,
        activityTarget: act.activity_target,
        problem: act.problem,
        status: act.status,
        leaveReason: act.leave_reason,
        startTime: act.start_time,
        endTime: act.end_time,
        activityType: act.activity_type,
        loggedAt: act.logged_at
      })),
      total,
      activeEmployees: stats[0]?.active_employees || 0,
      onLeave: stats[0]?.on_leave || 0,
      absentees: absentees.map(a => ({
        name: a.engineer_name,
        engineerId: a.engineer_id,
        reason: a.reason
      })),
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Failed to fetch activities:', error);
    res.status(500).json({ message: 'Unable to fetch activities', error: error.message });
  }
});

// GET - Get activity stats
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_activities,
        COUNT(DISTINCT engineer_id) as active_employees,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave_count,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count
      FROM activities 
      WHERE DATE(date) = DATE(?)
    `, [today]);

    const [absentees] = await pool.execute(`
      SELECT 
        engineer_name,
        engineer_id,
        problem as reason
      FROM activities 
      WHERE status = 'absent' 
        AND DATE(date) = DATE(?)
    `, [today]);

    res.json({
      totalActivities: stats[0]?.total_activities || 0,
      activeEmployees: stats[0]?.active_employees || 0,
      presentCount: stats[0]?.present_count || 0,
      leaveCount: stats[0]?.leave_count || 0,
      absentCount: stats[0]?.absent_count || 0,
      absentees: absentees
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ message: 'Unable to fetch stats', error: error.message });
  }
});

// POST - Create new activity (NEW endpoint for activity monitoring)
router.post('/activity', async (req, res) => {
  try {
    const requiredFields = ['date', 'time', 'engineerName', 'project', 'activityTarget', 'status'];
    
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(422).json({ message: `${field} is required` });
      }
    }

    // If status is 'leave', set default values
    const isLeave = req.body.status === 'leave';
    
    const payload = {
      date: req.body.date,
      time: req.body.time,
      engineer_name: req.body.engineerName,
      engineer_id: req.body.engineerId || null,
      project: isLeave ? 'N/A' : req.body.project,
      location: isLeave ? 'N/A' : (req.body.location || 'site'),
      activity_target: req.body.activityTarget,
      problem: req.body.problem || '',
      status: req.body.status,
      leave_reason: req.body.leaveReason || '',
      start_time: isLeave ? '00:00:00' : (req.body.startTime || '09:00:00'),
      end_time: isLeave ? '00:00:00' : (req.body.endTime || '18:00:00'),
      activity_type: req.body.activityType || 'site_work'
    };

    console.log('Inserting activity:', payload);

    const [result] = await pool.execute(`
      INSERT INTO activities (
        date, time, engineer_name, engineer_id, project, location,
        activity_target, problem, status, leave_reason, start_time,
        end_time, activity_type, logged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      payload.date,
      payload.time,
      payload.engineer_name,
      payload.engineer_id,
      payload.project,
      payload.location,
      payload.activity_target,
      payload.problem,
      payload.status,
      payload.leave_reason,
      payload.start_time,
      payload.end_time,
      payload.activity_type
    ]);

    res.status(201).json({ 
      message: 'Activity logged successfully',
      activityId: result.insertId 
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
    res.status(500).json({ message: 'Unable to log activity', error: error.message });
  }
});

// GET - Get today's activities summary
router.get('/today-summary', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const [summary] = await pool.execute(`
      SELECT 
        (SELECT COUNT(*) FROM activities WHERE DATE(date) = DATE(?)) as total_activities,
        (SELECT COUNT(DISTINCT engineer_id) FROM activities WHERE DATE(date) = DATE(?) AND status = 'present') as active_employees,
        (SELECT GROUP_CONCAT(DISTINCT engineer_name SEPARATOR ', ') 
         FROM activities 
         WHERE DATE(date) = DATE(?) AND status = 'absent') as absentees_list
    `, [today, today, today]);
    
    res.json(summary[0]);
  } catch (error) {
    console.error('Failed to fetch today summary:', error);
    res.status(500).json({ message: 'Unable to fetch summary', error: error.message });
  }
});

// --- OLD ENDPOINTS (Keep for backward compatibility) ---

const requiredFields = ['logDate', 'logTime', 'projectName']

const insertSql = `
  INSERT INTO site_activity (
    log_date, log_time, project_name, daily_target, hourly_activity,
    problems_faced, resolution_status, problem_start, problem_end,
    support_problem, support_start, support_end, support_engineer,
    engineer_remark, incharge_remark, created_at
  )
  VALUES (
    :logDate, :logTime, :projectName, :dailyTarget, :hourlyActivity,
    :problemsFaced, :resolutionStatus, :problemStart, :problemEnd,
    :supportProblem, :supportStart, :supportEnd, :supportEngineer,
    :engineerRemark, :inchargeRemark, NOW()
  )
`

// Original GET endpoint
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, project_name AS projectName, log_date AS logDate,
              log_time AS logTime, daily_target AS dailyTarget,
              hourly_activity AS hourlyActivity, problems_faced AS problemsFaced,
              resolution_status AS resolutionStatus, support_engineer AS supportEngineer,
              created_at AS createdAt
         FROM site_activity
        ORDER BY created_at DESC
        LIMIT 20`
    )
    res.json(rows)
  } catch (error) {
    console.error('Failed to fetch entries', error)
    res.status(500).json({ message: 'Unable to fetch entries' })
  }
})

// Original POST endpoint
router.post('/', async (req, res) => {
  try {
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(422).json({ message: `${field} is required` })
      }
    }

    const payload = {
      dailyTarget: '',
      hourlyActivity: '',
      problemsFaced: '',
      resolutionStatus: '',
      problemStart: null,
      problemEnd: null,
      supportProblem: '',
      supportStart: null,
      supportEnd: null,
      supportEngineer: '',
      engineerRemark: '',
      inchargeRemark: '',
      ...req.body,
    }

    await pool.execute(insertSql, payload)

    res.status(201).json({ message: 'Entry recorded' })
  } catch (error) {
    console.error('Failed to insert entry', error)
    res.status(500).json({ message: 'Unable to save entry' })
  }
})

export default router
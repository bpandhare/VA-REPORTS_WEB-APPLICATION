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

// Function to get table structure
async function getTableColumns(tableName) {
  try {
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
      ORDER BY ORDINAL_POSITION
    `, [tableName])
    
    return columns.map(col => col.COLUMN_NAME)
  } catch (error) {
    console.error(`Error getting columns for table ${tableName}:`, error)
    return []
  }
}

// Function to fix missing columns
async function fixMissingColumns() {
  try {
    console.log('🔧 Checking and fixing hourly_reports table structure...')
    
    const existingColumns = await getTableColumns('hourly_reports')
    console.log('📊 Existing columns in hourly_reports:', existingColumns)
    
    // List of columns we need
    const neededColumns = [
      'hourly_achieved',
      'location_type',
      'daily_target_achieved',
      'customer_name',
      'customer_person',
      'customer_contact',
      'end_customer_name',
      'end_customer_person',
      'end_customer_contact',
      'incharge',
      'site_location',
      'site_start_date',
      'site_end_date',
      'employee_id',
      'employee_name',
      'period_name'
    ]
    
    // Add missing columns
    const addedColumns = []
    for (const column of neededColumns) {
      if (!existingColumns.includes(column)) {
        let columnType = 'TEXT'
        if (column.includes('_date')) columnType = 'DATE'
        else if (column.includes('_type') || column.includes('_name') || column.includes('_person') || column.includes('incharge')) columnType = 'VARCHAR(255)'
        else if (column.includes('_contact') || column.includes('employee_id')) columnType = 'VARCHAR(50)'
        else if (column.includes('period_name')) columnType = 'VARCHAR(50)'
        
        try {
          await pool.execute(`ALTER TABLE hourly_reports ADD COLUMN ${column} ${columnType}`)
          addedColumns.push(column)
          console.log(`✅ Added column: ${column} (${columnType})`)
        } catch (error) {
          console.log(`⚠️ Could not add column ${column}:`, error.message)
        }
      }
    }
    
    return { existingColumns, addedColumns }
  } catch (error) {
    console.error('❌ Failed to fix table structure:', error)
    throw error
  }
}

// Get all hourly reports for a specific date (for managers)
// In the /all/:date endpoint, around line 74:
// Get all hourly reports for a specific date (for managers) with daily plan/achievement comparison
router.get('/all/:date', verifyToken, async (req, res) => {
  try {
    const { date } = req.params;
    const userRole = req.user.role;
    // Only managers and team leaders can access all reports
    const userRoleLower = (userRole || '').toLowerCase();
    if (!userRoleLower.includes('manager') && !userRoleLower.includes('team leader') && !userRoleLower.includes('group leader')) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Only managers can view all hourly reports.' 
      });
    }

    // Get all hourly reports for the date
    const [reports] = await pool.execute(`
      SELECT 
        hr.*,
        u.username as employee_name,
        u.employee_id,
        u.role as employee_role
      FROM hourly_reports hr
      LEFT JOIN users u ON hr.user_id = u.id
      WHERE hr.report_date = ?
      ORDER BY hr.time_period, hr.created_at ASC
    `, [date]);


    // For each report, fetch the daily plan and achievement for that user/date
    const enhancedReports = await Promise.all(reports.map(async (report) => {
      try {
        // Fetch daily target for this user/date, including project_name and problem fields
        let dailyTarget = null;
        try {
          const [dailyTargets] = await pool.execute(
            `SELECT daily_target_planned, daily_target_achieved, id as daily_target_id, problem_faced, problem_resolved, project_name
             FROM daily_target_reports
             WHERE user_id = ? AND report_date = ?
             ORDER BY created_at DESC LIMIT 1`,
            [report.user_id, date]
          );
          if (dailyTargets.length > 0) {
            dailyTarget = dailyTargets[0];
          }
        } catch (err) {
          console.error('Error fetching daily target for report', report.id, err);
        }


        // Split daily_target_planned into individual plans (comma or newline separated)
        let plans = [];
        if (dailyTarget && dailyTarget.daily_target_planned) {
          plans = dailyTarget.daily_target_planned
            .split(/\r?\n|,/)
            .map(p => p.trim())
            .filter(Boolean);
        }
        // If no plans from daily target, try to get from hourly report's planned_activities field
        if (plans.length === 0 && report.planned_activities) {
          plans = report.planned_activities
            .split(/\r?\n|,/)
            .map(p => p.trim())
            .filter(Boolean);
        }

        // For each plan, check if it is achieved in the hourly_activity
        let planAchievements = [];
        if (plans.length > 0 && report.hourly_activity) {
          planAchievements = plans.map(plan => {
            const achieved = report.hourly_activity.toLowerCase().includes(plan.toLowerCase());
            return {
              plan,
              achieved
            };
          });
        } else if (plans.length > 0) {
          planAchievements = plans.map(plan => ({ plan, achieved: false }));
        }

        // Compare all plans at once for summary
        let planAchieved = planAchievements.length > 0 && planAchievements.every(p => p.achieved);
        let planComparison = null;
        if (dailyTarget && dailyTarget.daily_target_planned && report.hourly_activity) {
          planComparison = {
            planned: dailyTarget.daily_target_planned,
            achieved: report.hourly_activity,
            achievedFlag: planAchieved,
            daily_target_achieved: dailyTarget.daily_target_achieved
          };
        }

        // Prefer project_name from dailyTarget, fallback to report.project_name or report.project_no
        let projectName = null;
        if (dailyTarget && dailyTarget.project_name && dailyTarget.project_name !== 'N/A') {
          projectName = dailyTarget.project_name;
        } else if (report.project_name && report.project_name !== 'N/A') {
          projectName = report.project_name;
        } else if (report.project_no && report.project_no !== 'N/A') {
          projectName = report.project_no;
        } else {
          projectName = 'Unknown Project';
        }

        return {
          ...report,
          project_name: projectName || 'Unknown',
          daily_plan: dailyTarget ? dailyTarget.daily_target_planned : null,
          daily_achieved: dailyTarget ? dailyTarget.daily_target_achieved : null,
          plan_comparison: planComparison,
          plan_achievements: planAchievements,
          // Add daily report's problem fields for display
          daily_problem_faced: dailyTarget ? dailyTarget.problem_faced : null,
          daily_problem_resolved: dailyTarget ? dailyTarget.problem_resolved : null
        };
      } catch (err) {
        console.error('Error processing hourly report', report.id, err);
        return {
          ...report,
          project_name: 'Unknown',
          daily_plan: null,
          daily_achieved: null,
          plan_comparison: null,
          plan_achievements: [],
          daily_problem_faced: null,
          daily_problem_resolved: null,
          error: 'Error processing this report'
        };
      }
    }));

    res.json({
      success: true,
      date: date,
      reports: enhancedReports,
      count: enhancedReports.length
    });
  } catch (error) {
    console.error('Failed to fetch all hourly reports:', error);
    res.status(500).json({ 
      success: false,
      message: 'Unable to fetch hourly reports' 
    });
  }
});
// GET route to fetch daily target reports for auto-filling hourly reports
router.get('/daily-targets/:date', verifyToken, async (req, res) => {
  try {
    const { date } = req.params
    const userId = req.user.id

    const [rows] = await pool.execute(
      `SELECT id, project_no, daily_target_planned, report_date, site_start_date, location_type
       FROM daily_target_reports
       WHERE DATE(report_date) = ? AND user_id = ?
       ORDER BY created_at DESC`,
      [date, userId]
    )

    res.json(rows)
  } catch (error) {
    console.error('Failed to fetch daily target reports', error)
    res.status(500).json({ message: 'Unable to fetch daily target reports' })
  }
})

// GET route to fetch a single hourly report by id
router.get('/id/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    const [rows] = await pool.execute('SELECT * FROM hourly_reports WHERE id = ?', [id])
    if (rows.length === 0) return res.status(404).json({ message: 'Hourly report not found' })
    res.json(rows[0])
  } catch (error) {
    console.error('Failed to fetch hourly report by id:', error)
    res.status(500).json({ message: 'Unable to fetch hourly report' })
  }
})

// DELETE route to remove an hourly report by id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const role = (req.user.role || '').toLowerCase()
    const isManagerish = role.includes('manager') || role.includes('team leader') || role.includes('group leader')

    // Check ownership
    const [existing] = await pool.execute('SELECT user_id FROM hourly_reports WHERE id = ?', [id])
    if (existing.length === 0) return res.status(404).json({ message: 'Hourly report not found' })
    const ownerId = existing[0].user_id
    if (!isManagerish && ownerId !== userId) {
      return res.status(403).json({ message: 'Not authorized to delete this hourly report' })
    }

    const [result] = await pool.execute('DELETE FROM hourly_reports WHERE id = ?', [id])
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Hourly report not found' })

    res.json({ success: true, message: 'Hourly report deleted' })
  } catch (error) {
    console.error('Failed to delete hourly report:', error)
    res.status(500).json({ message: 'Unable to delete hourly report' })
  }
})

// GET route to fetch existing hourly reports for a date
router.get('/:date', verifyToken, async (req, res) => {
  try {
    const { date } = req.params
    const userId = req.user.id
    const role = (req.user.role || '').toLowerCase()
    const isManagerish = role.includes('manager') || role.includes('team leader') || role.includes('group leader')

    // Always return only the authenticated user's hourly reports
    const [rows] = await pool.execute(`SELECT * FROM hourly_reports WHERE report_date = ? AND user_id = ? ORDER BY time_period`, [date, userId])
    res.json(rows)
  } catch (error) {
    console.error('Failed to fetch hourly reports', error)
    res.status(500).json({ message: 'Unable to fetch hourly reports' })
  }
})

// Endpoint to check and fix table structure
router.get('/fix-table', verifyToken, async (req, res) => {
  try {
    const result = await fixMissingColumns()
    
    res.json({
      success: true,
      existingColumns: result.existingColumns,
      addedColumns: result.addedColumns,
      message: result.addedColumns.length > 0 
        ? `Added ${result.addedColumns.length} columns to hourly_reports table` 
        : 'All columns already exist'
    })
  } catch (error) {
    console.error('❌ Failed to fix table structure:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      sqlMessage: error.sqlMessage
    })
  }
})

router.post('/', verifyToken, async (req, res) => {
  try {
    console.log('📥 POST /api/hourly-report request body:', JSON.stringify(req.body, null, 2))
    console.log('👤 User making request:', req.user)
    
    // First, get current table structure
    const tableColumns = await getTableColumns('hourly_reports')
    console.log('📊 Available columns in hourly_reports:', tableColumns)
    
    // Accept both camelCase and snake_case field names for compatibility
    const {
      // Required fields
      reportDate, date,
      timePeriod, time_period,
      projectName, project_name,
      dailyTarget, daily_target,
      hourlyActivity, hourly_activity,
      
      // Optional fields
      problemFacedByEngineerHourly, problem_faced_by_engineer_hourly,
      problemResolvedOrNot, problem_resolved_or_not,
      problemOccurStartTime, problem_occur_start_time,
      problemResolvedEndTime, problem_resolved_end_time,
      onlineSupportRequiredForWhichProblem, online_support_required_for_which_problem,
      onlineSupportTime, online_support_time,
      onlineSupportEndTime, online_support_end_time,
      engineerNameWhoGivesOnlineSupport, engineer_name_who_gives_online_support,
      engineerRemark, engineer_remark,
      projectInchargeRemark, project_incharge_remark,
      
      // Additional fields
      hourlyAchieved, hourly_achieved,
      user_id,
      employee_id,
      employee_name,
      locationType, location_type,
      dailyTargetAchieved, daily_target_achieved,
      customerName, customer_name,
      customerPerson, customer_person,
      customerContact, customer_contact,
      endCustomerName, end_customer_name,
      endCustomerPerson, end_customer_person,
      endCustomerContact, end_customer_contact,
      incharge,
      siteLocation, site_location,
      siteStartDate, site_start_date,
      siteEndDate, site_end_date,
      periodName, period_name
    } = req.body

    // Normalize field names (use whichever is provided)
    const normalized = {
      reportDate: reportDate || date,
      timePeriod: timePeriod || time_period,
      projectName: projectName || project_name,
      dailyTarget: dailyTarget || daily_target,
      hourlyActivity: hourlyActivity || hourly_activity,
      problemFacedByEngineerHourly: problemFacedByEngineerHourly || problem_faced_by_engineer_hourly,
      problemResolvedOrNot: problemResolvedOrNot || problem_resolved_or_not,
      problemOccurStartTime: problemOccurStartTime || problem_occur_start_time,
      problemResolvedEndTime: problemResolvedEndTime || problem_resolved_end_time,
      onlineSupportRequiredForWhichProblem: onlineSupportRequiredForWhichProblem || online_support_required_for_which_problem,
      onlineSupportTime: onlineSupportTime || online_support_time,
      onlineSupportEndTime: onlineSupportEndTime || online_support_end_time,
      engineerNameWhoGivesOnlineSupport: engineerNameWhoGivesOnlineSupport || engineer_name_who_gives_online_support,
      engineerRemark: engineerRemark || engineer_remark,
      projectInchargeRemark: projectInchargeRemark || project_incharge_remark,
      hourlyAchieved: hourlyAchieved || hourly_achieved,
      user_id: user_id || req.user.id,
      employee_id: employee_id || req.user.employeeId || '',
      employee_name: employee_name || req.user.username || '',
      locationType: locationType || location_type,
      dailyTargetAchieved: dailyTargetAchieved || daily_target_achieved,
      customerName: customerName || customer_name,
      customerPerson: customerPerson || customer_person,
      customerContact: customerContact || customer_contact,
      endCustomerName: endCustomerName || end_customer_name,
      endCustomerPerson: endCustomerPerson || end_customer_person,
      endCustomerContact: endCustomerContact || end_customer_contact,
      incharge,
      siteLocation: siteLocation || site_location,
      siteStartDate: siteStartDate || site_start_date,
      siteEndDate: siteEndDate || site_end_date,
      periodName: periodName || period_name
    }

    console.log('📋 Normalized fields:', normalized)

    // Validate required fields
    if (!normalized.reportDate || !normalized.timePeriod || !normalized.projectName || !normalized.dailyTarget || !normalized.hourlyActivity) {
      console.error('❌ Missing required fields:', {
        reportDate: !!normalized.reportDate,
        timePeriod: !!normalized.timePeriod,
        projectName: !!normalized.projectName,
        dailyTarget: !!normalized.dailyTarget,
        hourlyActivity: !!normalized.hourlyActivity
      })
      return res.status(400).json({
        message: 'Date, time period, project name, daily target, and hourly activity are required',
        details: {
          missingFields: {
            date: !normalized.reportDate,
            timePeriod: !normalized.timePeriod,
            projectName: !normalized.projectName,
            dailyTarget: !normalized.dailyTarget,
            hourlyActivity: !normalized.hourlyActivity
          }
        }
      })
    }

    const userId = normalized.user_id

    // Check for existing report for same time period and date
    const [existing] = await pool.execute(
      'SELECT id FROM hourly_reports WHERE report_date = ? AND time_period = ? AND user_id = ?',
      [normalized.reportDate, normalized.timePeriod, userId]
    )

    if (existing.length > 0) {
      return res.status(409).json({ 
        message: `Hourly report already exists for ${normalized.timePeriod} on ${normalized.reportDate}` 
      })
    }

    // Build dynamic INSERT query based on available columns
    const columns = []
    const values = []
    const placeholders = []
    
    // Always include basic columns that should exist
    const basicFields = {
      'report_date': normalized.reportDate,
      'time_period': normalized.timePeriod,
      'project_name': normalized.projectName,
      'daily_target': normalized.dailyTarget,
      'hourly_activity': normalized.hourlyActivity,
      'user_id': userId
    }
    
    // Optional fields that might exist in the table
    const optionalFields = {
      'problem_faced_by_engineer_hourly': normalized.problemFacedByEngineerHourly,
      'problem_resolved_or_not': normalized.problemResolvedOrNot,
      'problem_occur_start_time': normalized.problemOccurStartTime,
      'problem_resolved_end_time': normalized.problemResolvedEndTime,
      'online_support_required_for_which_problem': normalized.onlineSupportRequiredForWhichProblem,
      'online_support_time': normalized.onlineSupportTime,
      'online_support_end_time': normalized.onlineSupportEndTime,
      'engineer_name_who_gives_online_support': normalized.engineerNameWhoGivesOnlineSupport,
      'engineer_remark': normalized.engineerRemark,
      'project_incharge_remark': normalized.projectInchargeRemark,
      'hourly_achieved': normalized.hourlyAchieved,
      'location_type': normalized.locationType,
      'daily_target_achieved': normalized.dailyTargetAchieved,
      'customer_name': normalized.customerName,
      'customer_person': normalized.customerPerson,
      'customer_contact': normalized.customerContact,
      'end_customer_name': normalized.endCustomerName,
      'end_customer_person': normalized.endCustomerPerson,
      'end_customer_contact': normalized.endCustomerContact,
      'incharge': normalized.incharge,
      'site_location': normalized.siteLocation,
      'site_start_date': normalized.siteStartDate,
      'site_end_date': normalized.siteEndDate,
      'employee_id': normalized.employee_id,
      'employee_name': normalized.employee_name,
      'period_name': normalized.periodName
    }
    
    // Add basic fields (should exist)
    for (const [column, value] of Object.entries(basicFields)) {
      columns.push(column)
      values.push(value || null)
      placeholders.push('?')
    }
    
    // Add optional fields only if the column exists in the table
    for (const [column, value] of Object.entries(optionalFields)) {
      if (tableColumns.includes(column) && value !== undefined && value !== '') {
        columns.push(column)
        values.push(value || null)
        placeholders.push('?')
      }
    }
    
    console.log('🔨 Building INSERT query with columns:', columns)
    console.log('🔨 Values to insert:', values)
    
    // Try to insert
    try {
      const query = `INSERT INTO hourly_reports (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`
      console.log('🔨 Executing query:', query)
      
      const [result] = await pool.execute(query, values)
      console.log('✅ Hourly report saved successfully, ID:', result.insertId)
      
      res.status(201).json({ 
        message: 'Hourly report saved successfully',
        id: result.insertId 
      })
    } catch (error) {
      console.error('❌ Database error during insert:', error)
      
      // If column doesn't exist, try to fix the table and retry
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        console.log('🔄 Column missing, attempting to fix table structure...')
        try {
          await fixMissingColumns()
          
          // Retry the insert
          const query = `INSERT INTO hourly_reports (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`
          const [result] = await pool.execute(query, values)
          console.log('✅ Hourly report saved successfully after fixing table, ID:', result.insertId)
          
          return res.status(201).json({ 
            message: 'Hourly report saved successfully',
            id: result.insertId 
          })
        } catch (retryError) {
          console.error('❌ Failed after retry:', retryError)
          throw retryError
        }
      }
      throw error
    }
  } catch (error) {
    console.error('❌ Failed to save hourly report:', error)
    console.error('❌ SQL Error code:', error.code)
    console.error('❌ SQL Error message:', error.sqlMessage)
    
    res.status(500).json({ 
      message: 'Unable to save hourly report',
      error: error.message,
      sqlMessage: error.sqlMessage,
      code: error.code
    })
  }
})

// PUT route to update existing hourly reports
// PUT route to update existing hourly reports
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    console.log('📥 PUT /api/hourly-report/:id request body:', JSON.stringify(req.body, null, 2))
    console.log('👤 User making update request:', req.user)
    
    // First, get current table structure
    const tableColumns = await getTableColumns('hourly_reports')
    console.log('📊 Available columns for UPDATE:', tableColumns)
    
    // Accept both camelCase and snake_case field names
    const {
      reportDate, date,
      timePeriod, time_period,
      projectName, project_name,
      dailyTarget, daily_target,
      hourlyActivity, hourly_activity,
      problemFacedByEngineerHourly, problem_faced_by_engineer_hourly,
      problemResolvedOrNot, problem_resolved_or_not,
      problemOccurStartTime, problem_occur_start_time,
      problemResolvedEndTime, problem_resolved_end_time,
      onlineSupportRequiredForWhichProblem, online_support_required_for_which_problem,
      onlineSupportTime, online_support_time,
      onlineSupportEndTime, online_support_end_time,
      engineerNameWhoGivesOnlineSupport, engineer_name_who_gives_online_support,
      engineerRemark, engineer_remark,
      projectInchargeRemark, project_incharge_remark,
      hourlyAchieved, hourly_achieved,
      locationType, location_type,
      dailyTargetAchieved, daily_target_achieved,
      customerName, customer_name,
      customerPerson, customer_person,
      customerContact, customer_contact,
      endCustomerName, end_customer_name,
      endCustomerPerson, end_customer_person,
      endCustomerContact, end_customer_contact,
      incharge,
      siteLocation, site_location,
      siteStartDate, site_start_date,
      siteEndDate, site_end_date,
      periodName, period_name
    } = req.body

    // Normalize field names
    const normalized = {
      reportDate: reportDate || date,
      timePeriod: timePeriod || time_period,
      projectName: projectName || project_name,
      dailyTarget: dailyTarget || daily_target,
      hourlyActivity: hourlyActivity || hourly_activity,
      problemFacedByEngineerHourly: problemFacedByEngineerHourly || problem_faced_by_engineer_hourly,
      problemResolvedOrNot: problemResolvedOrNot || problem_resolved_or_not,
      problemOccurStartTime: problemOccurStartTime || problem_occur_start_time,
      problemResolvedEndTime: problemResolvedEndTime || problem_resolved_end_time,
      onlineSupportRequiredForWhichProblem: onlineSupportRequiredForWhichProblem || online_support_required_for_which_problem,
      onlineSupportTime: onlineSupportTime || online_support_time,
      onlineSupportEndTime: onlineSupportEndTime || online_support_end_time,
      engineerNameWhoGivesOnlineSupport: engineerNameWhoGivesOnlineSupport || engineer_name_who_gives_online_support,
      engineerRemark: engineerRemark || engineer_remark,
      projectInchargeRemark: projectInchargeRemark || project_incharge_remark,
      hourlyAchieved: hourlyAchieved || hourly_achieved,
      locationType: locationType || location_type,
      dailyTargetAchieved: dailyTargetAchieved || daily_target_achieved,
      customerName: customerName || customer_name,
      customerPerson: customerPerson || customer_person,
      customerContact: customerContact || customer_contact,
      endCustomerName: endCustomerName || end_customer_name,
      endCustomerPerson: endCustomerPerson || end_customer_person,
      endCustomerContact: endCustomerContact || end_customer_contact,
      incharge,
      siteLocation: siteLocation || site_location,
      siteStartDate: siteStartDate || site_start_date,
      siteEndDate: siteEndDate || site_end_date,
      periodName: periodName || period_name
    }

    console.log('📋 Normalized update fields:', normalized)

    // Validate required fields
    if (!normalized.reportDate || !normalized.timePeriod || !normalized.projectName || !normalized.dailyTarget || !normalized.hourlyActivity) {
      console.error('❌ Missing required fields for update:', {
        reportDate: !!normalized.reportDate,
        timePeriod: !!normalized.timePeriod,
        projectName: !!normalized.projectName,
        dailyTarget: !!normalized.dailyTarget,
        hourlyActivity: !!normalized.hourlyActivity
      })
      return res.status(400).json({
        message: 'Date, time period, project name, daily target, and hourly activity are required for update'
      })
    }

    const userId = req.user.id
    const role = (req.user.role || '').toLowerCase()
    const isManagerish = role.includes('manager') || role.includes('team leader') || role.includes('group leader')

    // Check if report exists and get its current details
    const [existingReport] = await pool.execute('SELECT * FROM hourly_reports WHERE id = ?', [id])
    if (existingReport.length === 0) return res.status(404).json({ message: 'Hourly report not found' })
    
    const report = existingReport[0]
    const ownerId = report.user_id
    
    // Ensure ownership unless manager
    if (!isManagerish && ownerId !== userId) {
      return res.status(403).json({ message: 'Not authorized to update this hourly report' })
    }

    // Check if another report exists for same date and time period (excluding current report)
    // Managers/team leaders can override this check and edit any report
    let duplicateCheck = []
    if (!isManagerish) {
      const [rows] = await pool.execute(
        'SELECT id FROM hourly_reports WHERE report_date = ? AND time_period = ? AND user_id = ? AND id != ?',
        [normalized.reportDate, normalized.timePeriod, userId, id]
      )
      duplicateCheck = rows
    }

    if (duplicateCheck.length > 0) {
      return res.status(409).json({ 
        message: `Another hourly report already exists for ${normalized.timePeriod} on ${normalized.reportDate}. Please delete it first or edit that report instead.` 
      })
    }

    // Build UPDATE query dynamically based on available columns
    const setClauses = []
    const updateValues = []
    
    // Define all possible fields for update
    const updateFields = {
      'report_date': normalized.reportDate,
      'time_period': normalized.timePeriod,
      'project_name': normalized.projectName,
      'daily_target': normalized.dailyTarget,
      'hourly_activity': normalized.hourlyActivity,
      'problem_faced_by_engineer_hourly': normalized.problemFacedByEngineerHourly,
      'problem_resolved_or_not': normalized.problemResolvedOrNot,
      'problem_occur_start_time': normalized.problemOccurStartTime,
      'problem_resolved_end_time': normalized.problemResolvedEndTime,
      'online_support_required_for_which_problem': normalized.onlineSupportRequiredForWhichProblem,
      'online_support_time': normalized.onlineSupportTime,
      'online_support_end_time': normalized.onlineSupportEndTime,
      'engineer_name_who_gives_online_support': normalized.engineerNameWhoGivesOnlineSupport,
      'engineer_remark': normalized.engineerRemark,
      'project_incharge_remark': normalized.projectInchargeRemark,
      'hourly_achieved': normalized.hourlyAchieved,
      'location_type': normalized.locationType,
      'daily_target_achieved': normalized.dailyTargetAchieved,
      'customer_name': normalized.customerName,
      'customer_person': normalized.customerPerson,
      'customer_contact': normalized.customerContact,
      'end_customer_name': normalized.endCustomerName,
      'end_customer_person': normalized.endCustomerPerson,
      'end_customer_contact': normalized.endCustomerContact,
      'incharge': normalized.incharge,
      'site_location': normalized.siteLocation,
      'site_start_date': normalized.siteStartDate,
      'site_end_date': normalized.siteEndDate,
      'period_name': normalized.periodName,
      'employee_id': req.user.employeeId || '',
      'employee_name': req.user.username || '',
      'updated_at': new Date().toISOString().slice(0, 19).replace('T', ' ')
    }
    
    // Only include fields that exist in the table
    for (const [column, value] of Object.entries(updateFields)) {
      if (tableColumns.includes(column) && value !== undefined) {
        setClauses.push(`${column} = ?`)
        updateValues.push(value || null)
      }
    }
    
    updateValues.push(id)
    
    const query = `UPDATE hourly_reports SET ${setClauses.join(', ')} WHERE id = ?`
    console.log('🔨 Executing UPDATE query:', query)
    console.log('🔨 Update values:', updateValues)

    const [result] = await pool.execute(query, updateValues)

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Hourly report not found' })
    }

    console.log('✅ Hourly report updated successfully, ID:', id)
    
    res.status(200).json({
      message: 'Hourly report updated successfully',
      id: parseInt(id)
    })
  } catch (error) {
    console.error('❌ Failed to update hourly report:', error)
    console.error('❌ SQL Error:', error.sql)
    console.error('❌ SQL Message:', error.sqlMessage)
    
    res.status(500).json({ 
      message: 'Unable to update hourly report',
      error: error.message,
      sqlMessage: error.sqlMessage,
      code: error.code
    })
  }
})

// GET all employees for manager - FIXED: use verifyToken instead of authMiddleware
router.get('/manager/employees', verifyToken, async (req, res) => {
  try {
    // Get manager's ID from token
    const managerId = req.user.id;
    const role = (req.user.role || '').toLowerCase();
const isManagerish = role.includes('manager') || role.includes('team leader') || role.includes('group leader');
if (!isManagerish) {
  return res.status(403).json({ message: 'Access denied. Manager privileges required.' });
}
    
    // Fetch employees under this manager
    // First, let's check the structure of the users table
    const [columns] = await pool.execute(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'users' AND TABLE_SCHEMA = DATABASE()`
    );
    
    console.log('Available columns in users table:', columns.map(c => c.COLUMN_NAME));
    
    // If there's a manager_id field, use it
    let query, queryParams;
    
    if (columns.some(col => col.COLUMN_NAME === 'manager_id')) {
      query = `
        SELECT id, username, email, employee_id, role, created_at 
        FROM users 
        WHERE manager_id = ?
      `;
      queryParams = [managerId];
    } else if (columns.some(col => col.COLUMN_NAME === 'reporting_to')) {
      query = `
        SELECT id, username, email, employee_id, role, created_at 
        FROM users 
        WHERE reporting_to = ?
      `;
      queryParams = [managerId];
    } else {
      // If no manager field exists, return all non-manager users for now
      query = `
        SELECT id, username, email, employee_id, role, created_at 
        FROM users 
        WHERE (role NOT LIKE '%manager%' AND role NOT LIKE '%team leader%' AND role NOT LIKE '%group leader%')
        OR role IS NULL
        OR role = ''
      `;
      queryParams = [];
    }
    
    const [employees] = await pool.execute(query, queryParams);
    
    res.json(employees);
  } catch (error) {
    console.error('Error fetching manager employees:', error);
    res.status(500).json({ 
      error: 'Failed to fetch employees',
      details: error.message 
    });
  }
});

// GET employee activities for specific date
router.get('/manager/activities/:date/:employeeId', verifyToken, async (req, res) => {
  try {
    const { date, employeeId } = req.params
    const userId = req.user.id
    const role = (req.user.role || '').toLowerCase()
    
    // Check if user is a manager
    const isManagerish = role.includes('manager') || role.includes('team leader') || role.includes('group leader')
    if (!isManagerish) {
      return res.status(403).json({ message: 'Access denied. Manager privileges required.' })
    }

    // Get employee details
    const [employee] = await pool.execute(
      'SELECT id, username, fullName, employeeId, role FROM users WHERE id = ?',
      [employeeId]
    )

    if (employee.length === 0) {
      return res.status(404).json({ message: 'Employee not found' })
    }

    // Get hourly reports for the employee on specific date
    const [hourlyReports] = await pool.execute(
      `SELECT * FROM hourly_reports 
       WHERE user_id = ? AND report_date = ? 
       ORDER BY time_period`,
      [employeeId, date]
    )

    // Get daily target report for the employee on specific date
    const [dailyReports] = await pool.execute(
      `SELECT * FROM daily_target_reports 
       WHERE user_id = ? AND DATE(report_date) = ?`,
      [employeeId, date]
    )

    res.json({
      employee: employee[0],
      hourlyReports,
      dailyReport: dailyReports.length > 0 ? dailyReports[0] : null,
      date,
      totalSessions: hourlyReports.length,
      hasReports: hourlyReports.length > 0 || dailyReports.length > 0
    })
  } catch (error) {
    console.error('Failed to fetch employee activities:', error)
    res.status(500).json({ message: 'Unable to fetch employee activities' })
  }
})


// GET employee activities summary (multiple dates)
router.get('/manager/activities-summary', verifyToken, async (req, res) => {
  try {
    const { startDate, endDate, employeeId } = req.query
    const userId = req.user.id
    const role = (req.user.role || '').toLowerCase()
    
    // Check if user is a manager
    const isManagerish = role.includes('manager') || role.includes('team leader') || role.includes('group leader')
    if (!isManagerish) {
      return res.status(403).json({ message: 'Access denied. Manager privileges required.' })
    }

    let query = `
      SELECT hr.report_date, hr.time_period, hr.project_name, 
             hr.hourly_activity,
             hr.problem_faced_by_engineer_hourly, hr.problem_resolved_or_not,
             u.username, u.fullName, u.employeeId
      FROM hourly_reports hr
      JOIN users u ON hr.user_id = u.id
      WHERE hr.report_date BETWEEN ? AND ?
    `
    
    const params = [startDate, endDate]
    
    if (employeeId) {
      query += ' AND hr.user_id = ?'
      params.push(employeeId)
    }
    
    query += ' ORDER BY hr.report_date DESC, hr.time_period'
    
    const [activities] = await pool.execute(query, params)

    res.json(activities)
  } catch (error) {
    console.error('Failed to fetch activities summary:', error)
    res.status(500).json({ message: 'Unable to fetch activities summary' })
  }
})

// Add this endpoint to get consolidated hourly data for daily report
router.get('/consolidated/:date', verifyToken, async (req, res) => {
  try {
    const { date } = req.params;
    const userId = req.user.id;
    
    const [rows] = await pool.execute(
      `SELECT * FROM hourly_reports 
       WHERE report_date = ? AND user_id = ? 
       ORDER BY time_period`,
      [date, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'No hourly reports found for this date' });
    }
    
    // Consolidate data
    const consolidated = {
      achievements: rows.map(r => r.hourly_achieved || r.daily_target_achieved).filter(Boolean).join('. '),
      problems: rows.map(r => r.problem_faced_by_engineer_hourly).filter(Boolean).join('. '),
      activities: rows.map(r => r.hourly_activity).filter(Boolean).join('. '),
      projectName: rows[0].project_name,
      count: rows.length
    };
    
    // Add optional fields if they exist
    if (rows[0].customer_name) consolidated.customerName = rows[0].customer_name
    if (rows[0].end_customer_name) consolidated.endCustomerName = rows[0].end_customer_name
    if (rows[0].incharge) consolidated.incharge = rows[0].incharge
    if (rows[0].customer_person) consolidated.customerPerson = rows[0].customer_person
    if (rows[0].customer_contact) consolidated.customerContact = rows[0].customer_contact
    if (rows[0].end_customer_person) consolidated.endCustomerPerson = rows[0].end_customer_person
    if (rows[0].end_customer_contact) consolidated.endCustomerContact = rows[0].end_customer_contact
    if (rows[0].site_location) consolidated.siteLocation = rows[0].site_location
    if (rows[0].site_start_date) consolidated.siteStartDate = rows[0].site_start_date
    
    res.json(consolidated);
  } catch (error) {
    console.error('Failed to get consolidated data:', error);
    res.status(500).json({ message: 'Unable to get consolidated data' });
  }
})

export default router
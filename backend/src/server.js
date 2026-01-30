import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import activityRouter from './routes/activity.js'
import authRouter from './routes/auth.js'
import hourlyReportRouter from './routes/hourlyReport.js'
import dailyTargetRouter from './routes/dailyTarget.js'
import employeeActivityRouter from './routes/employeeActivity.js'
import projectsRouter from './routes/projects.js'
import pool from './db.js'
import timeTrackingRoutes from './routes/timeTracking.js'
import authRoutes from './routes/authRoutes.js'
import jwt from 'jsonwebtoken'

// ES Modules fix for __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Add this function to create MoM table in MySQL
async function createMoMTable() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS mom_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        customer_name VARCHAR(255),
        customer_person VARCHAR(255),
        cust_contact VARCHAR(20),
        cust_country_code VARCHAR(10) DEFAULT '+91',
        end_cust_name VARCHAR(255),
        end_cust_contact VARCHAR(20),
        end_cust_country_code VARCHAR(10) DEFAULT '+91',
        end_cust_person VARCHAR(255),
        engg_name VARCHAR(255),
        site_location TEXT,
        mom_date VARCHAR(20),
        reporting_time VARCHAR(10),
        mom_close_time VARCHAR(10),
        man_hours VARCHAR(10),
        man_hours_more_than_9 VARCHAR(3) DEFAULT 'No',
        billing_days VARCHAR(10),
        site_start_date VARCHAR(20),
        site_end_date VARCHAR(20),
        project_name VARCHAR(255),
        project_no VARCHAR(100),
        observation_notes TEXT,
        solution_notes TEXT,
        conclusion TEXT,
        location_lat VARCHAR(50),
        location_lng VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `)
    console.log('✓ Created mom_records table')
  } catch (error) {
    console.error('Error creating mom_records table:', error.message)
  }
}

// Auto-migrate: Add missing columns to users table and create new tables
async function migrateDatabase() {
  try {
    const dbName = process.env.DB_NAME ?? 'vickhardth_ops'
    
    // Try to add dob column
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN dob DATE')
      console.log('✓ Added dob column to users table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists
      } else {
        throw error
      }
    }

    // Try to add role column
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN role VARCHAR(80)')
      console.log('✓ Added role column to users table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists
      } else {
        throw error
      }
    }

    // Try to add manager_id column
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN manager_id INT REFERENCES users(id)')
      console.log('✓ Added manager_id column to users table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists
      } else {
        throw error
      }
    }

    // Ensure users table has an assigned_project_id column
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN assigned_project_id INT NULL')
      console.log('✓ Added assigned_project_id column to users table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // already exists
      } else {
        try {
          await pool.execute('ALTER TABLE users ADD COLUMN assigned_project_id INT NULL')
        } catch (e) {}
      }
    }

    // Create activities table
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS activities (
          id INT AUTO_INCREMENT PRIMARY KEY,
          date DATE NOT NULL,
          time TIME NOT NULL,
          engineer_name VARCHAR(120) NOT NULL,
          engineer_id VARCHAR(10),
          project VARCHAR(120),
          location VARCHAR(120),
          activity_target TEXT,
          problem TEXT,
          status ENUM('present', 'absent', 'leave') DEFAULT 'present',
          leave_reason TEXT,
          start_time TIME,
          end_time TIME,
          activity_type VARCHAR(50),
          logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      console.log('✓ Created activities table')
    } catch (error) {
      console.error('Error creating activities table:', error.message)
    }

    // Create hourly_reports table
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS hourly_reports (
          id INT AUTO_INCREMENT PRIMARY KEY,
          report_date DATE NOT NULL,
          project_name VARCHAR(120) NOT NULL,
          daily_target TEXT,
          hourly_activity TEXT,
          problem_start TIME NULL,
          problem_end TIME NULL,
          incharge_remark TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      console.log('✓ Created hourly_reports table')
    } catch (error) {
      console.error('Error creating hourly_reports table:', error.message)
    }

    // Ensure hourly_reports has user_id and time_period columns
    try {
      await pool.execute('ALTER TABLE hourly_reports ADD COLUMN IF NOT EXISTS user_id INT NULL')
      await pool.execute("ALTER TABLE hourly_reports ADD COLUMN IF NOT EXISTS time_period VARCHAR(50) NULL")
      console.log('✓ Ensured hourly_reports has user_id and time_period columns')
    } catch (error) {
      if (error.code && error.code === 'ER_DUP_FIELDNAME') {
        // already exists
      } else {
        try {
          await pool.execute('ALTER TABLE hourly_reports ADD COLUMN user_id INT NULL')
        } catch (e) {}
        try {
          await pool.execute('ALTER TABLE hourly_reports ADD COLUMN time_period VARCHAR(50) NULL')
        } catch (e) {}
      }
    }

    // Create projects table
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS projects (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      console.log('✓ Created projects table')
    } catch (error) {
      console.error('Error creating projects table:', error.message)
    }

    // Create project_collaborators table
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS project_collaborators (
          id INT AUTO_INCREMENT PRIMARY KEY,
          project_id INT NOT NULL,
          user_id INT DEFAULT NULL,
          collaborator_employee_id VARCHAR(50) DEFAULT NULL,
          role VARCHAR(80) DEFAULT NULL,
          added_by INT DEFAULT NULL,
          added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      console.log('✓ Created project_collaborators table')
    } catch (error) {
      console.error('Error creating project_collaborators table:', error.message)
    }

    // Create project_assignments table (for many-to-many employee-project relationship)
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS project_assignments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          project_id INT NOT NULL,
          employee_id INT DEFAULT NULL,
          employee_code VARCHAR(10) DEFAULT NULL,
          role VARCHAR(80) DEFAULT 'Team Member',
          assigned_by INT DEFAULT NULL,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE KEY unique_assignment (project_id, employee_id)
        )
      `)
      console.log('✓ Created project_assignments table')
    } catch (error) {
      console.error('Error creating project_assignments table:', error.message)
    }

    // Create daily_target_reports table
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS daily_target_reports (
          id INT AUTO_INCREMENT PRIMARY KEY,
          report_date DATE NOT NULL,
          in_time TIME NOT NULL,
          out_time TIME NOT NULL,
          customer_name VARCHAR(120) NOT NULL,
          customer_person VARCHAR(120) NOT NULL,
          customer_contact VARCHAR(20) NOT NULL,
          end_customer_name VARCHAR(120) NOT NULL,
          end_customer_person VARCHAR(120) NOT NULL,
          end_customer_contact VARCHAR(20) NOT NULL,
          project_no VARCHAR(120) NOT NULL,
          location_type VARCHAR(20) NOT NULL,
          leave_type VARCHAR(50) DEFAULT NULL,
          site_location VARCHAR(255),
          location_lat DECIMAL(10, 8),
          location_lng DECIMAL(11, 8),
          mom_report_path VARCHAR(255),
          daily_target_planned TEXT NOT NULL,
          daily_target_achieved TEXT NOT NULL,
          additional_activity TEXT,
          who_added_activity VARCHAR(120),
          daily_pending_target TEXT,
          reason_pending_target TEXT,
          problem_faced TEXT,
          problem_resolved TEXT,
          online_support_required TEXT,
          support_engineer_name VARCHAR(120),
          site_start_date DATE NOT NULL,
          site_end_date DATE,
          incharge VARCHAR(120) NOT NULL,
          remark TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      console.log('✓ Created daily_target_reports table')
    } catch (error) {
      console.error('Error creating daily_target_reports table:', error.message)
    }

    // Add report_date column to daily_target_reports
    try {
      await pool.execute('ALTER TABLE daily_target_reports ADD COLUMN report_date DATE')
      console.log('✓ Added report_date column to daily_target_reports table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists
      } else {
        console.error('Error adding report_date column:', error.message)
      }
    }

    // Add email column to users
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN email VARCHAR(255)')
      console.log('✓ Added email column to users table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('✓ Email column already exists')
      } else {
        console.error('Error adding email column:', error.message)
      }
    }

    // Add new columns to existing daily_target_reports table
    const newColumns = [
      { name: 'end_customer_name', type: 'VARCHAR(120) DEFAULT ""' },
      { name: 'end_customer_person', type: 'VARCHAR(120) DEFAULT ""' },
      { name: 'end_customer_contact', type: 'VARCHAR(20) DEFAULT ""' },
      { name: 'project_no', type: 'VARCHAR(120) DEFAULT ""' },
      { name: 'location_type', type: 'VARCHAR(20) DEFAULT ""' },
      { name: 'leave_type', type: 'VARCHAR(50) DEFAULT NULL' },
      { name: 'site_location', type: 'VARCHAR(255)' },
      { name: 'number_of_days', type: 'INT DEFAULT 1' },
      { name: 'location_lat', type: 'DECIMAL(10, 8)' },
      { name: 'location_lng', type: 'DECIMAL(11, 8)' },
      { name: 'mom_report_path', type: 'VARCHAR(255)' },
      { name: 'daily_target_planned', type: 'TEXT' },
      { name: 'daily_target_achieved', type: 'TEXT' },
      { name: 'additional_activity', type: 'TEXT' },
      { name: 'who_added_activity', type: 'VARCHAR(120)' },
      { name: 'daily_pending_target', type: 'TEXT' },
      { name: 'reason_pending_target', type: 'TEXT' },
      { name: 'problem_faced', type: 'TEXT' },
      { name: 'problem_resolved', type: 'TEXT' },
      { name: 'online_support_required', type: 'TEXT' },
      { name: 'support_engineer_name', type: 'VARCHAR(120)' },
      { name: 'site_start_date', type: 'DATE' },
      { name: 'site_end_date', type: 'DATE' },
      { name: 'incharge', type: 'VARCHAR(120) DEFAULT ""' },
      { name: 'remark', type: 'TEXT' },
      { name: 'user_id', type: 'INT' },
      { name: 'leave_status', type: "VARCHAR(20) DEFAULT NULL" },
      { name: 'leave_approved_by', type: "VARCHAR(120) DEFAULT NULL" },
      { name: 'leave_approved_at', type: 'TIMESTAMP NULL' },
      { name: 'leave_approval_remark', type: 'TEXT' },
    ]

    for (const column of newColumns) {
      try {
        await pool.execute(
          `ALTER TABLE daily_target_reports ADD COLUMN ${column.name} ${column.type}`
        )
        console.log(`✓ Added ${column.name} column to daily_target_reports table`)
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          // Column already exists
        } else {
          console.error(`Error adding ${column.name} column:`, error.message)
        }
      }
    }

    // Create index for leave_type
    try {
      await pool.execute(`CREATE INDEX idx_leave_type ON daily_target_reports(location_type, leave_type, report_date)`)
      console.log('✓ Created idx_leave_type index')
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME' || error.errno === 1061) {
        console.log('Index idx_leave_type already exists')
      } else {
        console.error('Error creating idx_leave_type index:', error.message)
      }
    }

    // Ensure updated_at column exists
    try {
      await pool.execute('ALTER TABLE daily_target_reports ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL')
      console.log('✓ Added updated_at column to daily_target_reports table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists
      }
    }

    // Create project_files table
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS project_files (
          id INT AUTO_INCREMENT PRIMARY KEY,
          project_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          file_name VARCHAR(255) NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          file_path VARCHAR(500) NOT NULL,
          file_size INT NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          uploaded_by INT NOT NULL,
          uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
        )
      `)
      console.log('✓ Created project_files table')
    } catch (error) {
      console.error('Error creating project_files table:', error.message)
    }

    // Create MoM table
    await createMoMTable();

  } catch (error) {
    console.error('Migration error (non-fatal):', error.message)
  }
}

// Initialize app
const app = express()
const PORT = process.env.PORT || 5000
const HOST = '0.0.0.0'

dotenv.config()

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))

// CORS configuration
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}))

// Rate limiting for API
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

if (process.env.NODE_ENV === 'production') {
  app.use('/api', limiter)
} else {
  console.log('⚠️ Skipping API rate limiter in non-production environment')
}

// Request logger for API debugging
app.use('/api', (req, res, next) => {
  try {
    const auth = req.headers.authorization ? '[auth]' : '[no-auth]'
    console.log(`[API REQUEST] ${new Date().toISOString()} ${req.method} ${req.originalUrl} ${auth}`)
  } catch (e) {
    console.log('[API REQUEST] logging failed')
  }
  next()
})

// Compression middleware for production
if (process.env.NODE_ENV === 'production') {
  app.use(compression())
}

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  })
})

// Verify token middleware
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET ?? 'vickhardth-site-pulse-secret')
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

// User info endpoint
app.get('/api/users/me', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id
    
    const [rows] = await pool.execute(
      'SELECT id, username, role, employee_id FROM users WHERE id = ?',
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

// Create MoM routes inline (to avoid import issues)
const createMomRoutes = () => {
  const router = express.Router();

  // Create MoM
  router.post('/mom-records', verifyToken, async (req, res) => {
    try {
      const {
        customerName, customerPerson, custContact, custCountryCode,
        endCustName, endCustContact, endCustCountryCode, endCustPerson,
        enggName, siteLocation, momDate, reportingTime, momCloseTime,
        manHours, manHoursMoreThan9, billingDays, siteStartDate, siteEndDate,
        projectName, projectNo, observationNotes, solutionNotes, conclusion,
        locationLat, locationLng
      } = req.body;

      const [result] = await pool.execute(
        `INSERT INTO mom_records (
          user_id, user_name, customer_name, customer_person, cust_contact, cust_country_code,
          end_cust_name, end_cust_contact, end_cust_country_code, end_cust_person,
          engg_name, site_location, mom_date, reporting_time, mom_close_time,
          man_hours, man_hours_more_than_9, billing_days, site_start_date, site_end_date,
          project_name, project_no, observation_notes, solution_notes, conclusion,
          location_lat, location_lng
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id, req.user.username || req.user.name, customerName, customerPerson, 
          custContact, custCountryCode || '+91', endCustName, endCustContact, 
          endCustCountryCode || '+91', endCustPerson, enggName, siteLocation, momDate, 
          reportingTime, momCloseTime, manHours, manHoursMoreThan9, billingDays, 
          siteStartDate, siteEndDate, projectName, projectNo, observationNotes, 
          solutionNotes, conclusion, locationLat, locationLng
        ]
      );

      res.status(201).json({
        success: true,
        message: 'MoM created successfully',
        momId: result.insertId
      });
    } catch (error) {
      console.error('Error creating MoM:', error);
      res.status(500).json({ error: 'Failed to create MoM' });
    }
  });

  // Get all MoMs
  router.get('/mom-records', verifyToken, async (req, res) => {
    try {
      const { date } = req.query;
      let query = 'SELECT * FROM mom_records WHERE 1=1';
      const params = [];

      if (date) {
        query += ' AND DATE(created_at) = ?';
        params.push(date);
      }

      // Role-based filtering
      if (!['manager', 'admin'].includes(req.user.role?.toLowerCase())) {
        query += ' AND user_id = ?';
        params.push(req.user.id);
      }

      query += ' ORDER BY created_at DESC';

      const [rows] = await pool.execute(query, params);
      
      res.json({ success: true, moms: rows });
    } catch (error) {
      console.error('Error fetching MoM records:', error);
      res.status(500).json({ error: 'Failed to fetch MoM records' });
    }
  });

  // Get MoM by ID
  router.get('/mom-records/:id', verifyToken, async (req, res) => {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM mom_records WHERE id = ?',
        [req.params.id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'MoM not found' });
      }

      const mom = rows[0];

      // Check permission
      if (!['manager', 'admin'].includes(req.user.role?.toLowerCase()) && 
          mom.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      res.json({ success: true, mom });
    } catch (error) {
      console.error('Error fetching MoM:', error);
      res.status(500).json({ error: 'Failed to fetch MoM' });
    }
  });

  // Get MoM statistics
  router.get('/mom-stats', verifyToken, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let query = `SELECT 
        COUNT(*) as totalMoms,
        COUNT(DISTINCT customer_name) as uniqueCustomersCount,
        COUNT(DISTINCT engg_name) as uniqueEngineersCount
        FROM mom_records WHERE 1=1`;
      const params = [];

      if (startDate && endDate) {
        query += ' AND DATE(created_at) BETWEEN ? AND ?';
        params.push(startDate, endDate);
      }

      // Role-based filtering
      if (!['manager', 'admin'].includes(req.user.role?.toLowerCase())) {
        query += ' AND user_id = ?';
        params.push(req.user.id);
      }

      const [rows] = await pool.execute(query, params);
      
      res.json({
        success: true,
        stats: rows[0] || {
          totalMoms: 0,
          uniqueCustomersCount: 0,
          uniqueEngineersCount: 0
        }
      });
    } catch (error) {
      console.error('Error fetching MoM stats:', error);
      res.status(500).json({ error: 'Failed to fetch MoM statistics' });
    }
  });

  // Get MoMs by employee
  router.get('/mom-records/employee/:employeeId', verifyToken, async (req, res) => {
    try {
      const { employeeId } = req.params;
      const { date } = req.query;
      
      let query = 'SELECT * FROM mom_records WHERE user_id = ?';
      const params = [employeeId];

      if (date) {
        query += ' AND DATE(created_at) = ?';
        params.push(date);
      }

      query += ' ORDER BY created_at DESC';

      const [rows] = await pool.execute(query, params);
      
      res.json({ success: true, moms: rows });
    } catch (error) {
      console.error('Error fetching employee MoM records:', error);
      res.status(500).json({ error: 'Failed to fetch employee MoM records' });
    }
  });

  return router;
};

// API Routes
app.use('/api/time-tracking', timeTrackingRoutes)
app.use('/api/auth', authRouter)
app.use('/api/auth', authRoutes)
app.use('/api/activity', activityRouter)
app.use('/api/hourly-report', hourlyReportRouter)
app.use('/api/daily-target', dailyTargetRouter)
app.use('/api/employee-activity', employeeActivityRouter)
app.use('/api/projects', verifyToken, projectsRouter)

// Add MoM routes
app.use('/api/employee-activity', createMomRoutes())

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../frontend/dist')
  
  app.use(express.static(frontendPath))
  
  app.get('/*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'))
    }
  })
  
  console.log('✓ Serving frontend static files from:', frontendPath)
}

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ 
    message: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method 
  })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  })
  
  const statusCode = err.status || 500
  const message = process.env.NODE_ENV === 'production' 
    ? 'Unexpected error occurred' 
    : err.message
    
  res.status(statusCode).json({ 
    message,
    ...(process.env.NODE_ENV !== 'production' && { error: err.message, stack: err.stack })
  })
})

// Graceful shutdown
let server;
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...')
  if (server) {
    server.close(() => {
      console.log('Server closed')
      pool.end(() => {
        console.log('Database pool closed')
        process.exit(0)
      })
    })
  } else {
    process.exit(0)
  }
})

// Run migration on startup
migrateDatabase().then(() => {
  server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`)
    console.log(`📡 API server ready on http://${HOST}:${PORT}`)
    console.log(`🔐 Auth endpoint: http://${HOST}:${PORT}/api/auth/login`)
    console.log(`👥 Users endpoint: http://${HOST}:${PORT}/api/auth/users`)
    console.log(`🏥 Health check: http://${HOST}:${PORT}/health`)
    console.log(`👤 User info endpoint: http://${HOST}:${PORT}/api/users/me`)
    console.log(`📝 MoM endpoints: http://${HOST}:${PORT}/api/employee-activity/mom-records`)
    
    if (process.env.NODE_ENV === 'production') {
      console.log(`🌐 Serving frontend from static build`)
    }
  })
})
import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../db.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? 'vickhardth-site-pulse-secret'
const TOKEN_TTL_SECONDS = 60 * 60 * 8 // 8 hours

// Employee ID validation helper - Format: E001 (E + 1-5 digits, max 6 chars)
const validateEmployeeId = (employeeId) => {
  if (!employeeId || employeeId.trim() === '') {
    return 'Employee ID is required'
  }
  
  // Format: E followed by 1-5 digits (total 2-6 characters)
  // Examples: E001, E12345, E99999
  const empIdRegex = /^E\d{1,5}$/
  if (!empIdRegex.test(employeeId)) {
    return 'Employee ID must be in format E001 (E followed by 1-5 digits)'
  }
  
  // Max 6 characters check (E + 1-5 digits)
  if (employeeId.length > 6) {
    return 'Employee ID cannot exceed 6 characters'
  }
  
  return null // No error
}

// Phone number validation helper
const validatePhone = (phone) => {
  if (!phone || phone.trim() === '') {
    return 'Phone number is required'
  }
  
  // Remove any non-digit characters
  const cleanPhone = phone.replace(/\D/g, '')
  
  // Check if it's exactly 10 digits
  if (cleanPhone.length !== 10) {
    return 'Phone number must be 10 digits'
  }
  
  // Check if it starts with 6-9 (Indian mobile numbers)
  if (!/^[6-9]/.test(cleanPhone)) {
    return 'Phone number must start with 6, 7, 8, or 9'
  }
  
  return null // No error
}

// Get user profile endpoint
router.get('/profile', async (req, res) => {
  try {
    // Get token from authorization header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const [rows] = await pool.execute(
      'SELECT id, employee_id, username, role, dob, phone FROM users WHERE id = ?',
      [decoded.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = rows[0];
    
    res.json({
      id: user.id,
      employeeId: user.employee_id,
      username: user.username,
      name: user.username, // Use username as name
      role: user.role,
      dob: user.dob,
      phone: user.phone
    });
  } catch (error) {
    console.error('Failed to fetch profile:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    res.status(500).json({ message: 'Unable to fetch profile', error: error.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    console.log('📥 [REGISTER] Request received:', req.body)
    
    // FIX: Accept both employeeId and employee_id (frontend sends employee_id)
    const employeeId = req.body.employee_id || req.body.employeeId
    const { username, password, dob, phone, role, full_name } = req.body

    console.log('🔍 [REGISTER] Parsed fields:', {
      employeeId,
      username,
      passwordLength: password ? password.length : 0,
      dob,
      phone,
      role,
      full_name
    })

    // For Managers: employeeId is optional
    // For other roles: employeeId is required
    const isManager = role && role.toLowerCase().includes('manager')
    
    console.log('👤 [REGISTER] Role:', role, 'Is Manager:', isManager)
    
    if (!isManager) {
      // Validate Employee ID format (E001 format) for non-managers
      if (!employeeId || employeeId.trim() === '') {
        console.log('❌ [REGISTER] Employee ID missing for non-manager')
        return res.status(400).json({ message: 'Employee ID is required for non-manager roles' })
      }
      
      const employeeIdError = validateEmployeeId(employeeId)
      if (employeeIdError) {
        console.log('❌ [REGISTER] Employee ID validation failed:', employeeIdError)
        return res.status(400).json({ message: employeeIdError })
      }
    }

    // Validate required fields
    const requiredFields = ['username', 'password', 'dob', 'phone', 'role']
    for (const field of requiredFields) {
      if (!req.body[field] || req.body[field].trim() === '') {
        console.log('❌ [REGISTER] Missing required field:', field)
        return res.status(400).json({ message: `${field} is required` })
      }
    }

    // Validate DOB is a valid date and must be before today
    console.log('📅 [REGISTER] DOB received:', dob)
    const dobDate = new Date(dob)
    if (Number.isNaN(dobDate.getTime())) {
      console.log('❌ [REGISTER] Invalid DOB format:', dob)
      return res.status(400).json({ message: 'Invalid date of birth format. Use YYYY-MM-DD' })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (dobDate >= today) {
      console.log('❌ [REGISTER] DOB is in future:', dob)
      return res
        .status(400)
        .json({ message: 'Date of birth must be before today (no future dates)' })
    }

    // Validate phone number
    console.log('📞 [REGISTER] Phone received:', phone)
    const phoneError = validatePhone(phone)
    if (phoneError) {
      console.log('❌ [REGISTER] Phone validation failed:', phoneError)
      return res.status(400).json({ message: phoneError })
    }

    // Clean phone number (remove any non-digit characters)
    const cleanPhone = phone.replace(/\D/g, '')

    // Check if Phone number already exists
    console.log('🔍 [REGISTER] Checking if Phone exists:', cleanPhone)
    const [existingPhone] = await pool.execute(
      'SELECT id FROM users WHERE phone = ?',
      [cleanPhone]
    )
    if (existingPhone.length > 0) {
      console.log('❌ [REGISTER] Phone number already exists:', cleanPhone)
      return res.status(409).json({ message: 'Phone number already registered' })
    }

    // For non-managers: Check if Employee ID already exists
    if (!isManager && employeeId) {
      console.log('🔍 [REGISTER] Checking if Employee ID exists:', employeeId)
      const [existingEmployeeId] = await pool.execute(
        'SELECT id FROM users WHERE employee_id = ?',
        [employeeId.toUpperCase()]
      )
      if (existingEmployeeId.length > 0) {
        console.log('❌ [REGISTER] Employee ID already exists:', employeeId)
        return res.status(409).json({ message: 'Employee ID already exists' })
      }
    }

    // Check if Username already exists
    console.log('🔍 [REGISTER] Checking if Username exists:', username)
    const [existingUsername] = await pool.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    )
    if (existingUsername.length > 0) {
      console.log('❌ [REGISTER] Username already exists:', username)
      return res.status(409).json({ message: 'Username already exists' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    
    // FIX: Use appropriate columns based on your database schema
    // Your database has: employee_id, username, password_hash, dob, phone, role, manager_id, created_at
    // It does NOT have: full_name, gender (unless you added them)
    
    let query, params
    if (isManager) {
      // For managers, employee_id is NULL
      query = 'INSERT INTO users (employee_id, username, password_hash, dob, phone, role) VALUES (?, ?, ?, ?, ?, ?)'
      params = [null, username, passwordHash, dob, cleanPhone, role]
    } else {
      // For non-managers, employee_id is required
      query = 'INSERT INTO users (employee_id, username, password_hash, dob, phone, role) VALUES (?, ?, ?, ?, ?, ?)'
      params = [employeeId.toUpperCase(), username, passwordHash, dob, cleanPhone, role]
    }
    
    console.log('📝 [REGISTER] Executing SQL:', query)
    console.log('📝 [REGISTER] With params:', params.map(p => p === passwordHash ? '[HASHED]' : p))
    
    const [result] = await pool.execute(query, params)

    const userId = result.insertId
    
    // Create JWT payload
    const jwtPayload = { 
      id: userId, 
      username, 
      role,
      phone: cleanPhone
    }
    
    // Only add employeeId to JWT if it exists (non-managers)
    if (!isManager && employeeId) {
      jwtPayload.employeeId = employeeId.toUpperCase()
    }
    
    const token = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS })

    const responseData = {
      token,
      id: userId,
      username,
      name: full_name || username, // Use full_name if provided, otherwise username
      role,
      phone: cleanPhone,
      message: 'Registration successful'
    }
    
    // Only add employeeId to response if it exists (non-managers)
    if (!isManager && employeeId) {
      responseData.employeeId = employeeId.toUpperCase()
    } else {
      responseData.employeeId = null
    }
    
    console.log('✅ [REGISTER] Registration successful for:', username, 'Role:', role)
    console.log('✅ [REGISTER] Response data:', { 
      ...responseData, 
      token: token.substring(0, 20) + '...' 
    })
    
    res.status(201).json(responseData)
  } catch (error) {
    console.error('❌ [REGISTER] Failed to register user:', error)
    console.error('❌ [REGISTER] Error stack:', error.stack)
    
    // More specific error messages
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('employee_id')) {
        return res.status(409).json({ message: 'Employee ID already exists' })
      } else if (error.message.includes('username')) {
        return res.status(409).json({ message: 'Username already exists' })
      } else if (error.message.includes('phone')) {
        return res.status(409).json({ message: 'Phone number already registered' })
      }
    }
    
    res.status(500).json({ message: 'Unable to register user. Error: ' + error.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    console.log('📥 [LOGIN] Request received:', req.body)
    
    // FIX: Accept both employeeId and employee_id
    const employeeId = req.body.employee_id || req.body.employeeId
    const { username, password, role } = req.body

    console.log('🔍 [LOGIN] Parsed fields:', {
      employeeId,
      username,
      passwordLength: password ? password.length : 0,
      role
    })

    // Basic validation
    if (!username || !password) {
      console.log('❌ [LOGIN] Missing username or password')
      return res.status(400).json({ message: 'Username and password are required' })
    }

    // Find user by username (both managers and non-managers)
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE username = ?',
      [username]
    )

    if (rows.length === 0) {
      console.log('❌ [LOGIN] User not found:', username)
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const user = rows[0]
    console.log('🔍 [LOGIN] User found:', {
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employee_id,
      phone: user.phone
    })
    
    // Verify password
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      console.log('❌ [LOGIN] Invalid password for user:', username)
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // Create token
    const token = jwt.sign(
      {
        id: user.id,
        employeeId: user.employee_id,
        username: user.username,
        role: user.role,
        phone: user.phone
      },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL_SECONDS }
    )

    const responseData = {
      token,
      id: user.id,
      employeeId: user.employee_id,
      username: user.username,
      name: user.username, // Use username as name
      role: user.role,
      phone: user.phone,
      message: 'Login successful'
    }
    
    console.log('✅ [LOGIN] Login successful:', user.username)
    console.log('✅ [LOGIN] Response data:', { 
      ...responseData, 
      token: token.substring(0, 20) + '...' 
    })
    
    return res.json(responseData)
    
  } catch (error) {
    console.error('❌ [LOGIN] Failed to login:', error)
    console.error('❌ [LOGIN] Error stack:', error.stack)
    res.status(500).json({ message: 'Unable to login. Error: ' + error.message })
  }
})

// Update check-employee-id endpoint
router.get('/check-employee-id/:employeeId', async (req, res) => {
  try {
    console.log('🔍 [CHECK-EMPLOYEE-ID] Checking:', req.params.employeeId)
    const { employeeId } = req.params
    
    // Special case: If employeeId is "MANAGER", it's not a valid Employee ID format
    if (employeeId.toUpperCase() === 'MANAGER') {
      console.log('⚠️ [CHECK-EMPLOYEE-ID] MANAGER keyword used')
      return res.json({
        valid: false,
        available: false,
        message: 'MANAGER is not a valid Employee ID format'
      })
    }
    
    // Validate the format
    const employeeIdError = validateEmployeeId(employeeId)
    if (employeeIdError) {
      console.log('❌ [CHECK-EMPLOYEE-ID] Validation failed:', employeeIdError)
      return res.status(400).json({ 
        valid: false,
        message: employeeIdError 
      })
    }
    
    // Check if it exists
    console.log('🔍 [CHECK-EMPLOYEE-ID] Checking database for:', employeeId)
    const [rows] = await pool.execute(
      'SELECT id FROM users WHERE employee_id = ?',
      [employeeId.toUpperCase()]
    )
    
    const available = rows.length === 0
    console.log(`✅ [CHECK-EMPLOYEE-ID] Employee ID ${employeeId} is ${available ? 'available' : 'taken'}`)
    
    res.json({
      valid: true,
      available: available,
      message: available 
        ? 'Employee ID is available' 
        : 'Employee ID already taken'
    })
  } catch (error) {
    console.error('❌ [CHECK-EMPLOYEE-ID] Failed:', error)
    res.status(500).json({ 
      valid: false,
      message: 'Unable to check employee ID' 
    })
  }
})

// Check if phone number already exists
router.get('/check-phone/:phone', async (req, res) => {
  try {
    console.log('🔍 [CHECK-PHONE] Checking:', req.params.phone)
    const { phone } = req.params
    
    // Clean phone number (remove any non-digit characters)
    const cleanPhone = phone.replace(/\D/g, '')
    
    // Validate phone number
    const phoneError = validatePhone(cleanPhone)
    if (phoneError) {
      console.log('❌ [CHECK-PHONE] Validation failed:', phoneError)
      return res.status(400).json({ 
        valid: false,
        message: phoneError 
      })
    }
    
    // Check if it exists
    console.log('🔍 [CHECK-PHONE] Checking database for:', cleanPhone)
    const [rows] = await pool.execute(
      'SELECT id FROM users WHERE phone = ?',
      [cleanPhone]
    )
    
    const available = rows.length === 0
    console.log(`✅ [CHECK-PHONE] Phone number ${cleanPhone} is ${available ? 'available' : 'taken'}`)
    
    res.json({
      valid: true,
      available: available,
      message: available 
        ? 'Phone number is available' 
        : 'Phone number already registered'
    })
  } catch (error) {
    console.error('❌ [CHECK-PHONE] Failed:', error)
    res.status(500).json({ 
      valid: false,
      message: 'Unable to check phone number' 
    })
  }
})

// Get user by Employee ID
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params
    
    // Skip validation for "MANAGER" special case
    if (employeeId.toUpperCase() !== 'MANAGER') {
      // Validate the format first
      const employeeIdError = validateEmployeeId(employeeId)
      if (employeeIdError) {
        return res.status(400).json({ message: employeeIdError })
      }
    }
    
    const [rows] = await pool.execute(
      'SELECT id, employee_id, username, role, dob, phone FROM users WHERE employee_id = ? OR (employee_id IS NULL AND username = ?)',
      [employeeId.toUpperCase(), employeeId]
    )
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Employee not found' })
    }
    
    const user = rows[0]
    res.json({
      id: user.id,
      employeeId: user.employee_id,
      username: user.username,
      name: user.username, // Use username as name
      role: user.role,
      dob: user.dob,
      phone: user.phone
    })
  } catch (error) {
    console.error('Failed to fetch employee', error)
    res.status(500).json({ message: 'Unable to fetch employee details' })
  }
})

// Health check endpoint for auth routes
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'authentication-service'
  })
})

export default router
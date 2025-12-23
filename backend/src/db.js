// db.js - Updated with better error handling
import mysql from 'mysql2'

// Create connection pool with better configuration
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'vickhardth_ops', // Make sure this matches
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
})

// Test the connection on startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Database connection failed:', err)
    return
  }
  
  console.log('✅ Database connected successfully')
  
  // Verify the database name
  connection.query('SELECT DATABASE() as db', (err, results) => {
    if (err) {
      console.error('Error checking database:', err)
    } else {
      console.log(`📊 Connected to database: ${results[0].db}`)
    }
    connection.release()
  })
})

// Add promise wrapper
const promisePool = pool.promise()

export default promisePool
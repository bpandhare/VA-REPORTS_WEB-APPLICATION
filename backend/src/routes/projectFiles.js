import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import pool from '../db.js'
import { verifyToken } from './projects.js'

const router = Router()

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/')
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only PDF, images, Word, and Excel files are allowed.'))
    }
  }
})

// Get all files for a project
router.get('/:projectId/files', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    
    const [files] = await pool.execute(`
      SELECT pf.*, u.username as uploaded_by_name 
      FROM project_files pf
      LEFT JOIN users u ON pf.uploaded_by = u.id
      WHERE pf.project_id = ?
      ORDER BY pf.uploaded_at DESC
    `, [projectId])
    
    res.json({ success: true, files })
  } catch (error) {
    console.error('Failed to fetch project files:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch project files' })
  }
})

// Upload file to project
router.post('/:projectId/files', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    const { name, description } = req.body
    const uploadedBy = req.user?.id
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' })
    }

    // Get file info
    const filePath = req.file.path
    const fileSize = req.file.size
    const fileName = req.file.filename
    const originalName = req.file.originalname
    const mimeType = req.file.mimetype

    // Insert into database
    await pool.execute(
      `INSERT INTO project_files 
       (project_id, name, description, file_name, original_name, file_path, file_size, mime_type, uploaded_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, name, description, fileName, originalName, filePath, fileSize, mimeType, uploadedBy]
    )

    res.json({ 
      success: true, 
      message: 'File uploaded successfully',
      file: {
        name,
        fileName,
        fileSize,
        mimeType,
        filePath
      }
    })
  } catch (error) {
    console.error('Failed to upload file:', error)
    res.status(500).json({ success: false, message: 'Failed to upload file', error: error.message })
  }
})

// Delete project file
router.delete('/:projectId/files/:fileId', verifyToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    const fileId = parseInt(req.params.fileId)
    
    // Check if file exists and user has permission
    const [files] = await pool.execute(
      'SELECT * FROM project_files WHERE id = ? AND project_id = ?',
      [fileId, projectId]
    )
    
    if (files.length === 0) {
      return res.status(404).json({ success: false, message: 'File not found' })
    }
    
    const file = files[0]
    
    // Check if user is manager or uploaded the file
    if (req.user.role !== 'Manager' && file.uploaded_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this file' })
    }
    
    // Delete from database
    await pool.execute('DELETE FROM project_files WHERE id = ?', [fileId])
    
    // TODO: Delete physical file from server
    
    res.json({ success: true, message: 'File deleted successfully' })
  } catch (error) {
    console.error('Failed to delete file:', error)
    res.status(500).json({ success: false, message: 'Failed to delete file' })
  }
})

export default router
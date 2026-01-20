// server-mom.mjs (or server-mom.js with ES6 import/export)
import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// Define MoM Schema
const momSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  customerName: String,
  customerPerson: String,
  custContact: String,
  custCountryCode: String,
  endCustName: String,
  endCustContact: String,
  endCustCountryCode: String,
  endCustPerson: String,
  enggName: String,
  siteLocation: String,
  momDate: String,
  reportingTime: String,
  momCloseTime: String,
  manHours: String,
  manHoursMoreThan9: String,
  billingDays: String,
  siteStartDate: String,
  siteEndDate: String,
  projectName: String,
  projectNo: String,
  observationNotes: String,
  solutionNotes: String,
  conclusion: String,
  locationLat: String,
  locationLng: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const MoM = mongoose.models.MoM || mongoose.model('MoM', momSchema);

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Replace with your actual JWT verification
    const jwt = awaitimport('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Create MoM
router.post('/mom-records', authenticateToken, async (req, res) => {
  try {
    const momData = req.body;
    
    if (!momData.userId && req.user) {
      momData.userId = req.user.id;
    }
    if (!momData.userName && req.user) {
      momData.userName = req.user.username || req.user.name;
    }
    
    const mom = new MoM(momData);
    await mom.save();
    
    res.status(201).json({
      success: true,
      message: 'MoM created successfully',
      momId: mom._id,
      mom: mom
    });
  } catch (error) {
    console.error('Error creating MoM:', error);
    res.status(500).json({ error: 'Failed to create MoM' });
  }
});

// Get all MoMs for manager
router.get('/mom-records', authenticateToken, async (req, res) => {
  try {
    const { date, startDate, endDate, employeeId } = req.query;
    let query = {};
    
    if (date) {
      const startOfDay = new Date(date);
      const endOfDay = new Date(date);
      endOfDay.setDate(endOfDay.getDate() + 1);
      
      query.createdAt = {
        $gte: startOfDay,
        $lt: endOfDay
      };
    } else if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (employeeId) {
      query.userId = employeeId;
    }
    
    const userRole = req.user.role;
    if (!['manager', 'admin'].includes(userRole?.toLowerCase())) {
      query.userId = req.user.id;
    }
    
    const moms = await MoM.find(query)
      .populate('userId', 'username employeeId email phone')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({ success: true, moms });
  } catch (error) {
    console.error('Error fetching MoM records:', error);
    res.status(500).json({ error: 'Failed to fetch MoM records' });
  }
});

// Get MoM statistics
router.get('/mom-stats', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = {};
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const userRole = req.user.role;
    if (!['manager', 'admin'].includes(userRole?.toLowerCase())) {
      query.userId = req.user.id;
    }
    
    const stats = await MoM.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalMoms: { $sum: 1 },
          uniqueCustomers: { $addToSet: "$customerName" },
          uniqueEngineers: { $addToSet: "$enggName" }
        }
      },
      {
        $project: {
          totalMoms: 1,
          uniqueCustomersCount: { $size: "$uniqueCustomers" },
          uniqueEngineersCount: { $size: "$uniqueEngineers" }
        }
      }
    ]);
    
    res.json({
      success: true,
      stats: stats[0] || {
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

// Get MoM by ID
router.get('/mom-records/:id', authenticateToken, async (req, res) => {
  try {
    const mom = await MoM.findById(req.params.id)
      .populate('userId', 'username employeeId email phone')
      .lean();
    
    if (!mom) {
      return res.status(404).json({ error: 'MoM not found' });
    }
    
    const userRole = req.user.role;
    if (!['manager', 'admin'].includes(userRole?.toLowerCase()) && 
        mom.userId._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    res.json({ success: true, mom });
  } catch (error) {
    console.error('Error fetching MoM:', error);
    res.status(500).json({ error: 'Failed to fetch MoM' });
  }
});

export default router;
// App.jsx - Updated with role-based routing
import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './components/AuthContext'
import Sidebar from './components/Sidebar'
import HourlyForm from './components/HourlyReportForm'
import DailyTargetForm from './components/DailyTargetForm'
import ActivityTable from './components/ActivityDisplay'
import Login from './components/AuthForm'
import CreateMOM from './components/CreateMoM'
import AttendanceHistory from './components/AttendanceHistory'
import LeaveApplication from './components/LeaveApplication'
import ManagerApproval from './components/ManagerLeaveApproval'
import ProjectList from './components/ProjectList'
import EmployeeProjects from './components/EmployeeProjects'
import TimeTracker from './components/TimeTracker'
import ProjectDetails from './components/ProjectDetails'

function AppContent() {
  const [currentPage, setCurrentPage] = useState('hourly')
  const { token, user } = useAuth()
  
  console.log('Auth state:', { token, user, hasToken: !!token, role: user?.role })
  
  const handlePageChange = (page) => {
    setCurrentPage(page)
  }

  if (token) {
    const isManager = user?.role === 'Manager'
    
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar currentPage={currentPage} onPageChange={handlePageChange} />
        <main style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
          <Routes>
            <Route path="/hourly" element={<HourlyForm />} />
            <Route path="/daily" element={<DailyTargetForm />} />
            <Route path="/activity" element={<ActivityTable />} />
            <Route path="/attendance-history" element={<AttendanceHistory />} />
            <Route path="/create-mom" element={<CreateMOM />} />
            <Route path="/leave-application" element={<LeaveApplication />} />
            <Route path="/time-tracker" element={<TimeTracker />} />
            <Route path="/project/:id" element={<ProjectDetails />} />
            
            {/* Projects - different views based on role */}
            <Route path="/projects" element={
              isManager ? <ProjectList /> : <EmployeeProjects />
            } />
            
            {/* Manager-only routes */}
            {isManager && (
              <Route path="/leave-approval" element={<ManagerApproval />} />
            )}
            
            {/* Default route */}
            <Route path="/" element={<Navigate to="/hourly" replace />} />
            <Route path="*" element={<Navigate to="/hourly" replace />} />
          </Routes>
        </main>
      </div>
    )
  } else {
    console.log('User is NOT logged in, showing login page')
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
}

function App() {
  
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  )
}

export default App
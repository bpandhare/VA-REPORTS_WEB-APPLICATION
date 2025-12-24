import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import AuthForm from './components/AuthForm'
import HourlyReportForm from './components/HourlyReportForm'
import DailyTargetForm from './components/DailyTargetForm'
import ActivityDisplay from './components/ActivityDisplay'
import CreateMoM from './components/CreateMoM'
import AttendanceHistory from './components/AttendanceHistory'
import { AuthProvider, useAuth } from './components/AuthContext'
import './App.css'
import './index.css'

function Content() {
  const { user, logout } = useAuth()
  const [currentPage, setCurrentPage] = useState('hourly')

  return (
    <div className="app">
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="main">
        {user && (
          <div className="user-topbar">
            <div className="user-info">
              <span>👤 {user.username}</span>
              <span>{user.role}</span>
              {user.employeeId && <span>• {user.employeeId}</span>}
            </div>
            <button onClick={logout} className="logout-btn">
              🚪 Logout
            </button>
          </div>
        )}
        
        <Routes>
          <Route path="/" element={
            user ? <Navigate to="/hourly" /> : <AuthForm />
          } />
          
          <Route path="/hourly" element={
            user ? <HourlyReportForm /> : <Navigate to="/" />
          } />
          
          <Route path="/daily" element={
            user ? <DailyTargetForm /> : <Navigate to="/" />
          } />
          
          <Route path="/activity" element={
            user ? <ActivityDisplay /> : <Navigate to="/" />
          } />
          
          <Route path="/create-mom" element={
            user ? <CreateMoM /> : <Navigate to="/" />
          } />
          
          <Route path="/attendance-history" element={
            user ? <AttendanceHistory /> : <Navigate to="/" />
          } />
          
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <Content />
      </AuthProvider>
    </Router>
  )
}

export default App
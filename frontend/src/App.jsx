import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/Layout/Sidebar';
import Navbar from './components/Layout/Navbar';
import Login from './components/Auth/Login';

// Admin
import AdminDashboard from './components/Admin/Dashboard';
import ManageStudents from './components/Admin/ManageStudents';
import ManageTeachers from './components/Admin/ManageTeachers';
import ManageSections from './components/Admin/ManageSections';
import RegisterFace from './components/Admin/RegisterFace';

// Teacher
import MySections from './components/Teacher/MySections';
import TakeAttendance from './components/Teacher/TakeAttendance';

// Student
import MyAttendance from './components/Student/MyAttendance';
import Notifications from './components/Student/Notifications';
import ScanQrAttendance from './components/Student/ScanQrAttendance';

const RoleRoute = ({ children, allowed }) => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!allowed.includes(user?.role)) return <Navigate to={getHome(user?.role)} />;
  return children;
};

const getHome = (role) => {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'teacher') return '/teacher/sections';
  if (role === 'student') return '/student/attendance';
  return '/login';
};

const App = () => {
  const { isAuthenticated, user, loading } = useAuth();
  const [col, setCol] = useState(false);

  if (loading) return (
    <div className="loader-full">
      <div className="spinner" />
      <span>Starting Face Attendance System...</span>
    </div>
  );

  if (!isAuthenticated) {
    return <Routes><Route path="*" element={<Login />} /></Routes>;
  }

  return (
    <div className="app">
      <Sidebar collapsed={col} toggle={() => setCol(!col)} />
      <div className={`main ${col ? 'main-col' : ''}`}>
        <Navbar toggle={() => setCol(!col)} collapsed={col} />
        <div className="page">
          <Routes>
            {/* Admin Routes */}
            <Route path="/admin/dashboard" element={<RoleRoute allowed={['admin']}><AdminDashboard /></RoleRoute>} />
            <Route path="/admin/students" element={<RoleRoute allowed={['admin']}><ManageStudents /></RoleRoute>} />
            <Route path="/admin/teachers" element={<RoleRoute allowed={['admin']}><ManageTeachers /></RoleRoute>} />
            <Route path="/admin/sections" element={<RoleRoute allowed={['admin']}><ManageSections /></RoleRoute>} />
            <Route path="/admin/register-face" element={<RoleRoute allowed={['admin']}><RegisterFace /></RoleRoute>} />

            {/* Teacher Routes */}
            <Route path="/teacher/sections" element={<RoleRoute allowed={['teacher']}><MySections /></RoleRoute>} />
            <Route path="/teacher/take-attendance" element={<RoleRoute allowed={['teacher']}><TakeAttendance /></RoleRoute>} />

            {/* Student Routes */}
            <Route path="/student/attendance" element={<RoleRoute allowed={['student']}><MyAttendance /></RoleRoute>} />
            <Route path="/student/scan-qr" element={<RoleRoute allowed={['student']}><ScanQrAttendance /></RoleRoute>} />
            <Route path="/student/notifications" element={<RoleRoute allowed={['student']}><Notifications /></RoleRoute>} />

            {/* Default redirect based on role */}
            <Route path="/" element={<Navigate to={getHome(user?.role)} />} />
            <Route path="*" element={<Navigate to={getHome(user?.role)} />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

export default App;

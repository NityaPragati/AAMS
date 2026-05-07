import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  FiGrid, FiUsers, FiAward, FiBook, FiUserPlus, FiCamera,
  FiClipboard, FiBell, FiShield, FiChevronLeft
} from 'react-icons/fi';

const adminMenu = [
  { to: '/admin/dashboard', lb: 'Dashboard', ic: FiGrid },
  { to: '/admin/students', lb: 'Manage Students', ic: FiUsers },
  { to: '/admin/teachers', lb: 'Manage Teachers', ic: FiAward },
  { to: '/admin/sections', lb: 'Manage Sections', ic: FiBook },
  { to: '/admin/register-face', lb: 'Register Faces', ic: FiUserPlus },
];

const teacherMenu = [
  { to: '/teacher/sections', lb: 'My Sections', ic: FiBook },
  { to: '/teacher/take-attendance', lb: 'Take Attendance', ic: FiCamera },
];

const studentMenu = [
  { to: '/student/attendance', lb: 'My Attendance', ic: FiClipboard },
  { to: '/student/scan-qr', lb: 'Scan QR', ic: FiCamera },
  { to: '/student/notifications', lb: 'Notifications', ic: FiBell },
];

const Sidebar = ({ collapsed, toggle }) => {
  const loc = useLocation();
  const { user } = useAuth();

  const menu = user?.role === 'admin' ? adminMenu
    : user?.role === 'teacher' ? teacherMenu
    : studentMenu;

  const roleLabel = user?.role === 'admin' ? 'Admin Panel'
    : user?.role === 'teacher' ? 'Teacher Panel'
    : 'Student Portal';

  return (
    <aside className={`sb ${collapsed ? 'sb-col' : ''}`}>
      <div className="sb-top">
        <div className="sb-logo"><FiShield size={22} /></div>
        {!collapsed && (
          <div className="sb-brand">
            <h2>FaceAttend</h2>
            <span>{roleLabel}</span>
          </div>
        )}
        <button className="sb-toggle" onClick={toggle}><FiChevronLeft size={16} /></button>
      </div>
      <nav className="sb-nav">
        {!collapsed && <span className="sb-title">{user?.role} Menu</span>}
        <ul className="sb-list">
          {menu.map(m => (
            <li key={m.to}>
              <NavLink to={m.to}
                className={({ isActive }) => `sb-link ${isActive ? 'active' : ''}`}
                title={collapsed ? m.lb : ''}>
                <m.ic size={20} />
                {!collapsed && <span>{m.lb}</span>}
                {!collapsed && loc.pathname === m.to && <div className="sb-dot" />}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {!collapsed && (
        <div className="sb-foot">
          <div className="sb-av">{user?.full_name?.charAt(0) || 'U'}</div>
          <div>
            <p className="sb-fn">{user?.full_name || 'User'}</p>
            <p className="sb-fr">{user?.role}</p>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;

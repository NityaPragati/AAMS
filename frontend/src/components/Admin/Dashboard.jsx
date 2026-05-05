import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, healthAPI } from '../../services/api';
import { FiUsers, FiAward, FiBook, FiCamera, FiCheckCircle, FiActivity } from 'react-icons/fi';

const SC = ({ title, value, sub, icon, color }) => {
  const c = {
    mustard: { b: 'var(--m100)', f: 'var(--m600)' },
    green: { b: 'var(--ok-l)', f: 'var(--ok)' },
    blue: { b: 'var(--info-l)', f: 'var(--info)' },
    red: { b: 'var(--err-l)', f: 'var(--err)' },
    orange: { b: 'var(--warn-l)', f: 'var(--warn)' }
  }[color] || { b: 'var(--m100)', f: 'var(--m600)' };

  return (
    <div className="card" style={{ cursor: 'default' }}>
      <div className="card-b" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 22px' }}>
        <div style={{
          width: 50, height: 50, borderRadius: 'var(--r-md)', background: c.b, color: c.f,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>{icon}</div>
        <div>
          <p style={{ fontSize: 11, color: 'var(--g500)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>{title}</p>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--g900)', lineHeight: 1.2 }}>{value}</h2>
          {sub && <p style={{ fontSize: 11, color: 'var(--g400)', marginTop: 2 }}>{sub}</p>}
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [aiStatus, setAiStatus] = useState('checking');
  const [ld, setLd] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [s, h] = await Promise.allSettled([dashboardAPI.getStats(), healthAPI.check()]);
        if (s.status === 'fulfilled') setStats(s.value.data);
        if (h.status === 'fulfilled') {
          const st = h.value.data?.ai_service;
          setAiStatus(st === 'operational' || st === 'online' ? 'online' : 'offline');
        } else { setAiStatus('offline'); }
      } catch { }
      finally { setLd(false); }
    })();
  }, []);

  if (ld) return <div className="loader-full"><div className="spinner" /><span>Loading dashboard...</span></div>;

  return (
    <div className="fade">
      <div className="ph">
        <div>
          <h1>Admin Dashboard</h1>
          <p>System overview - {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div className="g-stats">
        <SC title="Total Students" value={stats?.students?.total || 0}
          sub={`${stats?.students?.face_registered || 0} faces registered`}
          icon={<FiUsers size={22} />} color="mustard" />
        <SC title="Total Teachers" value={stats?.teachers?.total || 0}
          icon={<FiAward size={22} />} color="blue" />
        <SC title="Total Sections" value={stats?.classes?.total || 0}
          icon={<FiBook size={22} />} color="green" />
        <SC title="Today Present" value={stats?.today?.present || 0}
          sub={`of ${stats?.today?.total_records || 0} records`}
          icon={<FiCheckCircle size={22} />} color="green" />
        <SC title="Faces Registered" value={stats?.students?.face_registered || 0}
          sub={`${stats?.students?.total ? Math.round((stats.students.face_registered / stats.students.total) * 100) : 0}% coverage`}
          icon={<FiCamera size={22} />} color="orange" />
        <SC title="AI Engine" value={aiStatus === 'online' ? 'Online' : 'Offline'}
          icon={<FiActivity size={22} />} color={aiStatus === 'online' ? 'green' : 'red'} />
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-h"><h3>Quick Actions</h3></div>
        <div className="card-b" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-p" onClick={() => nav('/admin/students')}><FiUsers size={16} /> Manage Students</button>
          <button className="btn btn-s" onClick={() => nav('/admin/teachers')}><FiAward size={16} /> Manage Teachers</button>
          <button className="btn btn-s" onClick={() => nav('/admin/sections')}><FiBook size={16} /> Manage Sections</button>
          <button className="btn btn-s" onClick={() => nav('/admin/register-face')}><FiCamera size={16} /> Register Faces</button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

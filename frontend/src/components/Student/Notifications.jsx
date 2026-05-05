import React, { useState, useEffect } from 'react';
import { attendanceAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { FiBell, FiAlertTriangle, FiCheckCircle, FiInfo } from 'react-icons/fi';

const Notifications = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [ld, setLd] = useState(true);

  useEffect(() => {
    attendanceAPI.getMyAttendance({})
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLd(false));
  }, []);

  if (ld) return <div className="loader-full"><div className="spinner" /><span>Loading...</span></div>;

  const stats = data?.class_stats || [];
  const critical = stats.filter(s => s.below_75);
  const warnings = stats.filter(s => !s.below_75 && s.percentage < 85);
  const good = stats.filter(s => s.percentage >= 85);

  const totalNotifications = critical.length + warnings.length;

  return (
    <div className="fade">
      <div className="ph">
        <div>
          <h1><FiBell style={{ marginRight: 10, color: 'var(--m500)' }} /> Notifications</h1>
          <p>Attendance alerts for {user?.full_name}</p>
        </div>
        {totalNotifications > 0 && (
          <span className="badge b-err" style={{ fontSize: 14, padding: '8px 16px' }}>
            {totalNotifications} alert(s)
          </span>
        )}
      </div>

      {/* No Alerts */}
      {totalNotifications === 0 && (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <FiCheckCircle size={48} color="var(--ok)" />
          <h3 style={{ color: 'var(--ok)', marginTop: 14 }}>All Good</h3>
          <p style={{ color: 'var(--g500)', fontSize: 14, marginTop: 8 }}>
            Your attendance is above 85% in all classes. Keep it up!
          </p>
        </div>
      )}

      {/* Critical - Below 75% */}
      {critical.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--err)' }}>
          <div className="card-h" style={{ background: 'var(--err-l)' }}>
            <h3 style={{ color: 'var(--err)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FiAlertTriangle size={18} /> Critical - Below 75%
            </h3>
            <span className="badge b-err">{critical.length} class(es)</span>
          </div>
          <div className="card-b">
            {critical.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 0',
                borderBottom: i < critical.length - 1 ? '1px solid var(--g100)' : 'none'
              }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--err)' }}>
                    {a.class_name} - {a.section}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--g500)' }}>
                    {a.subject} - {a.teacher_name}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--g400)', marginTop: 4 }}>
                    Present: {a.present}/{a.total} - Absent: {a.absent} - Late: {a.late}
                  </p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--err)' }}>
                    {a.percentage}%
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--err)', fontWeight: 600 }}>CRITICAL</p>
                </div>
              </div>
            ))}
            <div style={{
              marginTop: 12, padding: 12, background: 'rgba(244,67,54,0.05)',
              borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--err)'
            }}>
              You risk being debarred from exams if attendance stays below 75%.
              Please attend upcoming classes regularly.
            </div>
          </div>
        </div>
      )}

      {/* Warning - 75-85% */}
      {warnings.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--warn)' }}>
          <div className="card-h" style={{ background: 'var(--warn-l)' }}>
            <h3 style={{ color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FiInfo size={18} /> Warning - Below 85%
            </h3>
            <span className="badge b-warn">{warnings.length} class(es)</span>
          </div>
          <div className="card-b">
            {warnings.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 0',
                borderBottom: i < warnings.length - 1 ? '1px solid var(--g100)' : 'none'
              }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--warn)' }}>
                    {a.class_name} - {a.section}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--g500)' }}>
                    {a.subject} - {a.teacher_name}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--g400)', marginTop: 4 }}>
                    Present: {a.present}/{a.total} - Absent: {a.absent}
                  </p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--warn)' }}>
                    {a.percentage}%
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--warn)', fontWeight: 600 }}>WARNING</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Good - 85%+ */}
      {good.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--ok)' }}>
          <div className="card-h" style={{ background: 'var(--ok-l)' }}>
            <h3 style={{ color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FiCheckCircle size={18} /> Good Standing - 85%+
            </h3>
            <span className="badge b-ok">{good.length} class(es)</span>
          </div>
          <div className="card-b">
            {good.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: i < good.length - 1 ? '1px solid var(--g100)' : 'none'
              }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--g800)' }}>
                    {a.class_name} - {a.section}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--g500)' }}>
                    {a.subject} - Present: {a.present}/{a.total}
                  </p>
                </div>
                <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--ok)' }}>
                  {a.percentage}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Classes */}
      {stats.length === 0 && (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <FiBell size={48} color="var(--g300)" />
          <h3 style={{ color: 'var(--g500)', marginTop: 14 }}>No Classes Found</h3>
          <p style={{ color: 'var(--g400)', fontSize: 13 }}>
            You are not enrolled in any classes yet. Contact your admin.
          </p>
        </div>
      )}
    </div>
  );
};

export default Notifications;

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { attendanceAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { FiClipboard, FiAlertTriangle, FiCamera } from 'react-icons/fi';

const MyAttendance = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [ld, setLd] = useState(true);
  const [selectedClass, setSelectedClass] = useState('');

  const loadAttendance = useCallback(async () => {
    setLd(true);
    try {
      const r = await attendanceAPI.getMyAttendance(
        selectedClass ? { class_id: selectedClass } : {}
      );
      setData(r.data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load attendance');
    } finally { setLd(false); }
  }, [selectedClass]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  const statusColor = (s) => ({
    present: 'b-ok', absent: 'b-err', late: 'b-warn', pending_review: 'b-info'
  })[s] || 'b-m';

  if (ld) return <div className="loader-full"><div className="spinner" /><span>Loading attendance...</span></div>;

  const stats = data?.class_stats || [];
  const alerts = stats.filter(s => s.below_75);

  return (
    <div className="fade">
      <div className="ph">
        <div>
          <h1><FiClipboard style={{ marginRight: 10, color: 'var(--m500)' }} /> My Attendance</h1>
          <p>Welcome, {user?.full_name} ({user?.student_id})</p>
        </div>
        <button className="btn btn-p" onClick={() => nav('/student/scan-qr')}>
          <FiCamera size={16} /> Scan QR
        </button>
      </div>

      {/* Low Attendance Warning */}
      {alerts.length > 0 && (
        <div style={{
          background: 'var(--err-l)', border: '2px solid var(--err)',
          borderRadius: 'var(--r-md)', padding: 16, marginBottom: 24
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <FiAlertTriangle size={18} color="var(--err)" />
            <strong style={{ color: 'var(--err)', fontSize: 14 }}>Low Attendance Warning</strong>
          </div>
          {alerts.map((a, i) => (
            <p key={i} style={{ fontSize: 13, color: 'var(--err)', marginTop: 4 }}>
              <strong>{a.class_name} - {a.section} ({a.subject})</strong>: {a.percentage}%
              - below 75% minimum requirement
            </p>
          ))}
        </div>
      )}

      {/* Per-Class Stats */}
      <div className="g-stats" style={{ marginBottom: 24 }}>
        {stats.map((cs, i) => (
          <div className="card" key={i} style={{
            cursor: 'pointer',
            border: selectedClass === String(cs.class_section_id)
              ? '2px solid var(--m500)' : '2px solid transparent'
          }}
            onClick={() => setSelectedClass(
              selectedClass === String(cs.class_section_id) ? '' : String(cs.class_section_id)
            )}>
            <div className="card-b" style={{ padding: '16px 20px' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 8
              }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--g800)' }}>
                  {cs.class_name} - {cs.section}
                </h3>
                <span className={'badge ' + (cs.below_75 ? 'b-err' : 'b-ok')}>
                  {cs.percentage}%
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--g500)' }}>
                {cs.subject} - {cs.teacher_name}
              </p>
              <div style={{
                height: 6, background: 'var(--g200)', borderRadius: 3,
                marginTop: 10, overflow: 'hidden'
              }}>
                <div style={{
                  width: cs.percentage + '%', height: '100%', borderRadius: 3,
                  background: cs.percentage >= 75 ? 'var(--ok)'
                    : cs.percentage >= 50 ? 'var(--warn)' : 'var(--err)',
                  transition: 'width 0.5s ease'
                }} />
              </div>
              <div style={{
                display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--g500)'
              }}>
                <span>Total: {cs.total}</span>
                <span style={{ color: 'var(--ok)' }}>Present: {cs.present}</span>
                <span style={{ color: 'var(--err)' }}>Absent: {cs.absent}</span>
                <span style={{ color: 'var(--warn)' }}>Late: {cs.late}</span>
              </div>
            </div>
          </div>
        ))}

        {stats.length === 0 && (
          <div style={{
            gridColumn: '1/-1', textAlign: 'center',
            padding: 40, color: 'var(--g400)'
          }}>
            No attendance data yet. You may not be enrolled in any classes.
          </div>
        )}
      </div>

      {/* Records Table */}
      <div className="card">
        <div className="card-h">
          <h3>
            Attendance Records {selectedClass ? '(Filtered)' : '(All Classes)'}
          </h3>
          {selectedClass && (
            <button className="btn btn-g btn-sm" onClick={() => setSelectedClass('')}>
              Show All
            </button>
          )}
        </div>
        <div className="tw">
          <table className="dt">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Marked By</th>
              </tr>
            </thead>
            <tbody>
              {(data?.records || []).length === 0 ? (
                <tr>
                  <td colSpan={5} style={{
                    textAlign: 'center', padding: 40, color: 'var(--g400)'
                  }}>
                    No attendance records found
                  </td>
                </tr>
              ) : (data?.records || []).map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.date}</td>
                  <td>{r.class_name} - {r.section}</td>
                  <td>{r.subject}</td>
                  <td>
                    <span className={'badge ' + statusColor(r.status)}>
                      {(r.status || '').replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={'badge ' + (
                      r.marked_by === 'ai' ? 'b-m'
                        : r.marked_by === 'qr' ? 'b-info' : 'b-ok'
                    )}>
                      {r.marked_by || 'manual'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MyAttendance;

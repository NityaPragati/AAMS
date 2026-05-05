import React, { useState, useEffect } from 'react';
import { classAPI } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiBook, FiUsers, FiCamera, FiClock } from 'react-icons/fi';

const MySections = () => {
  const [sections, setSections] = useState([]);
  const [ld, setLd] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [students, setStudents] = useState({});
  const nav = useNavigate();

  useEffect(() => {
    classAPI.getByTeacher()
      .then(r => setSections(r.data.classes || []))
      .catch(() => toast.error('Failed to load your sections'))
      .finally(() => setLd(false));
  }, []);

  const toggleStudents = async (secId) => {
    if (expandedId === secId) { setExpandedId(null); return; }
    setExpandedId(secId);
    if (!students[secId]) {
      try {
        const r = await classAPI.getStudents(secId);
        setStudents(prev => ({ ...prev, [secId]: r.data.students || [] }));
      } catch { toast.error('Failed to load students'); }
    }
  };

  if (ld) return <div className="loader-full"><div className="spinner" /><span>Loading sections...</span></div>;

  return (
    <div className="fade">
      <div className="ph">
        <div>
          <h1><FiBook style={{ marginRight: 10, color: 'var(--m500)' }} /> My Sections</h1>
          <p>Sections assigned to you - {sections.length} total</p>
        </div>
        <button className="btn btn-p" onClick={() => nav('/teacher/take-attendance')}>
          <FiCamera size={16} /> Take Attendance
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <FiBook size={48} color="var(--g300)" />
          <h3 style={{ color: 'var(--g500)', marginTop: 14 }}>No Sections Assigned</h3>
          <p style={{ color: 'var(--g400)', fontSize: 13 }}>Contact admin to assign sections to you</p>
        </div>
      ) : (
        <div className="g-cards">
          {sections.map(sec => (
            <div className="card" key={sec.id}>
              <div className="card-b">
                <div className="cls-top">
                  <h3>{sec.class_name} - {sec.section}</h3>
                  <span className="badge b-m">{sec.subject}</span>
                </div>
                <div className="cls-info">
                  <p>{sec.department || 'General'} - Semester {sec.semester || '-'}</p>
                  <p>Room: {sec.room || 'TBD'}</p>
                  {sec.schedule_day && (
                    <p>
                      <FiClock size={12} style={{ marginRight: 4 }} />
                      {sec.schedule_day} {sec.schedule_time_start}-{sec.schedule_time_end}
                    </p>
                  )}
                </div>
                <div className="cls-foot">
                  <span className="badge b-info">{sec.student_count || 0} students</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-s btn-sm" onClick={() => toggleStudents(sec.id)}>
                      <FiUsers size={14} /> {expandedId === sec.id ? 'Hide' : 'Students'}
                    </button>
                    <button className="btn btn-p btn-sm"
                      onClick={() => nav('/teacher/take-attendance', { state: { classId: sec.id } })}>
                      <FiCamera size={14} /> Attend
                    </button>
                  </div>
                </div>

                {expandedId === sec.id && (
                  <div style={{
                    marginTop: 16, paddingTop: 16,
                    borderTop: '1px solid var(--g200)', maxHeight: 300, overflowY: 'auto'
                  }}>
                    {!students[sec.id] ? (
                      <div style={{ textAlign: 'center', padding: 20 }}>
                        <div className="spinner" style={{ margin: '0 auto', width: 24, height: 24 }} />
                      </div>
                    ) : students[sec.id].length === 0 ? (
                      <p style={{ textAlign: 'center', color: 'var(--g400)', fontSize: 13, padding: 16 }}>
                        No students enrolled
                      </p>
                    ) : (
                      students[sec.id].map(s => (
                        <div key={s.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 0', borderBottom: '1px solid var(--g100)'
                        }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600 }}>{s.full_name}</p>
                            <p style={{ fontSize: 11, color: 'var(--g400)' }}>
                              {s.student_id} - {s.department || 'N/A'}
                            </p>
                          </div>
                          <span className={'badge ' + (s.face_registered ? 'b-ok' : 'b-warn')}
                            style={{ fontSize: 10 }}>
                            {s.face_registered ? 'Face ready' : 'No face'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MySections;

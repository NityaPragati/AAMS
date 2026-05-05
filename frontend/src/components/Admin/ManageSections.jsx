import React, { useState, useEffect } from 'react';
import { classAPI, teacherAPI, enrollmentAPI, studentAPI } from '../../services/api';
import { toast } from 'react-toastify';
import Modal from '../Common/Modal';
import { FiBook, FiPlus, FiTrash2, FiUsers, FiUserPlus } from 'react-icons/fi';

const ManageSections = () => {
  const [sections, setSections] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [ld, setLd] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showStudents, setShowStudents] = useState(false);
  const [enrollCid, setEnrollCid] = useState(null);
  const [sectionStudents, setSectionStudents] = useState([]);
  const [viewSection, setViewSection] = useState(null);
  const [selStudents, setSelStudents] = useState([]);
  const [form, setForm] = useState({
    class_name: '', section: '', subject: '', teacher_id: '',
    department: '', semester: '', schedule_day: '', schedule_time_start: '',
    schedule_time_end: '', room: ''
  });

  const load = async () => {
    setLd(true);
    try {
      const [c, t, s] = await Promise.all([classAPI.getAll(), teacherAPI.getAll(), studentAPI.getAll()]);
      setSections(c.data.classes || []);
      setTeachers(t.data.teachers || []);
      setAllStudents(s.data.students || []);
    } catch { toast.error('Failed to load data'); }
    finally { setLd(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.class_name || !form.section || !form.subject || !form.teacher_id) {
      toast.error('Fill all required fields'); return;
    }
    try {
      await classAPI.create({
        ...form,
        teacher_id: parseInt(form.teacher_id),
        semester: form.semester ? parseInt(form.semester) : null
      });
      toast.success('Section created!');
      setShowCreate(false);
      setForm({ class_name: '', section: '', subject: '', teacher_id: '', department: '', semester: '', schedule_day: '', schedule_time_start: '', schedule_time_end: '', room: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this section?')) return;
    try { await classAPI.delete(id); toast.success('Deleted'); load(); }
    catch { toast.error('Delete failed'); }
  };

  const openEnroll = (cid) => { setEnrollCid(cid); setSelStudents([]); setShowEnroll(true); };

  const handleEnroll = async () => {
    if (selStudents.length === 0) { toast.error('Select students'); return; }
    try {
      const r = await enrollmentAPI.enroll(selStudents.map(Number), enrollCid);
      toast.success(`Enrolled ${r.data.enrolled} students`);
      if (r.data.skipped > 0) toast.info(`${r.data.skipped} already enrolled`);
      setShowEnroll(false);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Enrollment failed'); }
  };

  const viewStudentsOf = async (sec) => {
    setViewSection(sec);
    try {
      const r = await classAPI.getStudents(sec.id);
      setSectionStudents(r.data.students || []);
      setShowStudents(true);
    } catch { toast.error('Failed to load students'); }
  };

  const unenroll = async (sid) => {
    if (!window.confirm('Remove this student from section?')) return;
    try {
      await enrollmentAPI.unenroll(sid, viewSection.id);
      toast.success('Removed');
      viewStudentsOf(viewSection);
      load();
    } catch { toast.error('Failed'); }
  };

  const toggleStudent = (id) => {
    setSelStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fade">
      <div className="ph">
        <div><h1><FiBook style={{ marginRight: 10, color: 'var(--m500)' }} /> Manage Sections</h1>
          <p>{sections.length} sections - Assign students and teachers</p></div>
        <button className="btn btn-p" onClick={() => setShowCreate(true)}><FiPlus size={16} /> Create Section</button>
      </div>

      <div className="g-cards">
        {sections.map(c => (
          <div className="card" key={c.id}>
            <div className="card-b">
              <div className="cls-top">
                <h3>{c.class_name} - {c.section}</h3>
                <span className="badge b-m">{c.subject}</span>
              </div>
              <div className="cls-info">
                <p>Teacher: <strong>{c.teacher_name}</strong></p>
                <p>{c.department || 'General'} - Sem {c.semester || '-'}</p>
                <p>Room: {c.room || 'TBD'}</p>
                {c.schedule_day && <p>{c.schedule_day} {c.schedule_time_start}-{c.schedule_time_end}</p>}
              </div>
              <div className="cls-foot">
                <span className="badge b-info">{c.student_count || 0} students</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-s btn-sm" onClick={() => viewStudentsOf(c)}>
                    <FiUsers size={14} /> View
                  </button>
                  <button className="btn btn-s btn-sm" onClick={() => openEnroll(c.id)}>
                    <FiUserPlus size={14} /> Enroll
                  </button>
                  <button className="btn btn-g btn-sm" style={{ color: 'var(--err)' }} onClick={() => handleDelete(c.id)}>
                    <FiTrash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {sections.length === 0 && !ld && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--g400)' }}>
            No sections yet. Create one to get started.
          </div>
        )}
      </div>

      {/* Create Section Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Section" width="600px">
        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="fg"><label className="fl">Class Name *</label>
              <input className="fi" placeholder="CS101" value={form.class_name} onChange={e => set('class_name', e.target.value)} /></div>
            <div className="fg"><label className="fl">Section *</label>
              <input className="fi" placeholder="A" value={form.section} onChange={e => set('section', e.target.value)} /></div>
          </div>
          <div className="fg"><label className="fl">Subject *</label>
            <input className="fi" placeholder="Data Structures" value={form.subject} onChange={e => set('subject', e.target.value)} /></div>
          <div className="fg"><label className="fl">Assign Teacher *</label>
            <select className="fs" value={form.teacher_id} onChange={e => set('teacher_id', e.target.value)}>
              <option value="">-- Select Teacher --</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name} ({t.teacher_id})</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="fg"><label className="fl">Department</label>
              <input className="fi" value={form.department} onChange={e => set('department', e.target.value)} /></div>
            <div className="fg"><label className="fl">Semester</label>
              <input className="fi" type="number" value={form.semester} onChange={e => set('semester', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div className="fg"><label className="fl">Day</label>
              <select className="fs" value={form.schedule_day} onChange={e => set('schedule_day', e.target.value)}>
                <option value="">Select</option>
                {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d =>
                  <option key={d} value={d}>{d}</option>)}
              </select></div>
            <div className="fg"><label className="fl">Start Time</label>
              <input className="fi" type="time" value={form.schedule_time_start} onChange={e => set('schedule_time_start', e.target.value)} /></div>
            <div className="fg"><label className="fl">End Time</label>
              <input className="fi" type="time" value={form.schedule_time_end} onChange={e => set('schedule_time_end', e.target.value)} /></div>
          </div>
          <div className="fg"><label className="fl">Room</label>
            <input className="fi" placeholder="Room 101" value={form.room} onChange={e => set('room', e.target.value)} /></div>
          <button type="submit" className="btn btn-p btn-lg" style={{ width: '100%' }}>Create Section</button>
        </form>
      </Modal>

      {/* Enroll Students Modal */}
      <Modal open={showEnroll} onClose={() => setShowEnroll(false)} title="Enroll Students" width="500px">
        <p style={{ fontSize: 13, color: 'var(--g500)', marginBottom: 16 }}>Select students to enroll:</p>
        <div style={{ maxHeight: 350, overflowY: 'auto', border: '1px solid var(--g200)', borderRadius: 'var(--r-sm)' }}>
          {allStudents.map(s => (
            <label key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
              borderBottom: '1px solid var(--g100)', cursor: 'pointer',
              background: selStudents.includes(s.id) ? 'var(--m50)' : 'transparent'
            }}>
              <input type="checkbox" checked={selStudents.includes(s.id)}
                onChange={() => toggleStudent(s.id)}
                style={{ accentColor: '#D4A017', width: 18, height: 18 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{s.full_name}</p>
                <p style={{ fontSize: 11, color: 'var(--g400)' }}>{s.student_id} - {s.department || 'N/A'}</p>
              </div>
            </label>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--m600)', fontWeight: 600, marginTop: 12 }}>{selStudents.length} selected</p>
        <button className="btn btn-p btn-lg" style={{ width: '100%', marginTop: 12 }} onClick={handleEnroll}>
          Enroll Selected Students
        </button>
      </Modal>

      {/* View Section Students Modal */}
      <Modal open={showStudents} onClose={() => setShowStudents(false)}
        title={viewSection ? `Students in ${viewSection.class_name} - ${viewSection.section}` : 'Students'}
        width="500px">
        {sectionStudents.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--g400)', padding: 30 }}>No students enrolled yet</p>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {sectionStudents.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', borderBottom: '1px solid var(--g100)'
              }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{s.full_name}</p>
                  <p style={{ fontSize: 12, color: 'var(--g400)' }}>{s.student_id} - {s.department || 'N/A'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={'badge ' + (s.face_registered ? 'b-ok' : 'b-warn')}>
                    {s.face_registered ? 'Face ready' : 'No face'}
                  </span>
                  <button className="btn btn-g btn-sm" style={{ color: 'var(--err)' }} onClick={() => unenroll(s.id)}>
                    <FiTrash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ManageSections;

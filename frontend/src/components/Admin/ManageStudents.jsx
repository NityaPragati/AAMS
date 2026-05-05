import React, { useState, useEffect } from 'react';
import { studentAPI } from '../../services/api';
import { toast } from 'react-toastify';
import Modal from '../Common/Modal';
import { FiUsers, FiPlus, FiEdit2, FiTrash2, FiSearch } from 'react-icons/fi';

const empty = { full_name: '', student_id: '', email: '', password: '', department: '', semester: '' };

const ManageStudents = () => {
  const [students, setStudents] = useState([]);
  const [ld, setLd] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...empty });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLd(true);
    try {
      const r = await studentAPI.getAll();
      setStudents(r.data.students || []);
    } catch { toast.error('Failed to load students'); }
    finally { setLd(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ ...empty }); setModal(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      full_name: s.full_name || '', student_id: s.student_id || '',
      email: s.email || '', password: '', department: s.department || '',
      semester: s.semester || ''
    });
    setModal(true);
  };

  const save = async () => {
    if (!form.full_name || !form.student_id || !form.email) {
      toast.error('Name, Student ID, and Email are required'); return;
    }
    if (!editing && !form.password) { toast.error('Password required for new student'); return; }
    setBusy(true);
    try {
      const payload = { ...form, semester: form.semester ? parseInt(form.semester) : null };
      if (editing && !payload.password) delete payload.password;
      if (editing) {
        await studentAPI.update(editing.id, payload);
        toast.success('Student updated');
      } else {
        await studentAPI.create(payload);
        toast.success('Student created');
      }
      setModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Save failed');
    } finally { setBusy(false); }
  };

  const del = async (s) => {
    if (!window.confirm(`Delete ${s.full_name}? This cannot be undone.`)) return;
    try { await studentAPI.delete(s.id); toast.success('Deleted'); load(); }
    catch { toast.error('Delete failed'); }
  };

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const filtered = students.filter(s =>
    (s.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.student_id || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.department || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fade">
      <div className="ph">
        <div><h1><FiUsers style={{ marginRight: 10, color: 'var(--m500)' }} /> Manage Students</h1>
          <p>{students.length} students registered</p></div>
        <button className="btn btn-p" onClick={openAdd}><FiPlus size={16} /> Add Student</button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-b" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <FiSearch color="var(--g400)" />
          <input type="text" className="fi" placeholder="Search by name, ID, department..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', boxShadow: 'none', padding: '8px 0' }} />
        </div>
      </div>

      <div className="card">
        {ld ? (
          <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <div className="tw">
            <table className="dt">
              <thead><tr><th>Name</th><th>Student ID</th><th>Email</th><th>Department</th><th>Semester</th><th>Face</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--g400)' }}>No students found</td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                    <td><span className="badge b-m">{s.student_id}</span></td>
                    <td>{s.email}</td>
                    <td>{s.department || '-'}</td>
                    <td>{s.semester || '-'}</td>
                    <td>
                      <span className={'badge ' + (s.face_registered ? 'b-ok' : 'b-warn')}>
                        {s.face_registered ? 'Registered' : 'Missing'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-g btn-sm" onClick={() => openEdit(s)}><FiEdit2 size={14} /></button>
                        <button className="btn btn-g btn-sm" style={{ color: 'var(--err)' }} onClick={() => del(s)}><FiTrash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Student' : 'Add Student'} width="520px">
        <div className="fg"><label className="fl">Full Name *</label>
          <input className="fi" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="John Doe" /></div>
        <div className="fg"><label className="fl">Student ID *</label>
          <input className="fi" value={form.student_id} onChange={e => set('student_id', e.target.value)} placeholder="STU001" /></div>
        <div className="fg"><label className="fl">Email *</label>
          <input className="fi" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="student@college.edu" /></div>
        <div className="fg"><label className="fl">Password {editing ? '(leave blank to keep)' : '*'}</label>
          <input className="fi" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 6 characters" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="fg"><label className="fl">Department</label>
            <input className="fi" value={form.department} onChange={e => set('department', e.target.value)} placeholder="Computer Science" /></div>
          <div className="fg"><label className="fl">Semester</label>
            <input className="fi" type="number" value={form.semester} onChange={e => set('semester', e.target.value)} placeholder="1-8" /></div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <button className="btn btn-p" style={{ flex: 1 }} onClick={save} disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Update Student' : 'Create Student'}
          </button>
          <button className="btn btn-s" onClick={() => setModal(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
};

export default ManageStudents;

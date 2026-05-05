import React, { useState, useEffect } from 'react';
import { teacherAPI } from '../../services/api';
import { toast } from 'react-toastify';
import Modal from '../Common/Modal';
import { FiAward, FiPlus, FiTrash2 } from 'react-icons/fi';

const ManageTeachers = () => {
  const [teachers, setTeachers] = useState([]);
  const [ld, setLd] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', teacher_id: '', department: '', designation: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLd(true);
    try { const r = await teacherAPI.getAll(); setTeachers(r.data.teachers || []); }
    catch { toast.error('Failed to load teachers'); }
    finally { setLd(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.password || !form.teacher_id) {
      toast.error('Fill all required fields'); return;
    }
    setBusy(true);
    try {
      await teacherAPI.create(form);
      toast.success('Teacher added!');
      setModal(false);
      setForm({ full_name: '', email: '', password: '', teacher_id: '', department: '', designation: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const del = async (t) => {
    if (!window.confirm(`Delete teacher ${t.full_name}?`)) return;
    try { await teacherAPI.delete(t.id); toast.success('Deleted'); load(); }
    catch { toast.error('Delete failed'); }
  };

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fade">
      <div className="ph">
        <div><h1><FiAward style={{ marginRight: 10, color: 'var(--m500)' }} /> Manage Teachers</h1>
          <p>{teachers.length} teachers</p></div>
        <button className="btn btn-p" onClick={() => setModal(true)}><FiPlus size={16} /> Add Teacher</button>
      </div>

      <div className="card">
        {ld ? (
          <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <div className="tw">
            <table className="dt">
              <thead><tr><th>Name</th><th>Teacher ID</th><th>Email</th><th>Department</th><th>Designation</th><th>Actions</th></tr></thead>
              <tbody>
                {teachers.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--g400)' }}>No teachers yet</td></tr>
                ) : teachers.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.full_name}</td>
                    <td><span className="badge b-m">{t.teacher_id}</span></td>
                    <td>{t.email}</td>
                    <td>{t.department || '-'}</td>
                    <td>{t.designation || '-'}</td>
                    <td>
                      <button className="btn btn-g btn-sm" style={{ color: 'var(--err)' }} onClick={() => del(t)}>
                        <FiTrash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Teacher" width="520px">
        <form onSubmit={save}>
          <div className="fg"><label className="fl">Full Name *</label>
            <input className="fi" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Dr. Smith" /></div>
          <div className="fg"><label className="fl">Teacher ID *</label>
            <input className="fi" value={form.teacher_id} onChange={e => set('teacher_id', e.target.value)} placeholder="TCH001" /></div>
          <div className="fg"><label className="fl">Email *</label>
            <input className="fi" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="teacher@college.edu" /></div>
          <div className="fg"><label className="fl">Password *</label>
            <input className="fi" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 6 characters" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="fg"><label className="fl">Department</label>
              <input className="fi" value={form.department} onChange={e => set('department', e.target.value)} placeholder="Computer Science" /></div>
            <div className="fg"><label className="fl">Designation</label>
              <input className="fi" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="Professor" /></div>
          </div>
          <button type="submit" className="btn btn-p btn-lg" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Adding...' : 'Add Teacher'}
          </button>
        </form>
      </Modal>
    </div>
  );
};

export default ManageTeachers;

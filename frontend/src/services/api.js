import axios from 'axios';
const BASE = process.env.REACT_APP_API_URL;
const api = axios.create({ baseURL: `${BASE}/api`, headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

api.interceptors.request.use(c => {
  const t = localStorage.getItem('access_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

api.interceptors.response.use(r => r, e => {
  if (e.response?.status === 401) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
  return Promise.reject(e);
});

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  getMe: () => api.get('/auth/me'),
};

export const studentAPI = {
  getAll: (p) => api.get('/students', { params: p }),
  getById: (id) => api.get(`/students/${id}`),
  create: (d) => api.post('/students', d),
  update: (id, d) => api.put(`/students/${id}`, d),
  delete: (id) => api.delete(`/students/${id}`),
};

export const teacherAPI = {
  getAll: () => api.get('/teachers'),
  create: (d) => api.post('/teachers', d),
  delete: (id) => api.delete(`/teachers/${id}`),
};

export const classAPI = {
  getAll: (p) => api.get('/classes', { params: p }),
  getByTeacher: () => api.get('/classes/my-classes'),
  create: (d) => api.post('/classes', d),
  update: (id, d) => api.put(`/classes/${id}`, d),
  delete: (id) => api.delete(`/classes/${id}`),
  getStudents: (id) => api.get(`/classes/${id}/students`),
};

export const enrollmentAPI = {
  enroll: (ids, cid) => api.post('/enrollment', { student_ids: ids, class_section_id: cid }),
  unenroll: (sid, cid) => api.delete('/enrollment', { data: { student_id: sid, class_section_id: cid } }),
};

export const faceAPI = {
  register: (student_id, img64) => api.post('/face/register', { student_id, image: img64 }),
  registerVideo: (student_id, frames, min_samples = 3) => (
    api.post('/face/register-video', { student_id, frames, min_samples })
  ),
  verify: (img64, class_section_id) => api.post('/face/verify', { image: img64, class_section_id }),
  verifyVideo: (frames, class_section_id) => api.post('/face/verify-video', { frames, class_section_id }),
  getStatus: () => api.get('/face/status'),
};

export const attendanceAPI = {
  markManual: (d) => api.post('/attendance/mark', d),
  markBulk: (d) => api.post('/attendance/mark-bulk', d),
  createQrSession: (d) => api.post('/attendance/qr/session', d),
  getQrSessionStatus: (sessionId) => api.get(`/attendance/qr/session/${sessionId}`),
  scanQr: (d) => api.post('/attendance/qr/scan', d),
  getByClass: (cid, date) => api.get(`/attendance/class/${cid}`, { params: { date } }),
  getByStudent: (sid, p) => api.get(`/attendance/student/${sid}`, { params: p }),
  getMyAttendance: (p) => api.get('/attendance/my', { params: p }),
  getMyClasses: () => api.get('/attendance/my-classes'),
  update: (id, d) => api.put(`/attendance/${id}`, d),
  getReport: (cid, s, e) => api.get(`/attendance/report/${cid}`, { params: { start_date: s, end_date: e } }),
};

export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
};

export const healthAPI = { check: () => axios.get(`${BASE}/health`) };

export const cleanBase64 = (url) => url?.startsWith('data:') ? url.split(',')[1] : (url || '');

export default api;

import axios from 'axios';
import { API_BASE_URL } from './config';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
}

export async function scanAttendance(accessToken, payload) {
  const { data } = await api.post(
    '/attendance/qr/scan',
    { payload },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data;
}

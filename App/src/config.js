import { Platform } from 'react-native';

const fallbackBaseUrl = Platform.select({
  android: 'http://10.201.212.245:8000',
  ios: 'http://localhost:8000',
  default: 'http://localhost:8000',
});

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || fallbackBaseUrl).replace(/\/$/, '');
export const STORAGE_KEY = 'aams.attendance.session';
export const APP_NAME = 'AAMS Attendance';

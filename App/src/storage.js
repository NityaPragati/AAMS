import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY } from './config';

export async function loadSession() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveSession(session) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export async function clearSession() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

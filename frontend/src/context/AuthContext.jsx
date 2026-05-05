import React, { createContext, useState, useEffect, useContext } from 'react';
import { authAPI } from '../services/api';

const Ctx = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('access_token');
    const u = localStorage.getItem('user');
    if (t && u) {
      try { setUser(JSON.parse(u)); setIsAuthenticated(true); }
      catch { doLogout(); }
    }
    setLoading(false);
  }, []);

  const login = async (email, pw) => {
    try {
      const r = await authAPI.login(email, pw);
      const { access_token, user: u } = r.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('user', JSON.stringify(u));
      setUser(u);
      setIsAuthenticated(true);
      return { success: true, role: u.role };
    } catch (e) {
      return { success: false, message: e.response?.data?.error || 'Login failed' };
    }
  };

  const doLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <Ctx.Provider value={{ user, loading, isAuthenticated, login, logout: doLogout }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('No AuthProvider');
  return c;
};
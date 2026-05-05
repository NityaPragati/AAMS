import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { healthAPI } from '../../services/api';
import { FiMenu, FiLogOut, FiActivity } from 'react-icons/fi';

const Navbar = ({ toggle, collapsed }) => {
  const { user, logout } = useAuth();
  const [ai, setAi] = useState('chk');

  useEffect(() => {
    ck();
    const iv = setInterval(ck, 30000);
    return () => clearInterval(iv);
  }, []);

  const ck = async () => {
    try {
      const r = await healthAPI.check();
      const s = r.data?.ai_service;
      setAi(s === 'operational' || s === 'online' ? 'on' : 'off');
    } catch { setAi('off'); }
  };

  return (
    <nav className={`nb ${collapsed ? 'nb-col' : ''}`}>
      <div className="nb-left">
        <button className="nb-btn" onClick={toggle}><FiMenu size={20} /></button>
      </div>
      <div className="nb-right">
        <div className={`ai-pill ${ai}`}>
          <FiActivity size={14} />
          <span>AI: {ai === 'on' ? 'Online' : ai === 'off' ? 'Offline' : '...'}</span>
        </div>
        <div className="nb-user">
          <div className="nb-av">{user?.full_name?.charAt(0) || 'U'}</div>
          <span className="nb-nm">{user?.full_name}</span>
          <span className="nb-rl">{user?.role}</span>
        </div>
        <button className="btn btn-g btn-ic" onClick={logout} title="Logout">
          <FiLogOut size={18} />
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
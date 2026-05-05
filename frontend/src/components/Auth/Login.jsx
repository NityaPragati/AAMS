import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { FiShield, FiMail, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';

const Login = () => {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const go = async (e) => {
    e.preventDefault();
    if (!email || !pw) { toast.error('Fill all fields'); return; }
    setBusy(true);
    const r = await login(email, pw);
    setBusy(false);
    if (r.success) {
      toast.success('Welcome!');
      // Redirect based on role
      if (r.role === 'admin') nav('/admin/dashboard');
      else if (r.role === 'teacher') nav('/teacher/sections');
      else if (r.role === 'student') nav('/student/attendance');
      else nav('/');
    } else {
      toast.error(r.message);
    }
  };

  return (
    <div className="auth">
      <div className="auth-l">
        <div style={{ textAlign: 'center' }}>
          <div className="auth-logo"><FiShield size={32} /></div>
          <h1>Face Attendance</h1>
          <p>AI-Powered Recognition System</p>
        </div>
        <div className="auth-feat">
          <div>Live recognition</div>
          <div>Roster attendance</div>
          <div>Manual review</div>
          <div>Role-based access</div>
        </div>
      </div>
      <div className="auth-r">
        <div className="auth-box">
          <h2>Welcome Back</h2>
          <p>Sign in with your credentials</p>
          <form onSubmit={go}>
            <div className="fg">
              <label className="fl">Email</label>
              <div className="iw">
                <FiMail className="iw-ic" />
                <input type="email" className="fi" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="fg">
              <label className="fl">Password</label>
              <div className="iw">
                <FiLock className="iw-ic" />
                <input type={show ? 'text' : 'password'} className="fi" placeholder="Enter password"
                  value={pw} onChange={e => setPw(e.target.value)} />
                <button type="button" className="iw-tog" onClick={() => setShow(!show)}>
                  {show ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-p btn-lg" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;

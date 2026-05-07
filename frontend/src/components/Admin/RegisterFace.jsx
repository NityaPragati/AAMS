import React, { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import { faceAPI, studentAPI, cleanBase64 } from '../../services/api';
import { toast } from 'react-toastify';
import {
  FiUserPlus,
  FiCamera,
  FiCheck,
  FiX,
  FiRefreshCw,
  FiVideo,
  FiZap,
  FiUsers
} from 'react-icons/fi';

const TARGET_SAMPLES = 7;
const MIN_SAMPLES = 4;
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const RegisterFace = () => {
  const [students, setStudents] = useState([]);
  const [sid, setSid] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [captured, setCaptured] = useState(0);
  const [result, setResult] = useState(null);
  const webcamRef = useRef(null);

  const loadStudents = () => {
    studentAPI.getAll()
      .then(r => setStudents(r.data.students || []))
      .catch(() => toast.error('Failed to load students'));
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const startEnrollment = async () => {
    if (!sid) {
      toast.error('Select a student');
      return;
    }
    if (busy) return;

    setBusy(true);
    setResult(null);
    setCaptured(0);
    setPhase('warming');
    setCamOn(true);

    try {
      await wait(900);
      const frames = [];
      setPhase('capturing');

      for (let i = 0; i < TARGET_SAMPLES; i += 1) {
        const shot = webcamRef.current ? webcamRef.current.getScreenshot() : null;
        if (shot) {
          frames.push(cleanBase64(shot));
          setCaptured(frames.length);
        }
        await wait(520);
      }

      if (frames.length < MIN_SAMPLES) {
        throw new Error('Camera did not provide enough usable samples');
      }

      setPhase('analyzing');
      const r = await faceAPI.registerVideo(parseInt(sid), frames, MIN_SAMPLES);
      setResult({ ok: true, data: r.data });
      toast.success('Face profile trained for ' + r.data.student_name);
      loadStudents();
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Video enrollment failed';
      setResult({ ok: false, msg });
      toast.error(msg);
    } finally {
      setBusy(false);
      setPhase('idle');
    }
  };

  const resetAll = () => {
    setSid('');
    setResult(null);
    setCaptured(0);
    setPhase('idle');
  };

  const sel = students.find(s => String(s.id) === sid);
  const registeredCount = students.filter(s => s.face_registered).length;
  const missingCount = Math.max(students.length - registeredCount, 0);
  const progress = Math.min(100, Math.round((captured / TARGET_SAMPLES) * 100));
  const profileLabel = progress >= 100 ? 'Profile ready' : busy ? 'Building profile' : 'Ready to train';

  return (
    <div className="fade">
      <div className="ph">
        <div>
          <h1><FiUserPlus style={{ marginRight: 10, color: 'var(--m500)' }} /> Register Faces</h1>
          <p>Build student recognition profiles from live video. Ask the student to blink during capture.</p>
        </div>
      </div>

      <div className="g-2col">
        <div className="card live-card">
          <div className="card-h">
            <h3><FiVideo size={17} /> Live Enrollment</h3>
            <span className={'badge ' + (busy ? 'b-warn' : camOn ? 'b-ok' : 'b-info')}>
              {busy ? 'Training' : camOn ? 'Camera ready' : 'Standby'}
            </span>
          </div>
          <div className="card-b">
            {!camOn ? (
              <div className="cam-off">
                <div className="cam-off-ic"><FiCamera size={44} /></div>
                <h3>Camera Off</h3>
                      <p>Use live video to build the face profile with active liveness checks. A blink is required.</p>
                <button className="btn btn-p btn-lg" onClick={() => setCamOn(true)}>
                  <FiCamera size={18} /> Start Camera
                </button>
              </div>
            ) : (
              <div>
                <div className="scanner-shell">
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    screenshotQuality={0.78}
                    videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
                    style={{ width: '100%', display: 'block' }}
                  />
                  <div className="face-corners searching">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="cam-live">
                    <div className="cam-live-dot" />
                    <span>{busy ? 'ENROLLING' : 'LIVE'}</span>
                  </div>
                  {busy && (
                    <div className="scan-status-panel">
                      <strong>
                        {phase === 'warming' && 'Preparing camera'}
                        {phase === 'capturing' && 'Building face profile'}
                        {phase === 'analyzing' && 'Training face profile'}
                      </strong>
                      <span>{profileLabel}</span>
                    </div>
                  )}
                </div>

                <div className="sample-progress">
                  <div>
                    <span>Profile strength</span>
                    <strong>{progress}%</strong>
                  </div>
                  <div className="sample-bar"><div style={{ width: progress + '%' }} /></div>
                </div>

                <div className="cam-ctrl">
                  <button className="btn btn-p btn-lg" onClick={startEnrollment} disabled={busy || !sid}>
                    <FiZap size={18} /> {busy ? 'Training...' : 'Auto Enroll'}
                  </button>
                  <button
                    className="btn btn-g btn-sm"
                    onClick={() => setCamOn(false)}
                    disabled={busy}
                    style={{ color: 'var(--err)' }}
                  >
                    Stop
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3><FiUsers size={17} /> Student Roster</h3>
          </div>
          <div className="card-b">
            <div className="scan-metrics scan-metrics-two" style={{ marginTop: 0, marginBottom: 18 }}>
              <div><span>Registered</span><strong>{registeredCount}</strong></div>
              <div><span>Missing</span><strong>{missingCount}</strong></div>
            </div>

            <div className="fg">
              <label className="fl">Select Student</label>
              <select
                className="fs"
                value={sid}
                onChange={e => {
                  setSid(e.target.value);
                  setResult(null);
                  setCaptured(0);
                }}
              >
                <option value="">Choose Student</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.student_id}) {s.face_registered ? '- registered' : ''}
                  </option>
                ))}
              </select>
            </div>

            {sel && (
              <div className="sel-info">
                <div className="sel-row"><span>Name:</span><strong>{sel.full_name}</strong></div>
                <div className="sel-row"><span>Student ID:</span><strong>{sel.student_id}</strong></div>
                <div className="sel-row"><span>Department:</span><strong>{sel.department || 'N/A'}</strong></div>
                <div className="sel-row"><span>Semester:</span><strong>{sel.semester || 'N/A'}</strong></div>
                <div className="sel-row">
                  <span>Face Status:</span>
                  <span className={'badge ' + (sel.face_registered ? 'b-ok' : 'b-warn')}>
                    {sel.face_registered ? 'Registered' : 'Not registered'}
                  </span>
                </div>
              </div>
            )}

            <div className="chk-list">
              <div className={'chk-item ' + (sid ? 'ok' : '')}>
                {sid ? <FiCheck size={14} /> : <FiX size={14} />} Student selected
              </div>
              <div className={'chk-item ' + (camOn ? 'ok' : '')}>
                {camOn ? <FiCheck size={14} /> : <FiX size={14} />} Live camera
              </div>
              <div className={'chk-item ' + (captured >= MIN_SAMPLES ? 'ok' : '')}>
                {captured >= MIN_SAMPLES ? <FiCheck size={14} /> : <FiX size={14} />} Profile ready
              </div>
            </div>

            {result && (
              <div className={'res-ban ' + (result.ok ? 'rok' : 'rerr')}>
                {result.ok ? <FiCheck size={18} /> : <FiX size={18} />}
                <div>
                  <p style={{ fontWeight: 700 }}>
                    {result.ok ? 'Enrollment Complete' : 'Enrollment Failed'}
                  </p>
                  {result.ok && (
                    <p style={{ fontSize: 12, marginTop: 2 }}>
                      {result.data.student_name} profile is ready
                    </p>
                  )}
                  {!result.ok && <p style={{ fontSize: 12, marginTop: 2 }}>{result.msg}</p>}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button
                className="btn btn-p btn-lg"
                style={{ flex: 1 }}
                onClick={startEnrollment}
                disabled={busy || !sid}
              >
                <FiRefreshCw size={17} /> {busy ? 'Training...' : 'Train From Video'}
              </button>
              <button className="btn btn-s btn-lg" onClick={resetAll} disabled={busy}>Reset</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterFace;

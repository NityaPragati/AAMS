import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Webcam from 'react-webcam';
import { classAPI, faceAPI, attendanceAPI, cleanBase64 } from '../../services/api';
import { toast } from 'react-toastify';
import {
  FiCamera,
  FiCheckCircle,
  FiXCircle,
  FiCheck,
  FiPause,
  FiPlay,
  FiSquare,
  FiUserCheck,
  FiUsers,
  FiClock
} from 'react-icons/fi';

const today = function() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

const faceBoxStyle = function(faceBox) {
  const n = faceBox && faceBox.normalized;
  if (!n || !n.width || !n.height) return null;

  const rawLeft = Number(n.left);
  const rawTop = Number(n.top);
  const rawWidth = Number(n.width);
  const rawHeight = Number(n.height);
  const centerX = rawLeft + rawWidth / 2;
  const centerY = rawTop + rawHeight / 2;

  // Keep the overlay square, but size it from the detected face so it grows
  // and shrinks with the person instead of acting like a fixed guide.
  const side = Math.min(74, Math.max(18, Math.max(rawWidth * 1.16, rawHeight * 1.08)));
  const half = side / 2;
  const left = Math.max(2, Math.min(98 - side, centerX - half));
  const top = Math.max(2, Math.min(98 - side, centerY - half));

  return {
    left: left + '%',
    top: top + '%',
    width: side + '%',
    height: side + '%'
  };
};

const TakeAttendance = function() {
  const location = useLocation();
  const [sections, setSections] = useState([]);
  const [cid, setCid] = useState(
    location.state && location.state.classId ? String(location.state.classId) : ''
  );
  const [students, setStudents] = useState([]);
  const [method, setMethod] = useState('face');
  const [ld, setLd] = useState(true);

  const [camOn, setCamOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scannerRunning, setScannerRunning] = useState(false);
  const [faceResult, setFaceResult] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);
  const [liveMessage, setLiveMessage] = useState('Ready');
  const webcamRef = useRef(null);
  const scanTimer = useRef(null);
  const busyRef = useRef(false);
  const markedIdsRef = useRef(new Set());

  const [manualStatus, setManualStatus] = useState({});
  const [savingManual, setSavingManual] = useState(false);
  const [qrInput, setQrInput] = useState('');

  useEffect(function() {
    busyRef.current = busy;
  }, [busy]);

  function stopAll() {
    setScannerRunning(false);
    setCamOn(false);
    setFaceResult(null);
    setLiveMessage('Ready');
    if (scanTimer.current) {
      clearTimeout(scanTimer.current);
      scanTimer.current = null;
    }
  }

  useEffect(function() {
    classAPI.getByTeacher()
      .then(function(r) { setSections(r.data.classes || []); })
      .catch(function() { toast.error('Failed to load sections'); })
      .finally(function() { setLd(false); });
  }, []);

  useEffect(function() {
    markedIdsRef.current = new Set();
    setScanHistory([]);
    setFaceResult(null);
    if (cid) {
      classAPI.getStudents(parseInt(cid))
        .then(function(r) {
          const studs = r.data.students || [];
          setStudents(studs);
          const init = {};
          studs.forEach(function(s) { init[s.id] = 'present'; });
          setManualStatus(init);
        })
        .catch(function() { toast.error('Failed to load students'); });
    } else {
      setStudents([]);
    }
  }, [cid]);

  const scanOnce = useCallback(async function() {
    if (!cid || !webcamRef.current || busyRef.current) return;

    const img = webcamRef.current.getScreenshot();
    if (!img) return;

    setBusy(true);
    busyRef.current = true;

    try {
      const r = await faceAPI.verifyVideo([cleanBase64(img)], parseInt(cid));
      const data = r.data;

      setFaceResult(data);

      if (data && data.success && data.matched) {
        const key = String(data.student_db_id || data.person_id || data.student_id);
        const name = String(data.student_name || 'Student');
        const status = data.attendance_status || 'present';

        if (!markedIdsRef.current.has(key)) {
          markedIdsRef.current.add(key);
          setScanHistory(function(prev) {
            return [{
              student_name: name,
              student_id: data.student_id,
              student_db_id: data.student_db_id,
              person_id: data.person_id,
              attendance_status: status,
              confidence: data.confidence,
              decision: data.decision,
              time: new Date().toLocaleTimeString()
            }].concat(prev);
          });

          if (status === 'present') {
            toast.success(name + ' marked present');
          } else {
            toast.info(name + ' sent for review');
          }
        }

        setLiveMessage(name + (data.already_marked ? ' already marked' : ' recognized'));
      } else {
        setLiveMessage(data && data.error ? String(data.error) : 'Looking for a registered face');
      }
    } catch (e) {
      const msg = e.response?.data?.error || 'Scan failed';
      setFaceResult({ success: false, matched: false, error: msg });
      setLiveMessage(String(msg));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }, [cid]);

  useEffect(function() {
    if (!scannerRunning || !camOn || !cid) return undefined;

    let cancelled = false;
    const tick = async function() {
      if (cancelled) return;
      await scanOnce();
      if (!cancelled) {
        scanTimer.current = setTimeout(tick, 850);
      }
    };

    scanTimer.current = setTimeout(tick, 700);
    return function() {
      cancelled = true;
      if (scanTimer.current) {
        clearTimeout(scanTimer.current);
        scanTimer.current = null;
      }
    };
  }, [scannerRunning, camOn, cid, scanOnce]);

  function startScanning() {
    if (!cid) {
      toast.error('Select a section');
      return;
    }
    setCamOn(true);
    setScannerRunning(true);
    setLiveMessage('Camera starting');
  }

  function pauseScanning() {
    setScannerRunning(false);
    setLiveMessage('Paused');
    if (scanTimer.current) {
      clearTimeout(scanTimer.current);
      scanTimer.current = null;
    }
  }

  async function saveManual() {
    if (!cid) {
      toast.error('Select a section');
      return;
    }
    setSavingManual(true);
    try {
      const records = Object.entries(manualStatus).map(function(entry) {
        return { student_id: parseInt(entry[0]), status: entry[1] };
      });
      const r = await attendanceAPI.markBulk({
        class_section_id: parseInt(cid),
        date: today(),
        records: records
      });
      toast.success('Saved: ' + r.data.marked + ' marked, ' + r.data.updated + ' updated');
    } catch (e) {
      const msg = e.response && e.response.data ? String(e.response.data.error || 'Failed to save') : 'Failed to save';
      toast.error(msg);
    } finally {
      setSavingManual(false);
    }
  }

  async function handleQR() {
    if (!qrInput.trim()) {
      toast.error('Enter a student ID');
      return;
    }
    if (!cid) {
      toast.error('Select a section');
      return;
    }
    try {
      await attendanceAPI.markManual({
        student_id: qrInput.trim(),
        class_section_id: parseInt(cid),
        date: today(),
        status: 'present',
        marked_by: 'qr'
      });
      toast.success('Marked present: ' + qrInput);
      setScanHistory(function(prev) {
        return [{
          student_name: qrInput,
          status: 'present',
          time: new Date().toLocaleTimeString(),
          method: 'qr'
        }].concat(prev);
      });
      setQrInput('');
    } catch (e) {
      const msg = e.response && e.response.data ? String(e.response.data.error || 'QR marking failed') : 'QR marking failed';
      toast.error(msg);
    }
  }

  if (ld) {
    return (
      <div className="loader-full"><div className="spinner" /><span>Loading...</span></div>
    );
  }

  const recognizedKeys = new Set(scanHistory.map(function(h) {
    return String(h.student_db_id || h.person_id || h.student_id);
  }));
  const remainingCount = Math.max(students.length - scanHistory.length, 0);
  const activeFaceBox = faceBoxStyle(faceResult && faceResult.face_box);

  return (
    <div className="fade">
      <div className="ph">
        <div>
          <h1><FiCamera style={{ marginRight: 10, color: 'var(--m500)' }} /> Take Attendance</h1>
          <p>Live recognition with a clean roster view</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-b" style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="fl">Section</label>
            <select
              className="fs"
              value={cid}
              onChange={function(e) {
                stopAll();
                setCid(e.target.value);
              }}
            >
              <option value="">Select Section</option>
              {sections.map(function(s) {
                return (
                  <option key={s.id} value={s.id}>
                    {s.class_name} - {s.section} ({s.subject})
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="fl">Method</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className={'btn btn-sm ' + (method === 'face' ? 'btn-p' : 'btn-s')}
                onClick={function() { setMethod('face'); }}
              >
                Face AI
              </button>
              <button
                className={'btn btn-sm ' + (method === 'qr' ? 'btn-p' : 'btn-s')}
                onClick={function() { setMethod('qr'); stopAll(); }}
              >
                QR Code
              </button>
              <button
                className={'btn btn-sm ' + (method === 'manual' ? 'btn-p' : 'btn-s')}
                onClick={function() { setMethod('manual'); stopAll(); }}
              >
                Manual
              </button>
            </div>
          </div>
          <div>
            <span className="badge b-m">{today()}</span>
            {cid && <span className="badge b-info" style={{ marginLeft: 6 }}>{students.length} students</span>}
          </div>
        </div>
      </div>

      {!cid ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <FiCamera size={48} color="var(--g300)" />
          <h3 style={{ color: 'var(--g500)', marginTop: 14 }}>Select a Section</h3>
        </div>
      ) : (
        <>
          {method === 'face' && (
            <div className="g-2col">
              <div className="card live-card">
                <div className="card-h">
                  <h3><FiCamera size={17} /> Live Scanner</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={'badge ' + (scannerRunning ? 'b-ok' : 'b-info')}>
                      {scannerRunning ? 'Live' : 'Paused'}
                    </span>
                    {busy && <span className="badge b-warn">Analyzing</span>}
                  </div>
                </div>
                <div className="card-b">
                  {!camOn ? (
                    <div className="cam-off">
                      <div className="cam-off-ic"><FiCamera size={44} /></div>
                      <h3>Camera Off</h3>
                      <p>Start the scanner for this section</p>
                      <button className="btn btn-p btn-lg" onClick={startScanning}>
                        <FiPlay size={18} /> Start Live Scan
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="scanner-shell">
                        <Webcam
                          ref={webcamRef}
                          audio={false}
                          screenshotFormat="image/jpeg"
                          screenshotQuality={0.72}
                          videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
                          style={{ width: '100%', display: 'block' }}
                        />
                        <div
                          className={'face-corners ' + (activeFaceBox ? 'locked' : 'searching')}
                          style={activeFaceBox || undefined}
                        >
                          <span />
                          <span />
                          <span />
                          <span />
                        </div>
                        <div className="cam-live">
                          <div className="cam-live-dot" />
                          <span>{scannerRunning ? 'LIVE' : 'PAUSED'}</span>
                        </div>
                        <div className={'scan-status-panel ' + (faceResult && faceResult.matched ? 'ok' : '')}>
                          <strong>{liveMessage}</strong>
                          <span>{scanHistory.length}/{students.length} recognized</span>
                        </div>
                      </div>

                      <div className="scan-metrics scan-metrics-two">
                        <div><span>Recognized</span><strong>{scanHistory.length}</strong></div>
                        <div><span>Roster</span><strong>{students.length}</strong></div>
                      </div>

                      <div className="cam-ctrl">
                        {scannerRunning ? (
                          <button className="btn btn-s" onClick={pauseScanning}>
                            <FiPause size={16} /> Pause
                          </button>
                        ) : (
                          <button className="btn btn-p" onClick={function() { setScannerRunning(true); }}>
                            <FiPlay size={16} /> Resume
                          </button>
                        )}
                        <button className="btn btn-s" onClick={scanOnce} disabled={busy}>
                          <FiCamera size={16} /> Scan Now
                        </button>
                        <button className="btn btn-g btn-sm" onClick={stopAll} style={{ color: 'var(--err)' }}>
                          <FiSquare size={14} /> Stop
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className={'card scan-result-card ' + (faceResult && faceResult.matched ? 'ok' : 'idle')}>
                  <div className="card-b">
                    {faceResult && faceResult.matched ? (
                      <>
                        <div className="scan-result-icon ok"><FiUserCheck size={30} /></div>
                        <h2>{String(faceResult.student_name || 'Recognized')}</h2>
                        <div className="vr-grid" style={{ marginTop: 16 }}>
                          <div className="vr-item">
                            <span>Status</span>
                            <strong style={{ color: faceResult.attendance_status === 'present' ? 'var(--ok)' : 'var(--warn)' }}>
                              {String(faceResult.attendance_status || 'present').toUpperCase()}
                            </strong>
                          </div>
                          <div className="vr-item">
                            <span>Confidence</span>
                            <strong>
                              {faceResult.confidence
                                ? (Number(faceResult.confidence) * 100).toFixed(1) + '%'
                                : 'N/A'}
                            </strong>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="scan-result-icon idle"><FiXCircle size={30} /></div>
                        <h2>{faceResult && faceResult.error ? String(faceResult.error) : 'No Match Yet'}</h2>
                        <p>{scannerRunning ? 'Scanner is watching the live feed' : 'Scanner is paused'}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="card" style={{ marginTop: 20 }}>
                  <div className="card-h">
                    <h3><FiCheckCircle size={17} /> Recognized ({scanHistory.length})</h3>
                    {scanHistory.length > 0 && (
                      <button
                        className="btn btn-g btn-sm"
                        onClick={function() {
                          markedIdsRef.current = new Set();
                          setScanHistory([]);
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {scanHistory.length === 0 ? (
                    <div className="empty-state">
                      {camOn ? 'Waiting for recognition' : 'Start live scan'}
                    </div>
                  ) : (
                    <div className="history-list">
                      {scanHistory.map(function(h, i) {
                        return (
                          <div key={i} className="history-row">
                            <FiCheckCircle size={16} color="var(--ok)" />
                            <div style={{ flex: 1 }}>
                              <p>{String(h.student_name || 'Student')}</p>
                              <span><FiClock size={11} /> {String(h.time || '')}</span>
                            </div>
                            <span className={'badge ' + (h.attendance_status === 'pending_review' ? 'b-warn' : 'b-ok')}>
                              {String(h.attendance_status || h.status || 'present')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="card" style={{ marginTop: 20 }}>
                  <div className="card-h">
                    <h3><FiUsers size={17} /> Roster ({remainingCount} waiting)</h3>
                  </div>
                  {students.length === 0 ? (
                    <div className="empty-state">No students in this section</div>
                  ) : (
                    <div className="roster-list">
                      {students.map(function(s) {
                        const done = recognizedKeys.has(String(s.id));
                        return (
                          <div key={s.id} className={'roster-row ' + (done ? 'done' : '')}>
                            <div className="roster-avatar">{String(s.full_name || 'S').charAt(0)}</div>
                            <div style={{ flex: 1 }}>
                              <p>{s.full_name}</p>
                              <span>{s.student_id}</span>
                            </div>
                            <span className={'badge ' + (done ? 'b-ok' : s.face_registered ? 'b-info' : 'b-warn')}>
                              {done ? 'Present' : s.face_registered ? 'Ready' : 'No face'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {method === 'qr' && (
            <div className="card">
              <div className="card-h"><h3>QR Code / Student ID Entry</h3></div>
              <div className="card-b">
                <div style={{ display: 'flex', gap: 12, maxWidth: 500 }}>
                  <input
                    className="fi"
                    placeholder="Enter Student ID"
                    value={qrInput}
                    onChange={function(e) { setQrInput(e.target.value); }}
                    onKeyDown={function(e) { if (e.key === 'Enter') handleQR(); }}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <button className="btn btn-p" onClick={handleQR}>Mark Present</button>
                </div>
              </div>
            </div>
          )}

          {method === 'manual' && (
            <div className="card">
              <div className="card-h">
                <h3>Manual Attendance - {today()}</h3>
                <button className="btn btn-p btn-sm" onClick={saveManual} disabled={savingManual}>
                  {savingManual ? 'Saving...' : <><FiCheck size={14} /> Save All</>}
                </button>
              </div>
              <div className="tw">
                <table className="dt">
                  <thead>
                    <tr><th>Student</th><th>ID</th><th>Face</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: 30, color: 'var(--g400)' }}>
                          No students in this section
                        </td>
                      </tr>
                    ) : students.map(function(s) {
                      return (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                          <td><span className="badge b-m">{s.student_id}</span></td>
                          <td>
                            <span className={'badge ' + (s.face_registered ? 'b-ok' : 'b-warn')} style={{ fontSize: 10 }}>
                              {s.face_registered ? 'Ready' : 'Missing'}
                            </span>
                          </td>
                          <td>
                            <select
                              className="fs"
                              style={{ width: 140, padding: '6px 10px' }}
                              value={manualStatus[s.id] || 'present'}
                              onChange={function(e) {
                                setManualStatus(function(prev) {
                                  const next = Object.assign({}, prev);
                                  next[s.id] = e.target.value;
                                  return next;
                                });
                              }}
                            >
                              <option value="present">Present</option>
                              <option value="absent">Absent</option>
                              <option value="late">Late</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {students.length > 0 && (
                <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-p" onClick={saveManual} disabled={savingManual}>
                    {savingManual ? 'Saving...' : 'Save Attendance'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TakeAttendance;

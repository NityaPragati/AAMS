import React, { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import {
  FiCamera,
  FiCheckCircle,
  FiClock,
  FiHash,
} from 'react-icons/fi';

const ScanQrAttendance = function() {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanSupported, setScanSupported] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [message, setMessage] = useState('Ready to scan the teacher QR');
  const [scanResult, setScanResult] = useState(null);

  const webcamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const detectorRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(function() {
    busyRef.current = busy;
  }, [busy]);

  useEffect(function() {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        setScanSupported(true);
      } catch (err) {
        setScanSupported(false);
      }
    } else {
      setScanSupported(false);
    }
  }, []);

  useEffect(function() {
    attendanceAPI.getMyClasses()
      .then(function(r) {
        setClasses(r.data.classes || []);
      })
      .catch(function(e) {
        toast.error(e.response?.data?.error || 'Failed to load classes');
      })
      .finally(function() {
        setLoading(false);
      });
  }, []);

  const clearScanLoop = useCallback(function() {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }, []);

  useEffect(function() {
    return function() {
      clearScanLoop();
    };
  }, [clearScanLoop]);

  const submitPayload = useCallback(async function(payload) {
    if (!payload || busyRef.current) return;

    setBusy(true);
    setMessage('Submitting attendance...');
    try {
      const r = await attendanceAPI.scanQr({ payload: payload });
      const data = r.data;
      setScanResult({ ok: true, data: data });
      setMessage(data.already_scanned_session
        ? 'You already scanned this QR window'
        : 'Attendance marked present'
      );
      setCameraOn(false);
      setScanning(false);
      setManualCode('');
      toast.success(data.class_name + ' - ' + data.section + ': present');
    } catch (e) {
      const msg = e.response?.data?.error || 'QR scan failed';
      setScanResult({ ok: false, msg: msg });
      setMessage(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const detectFromShot = useCallback(async function(dataUrl) {
    if (!dataUrl || !detectorRef.current) return null;
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const codes = await detectorRef.current.detect(bitmap);
      return codes && codes.length > 0 ? codes[0].rawValue : null;
    } finally {
      if (bitmap && bitmap.close) bitmap.close();
    }
  }, []);

  useEffect(function() {
    if (!scanning || !cameraOn || !scanSupported) return undefined;

    let cancelled = false;
    const tick = async function() {
      if (cancelled || busyRef.current) return;
      const shot = webcamRef.current ? webcamRef.current.getScreenshot() : null;
      if (shot) {
        try {
          const rawValue = await detectFromShot(shot);
          if (rawValue) {
            await submitPayload(rawValue);
            return;
          }
        } catch (err) {
          setMessage('Camera could not read the QR yet');
        }
      }
      if (!cancelled) {
        scanTimerRef.current = setTimeout(tick, 650);
      }
    };

    setMessage('Point your camera at the teacher QR code');
    scanTimerRef.current = setTimeout(tick, 500);
    return function() {
      cancelled = true;
      clearScanLoop();
    };
  }, [cameraOn, clearScanLoop, detectFromShot, scanSupported, scanning, submitPayload]);



  async function handleManualSubmit() {
    if (!manualCode.trim()) {
      toast.error('Enter the fallback code');
      return;
    }
    await submitPayload(manualCode.trim().toUpperCase());
  }

  if (loading) {
    return <div className="loader-full"><div className="spinner" /><span>Loading QR attendance...</span></div>;
  }

  return (
    <div className="fade">
      <div className="ph">
        <div>
          <h1><FiCamera style={{ marginRight: 10, color: 'var(--m500)' }} /> Scan QR Attendance</h1>
          <p>{user?.full_name} ({user?.student_id})</p>
        </div>
      </div>

      <div className="g-2col">
        <div className="card live-card">
          <div className="card-h">
            <h3><FiCamera size={17} /> Attendance Code</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className={'badge ' + (scanSupported ? 'b-ok' : 'b-warn')}>
                {scanSupported ? 'Camera scan ready' : 'Manual fallback'}
              </span>
              {busy && <span className="badge b-info">Processing</span>}
            </div>
          </div>
          <div className="card-b">
            <div style={{ marginBottom: 10 }}>
              <p style={{ color: 'var(--g500)', marginTop: 4 }}>
                  Enter the attendance code provided by your teacher.
              </p>
          </div>

            <div style={{ marginTop: 20 }}>
              <label className="fl">Fallback code</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  className="fi"
                  value={manualCode}
                  onChange={function(e) { setManualCode(e.target.value.toUpperCase()); }}
                  placeholder="Enter 8-character code"
                  style={{ flex: 1, minWidth: 220, textTransform: 'uppercase', letterSpacing: 2 }}
                />
                <button className="btn btn-p" onClick={handleManualSubmit} disabled={busy}>
                  <FiHash size={16} /> Submit Code
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--g500)', marginTop: 8 }}>
                Use this only if your browser does not support direct QR scanning.
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className={'card scan-result-card ' + (scanResult && scanResult.ok ? 'ok' : 'idle')}>
            <div className="card-b">
              {scanResult && scanResult.ok ? (
                <>
                  <div className="scan-result-icon ok"><FiCheckCircle size={30} /></div>
                  <h2>{scanResult.data.class_name} - {scanResult.data.section}</h2>
                  <p>{scanResult.data.subject}</p>
                  <div className="vr-grid" style={{ marginTop: 16 }}>
                    <div className="vr-item">
                      <span>Status</span>
                      <strong style={{ color: 'var(--ok)' }}>PRESENT</strong>
                    </div>
                    <div className="vr-item">
                      <span>Marked</span>
                      <strong>{scanResult.data.already_scanned_session ? 'Already scanned' : 'Just now'}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="scan-result-icon idle"><FiClock size={30} /></div>
                  <h2>{message}</h2>
                  <p>Ask your teacher to keep the rotating QR visible while you scan.</p>
                </>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-h">
              <h3>My Enrolled Classes</h3>
            </div>
            {classes.length === 0 ? (
              <div className="empty-state">You are not enrolled in any class yet</div>
            ) : (
              <div className="history-list">
                {classes.map(function(cls) {
                  return (
                    <div key={cls.id} className="history-row">
                      <FiCheckCircle size={16} color="var(--m500)" />
                      <div style={{ flex: 1 }}>
                        <p>{cls.class_name} - {cls.section}</p>
                        <span>{cls.subject} - {cls.teacher_name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScanQrAttendance;

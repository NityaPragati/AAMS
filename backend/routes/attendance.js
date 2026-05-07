const crypto = require('crypto');
const express = require('express');
const { getOne, getAll, run } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const QR_TTL_SECONDS = 30;
const QR_PREFIX = 'faceattend://attendance';
const DISPLAY_CODE_LENGTH = 8;
const DISPLAY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function today() {
  return new Date().toISOString().split('T')[0];
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function generateDisplayCode() {
  var out = '';
  for (var i = 0; i < DISPLAY_CODE_LENGTH; i += 1) {
    var idx = crypto.randomInt(0, DISPLAY_ALPHABET.length);
    out += DISPLAY_ALPHABET[idx];
  }
  return out;
}

function buildQrPayload(token, code) {
  return QR_PREFIX + '?token=' + encodeURIComponent(token) + '&code=' + encodeURIComponent(code);
}

function parseQrPayload(value) {
  var raw = String(value || '').trim();
  if (!raw) return { token: null, code: null };

  if (raw.indexOf(QR_PREFIX) === 0) {
    try {
      var url = new URL(raw);
      return {
        token: url.searchParams.get('token'),
        code: url.searchParams.get('code')
      };
    } catch (err) {
      var tokenMatch = raw.match(/[?&]token=([^&]+)/i);
      var codeMatch = raw.match(/[?&]code=([^&]+)/i);
      return {
        token: tokenMatch ? decodeURIComponent(tokenMatch[1]) : null,
        code: codeMatch ? decodeURIComponent(codeMatch[1]) : null
      };
    }
  }

  if (/^[A-Z2-9]{6,12}$/.test(raw)) {
    return { token: null, code: raw.toUpperCase() };
  }

  return { token: raw, code: null };
}

async function getTeacherRecord(userId) {
  return getOne('SELECT * FROM teachers WHERE user_id = $1', [userId]);
}

async function getOwnedClassSection(user, classSectionId) {
  if (user.role === 'admin') {
    return getOne(
      `SELECT cs.*, t.id as teacher_record_id, u.full_name as teacher_name
       FROM class_sections cs
       JOIN teachers t ON cs.teacher_id = t.id
       JOIN users u ON t.user_id = u.id
       WHERE cs.id = $1`,
      [classSectionId]
    );
  }

  return getOne(
    `SELECT cs.*, t.id as teacher_record_id, u.full_name as teacher_name
     FROM class_sections cs
     JOIN teachers t ON cs.teacher_id = t.id
     JOIN users u ON t.user_id = u.id
     WHERE cs.id = $1 AND t.user_id = $2`,
    [classSectionId, user.id]
  );
}

async function getStudentForUser(userId) {
  return getOne(
    `SELECT s.*, u.full_name, u.email
     FROM students s
     JOIN users u ON s.user_id = u.id
     WHERE s.user_id = $1`,
    [userId]
  );
}

async function markStudentPresentFromQr(studentId, classSectionId, sessionId) {
  var date = today();
  var existing = await getOne(
    'SELECT id, status, marked_by FROM attendance_records WHERE student_id = $1 AND class_section_id = $2 AND date = $3',
    [studentId, classSectionId, date]
  );

  var notes = 'Rotating QR session #' + sessionId;
  if (existing) {
    await run(
      `UPDATE attendance_records
       SET status = 'present', marked_by = 'qr', notes = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [notes, existing.id]
    );
    return {
      record_id: existing.id,
      action: 'updated',
      previous_status: existing.status,
      already_present: existing.status === 'present'
    };
  }

  var result = await run(
    `INSERT INTO attendance_records
     (student_id, class_section_id, date, status, marked_by, notes)
     VALUES ($1, $2, $3, 'present', 'qr', $4)
     RETURNING id`,
    [studentId, classSectionId, date, notes]
  );

  return {
    record_id: result.rows[0].id,
    action: 'created',
    previous_status: null,
    already_present: false
  };
}

async function getSessionStatus(sessionId) {
  var session = await getOne(
    `SELECT s.*, cs.class_name, cs.section, cs.subject, cs.room,
            u.full_name as teacher_name,
            CASE WHEN s.is_active = true AND s.expires_at > CURRENT_TIMESTAMP THEN true ELSE false END as active_now
     FROM attendance_qr_sessions s
     JOIN class_sections cs ON s.class_section_id = cs.id
     JOIN teachers t ON s.teacher_id = t.id
     JOIN users u ON t.user_id = u.id
     WHERE s.id = $1`,
    [sessionId]
  );
  if (!session) return null;

  var scans = await getAll(
    `SELECT q.id as claim_id, q.scanned_at,
            st.id as student_db_id, st.student_id as student_roll,
            u.full_name as student_name,
            ar.id as attendance_record_id, ar.status as attendance_status, ar.marked_by
     FROM attendance_qr_scans q
     JOIN students st ON q.student_id = st.id
     JOIN users u ON st.user_id = u.id
     LEFT JOIN attendance_records ar ON q.attendance_record_id = ar.id
     WHERE q.session_id = $1
     ORDER BY q.scanned_at DESC`,
    [sessionId]
  );

  var totals = await getOne(
    `SELECT COUNT(*)::int as total_qr_present_today
     FROM attendance_records
     WHERE class_section_id = $1 AND date = $2 AND marked_by = 'qr'`,
    [session.class_section_id, today()]
  );

  return {
    session_id: session.id,
    class_section_id: session.class_section_id,
    class_name: session.class_name,
    section: session.section,
    subject: session.subject,
    room: session.room,
    teacher_name: session.teacher_name,
    display_code: session.display_code,
    created_at: session.created_at,
    expires_at: session.expires_at,
    active: session.active_now,
    ttl_seconds: QR_TTL_SECONDS,
    total_scans: scans.length,
    total_qr_present_today: totals ? totals.total_qr_present_today : 0,
    scans: scans
  };
}

router.post('/mark', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    var sid = req.body.student_id;
    var cid = req.body.class_section_id;
    var date = req.body.date;
    var status = req.body.status;
    var notes = req.body.notes;
    var marked_by = req.body.marked_by || 'manual';

    if (!sid || !cid || !date) {
      return res.status(400).json({ error: 'student_id, class_section_id, date required' });
    }

    var studentRecord = null;
    if (!isNaN(parseInt(sid, 10))) {
      studentRecord = await getOne('SELECT id FROM students WHERE id = $1', [parseInt(sid, 10)]);
    }
    if (!studentRecord) {
      studentRecord = await getOne('SELECT id FROM students WHERE student_id = $1', [String(sid)]);
    }
    if (!studentRecord) {
      return res.status(404).json({ error: 'Student not found' });
    }

    var actualId = studentRecord.id;
    var validStatus = ['present', 'absent', 'late', 'pending_review'].indexOf(status) !== -1 ? status : 'present';
    var existing = await getOne(
      'SELECT id FROM attendance_records WHERE student_id = $1 AND class_section_id = $2 AND date = $3',
      [actualId, cid, date]
    );

    if (existing) {
      await run(
        'UPDATE attendance_records SET status = $1, marked_by = $2, notes = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [validStatus, marked_by, notes || null, existing.id]
      );
      return res.json({ success: true, action: 'updated', id: existing.id, status: validStatus });
    }

    var result = await run(
      `INSERT INTO attendance_records (student_id, class_section_id, date, status, marked_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [actualId, cid, date, validStatus, marked_by, notes || null]
    );
    res.json({ success: true, action: 'created', id: result.rows[0].id, status: validStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mark-bulk', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    var cid = req.body.class_section_id;
    var date = req.body.date;
    var records = req.body.records;

    if (!cid || !date || !records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'class_section_id, date, records required' });
    }

    var marked = 0;
    var updated = 0;

    for (var i = 0; i < records.length; i += 1) {
      var rec = records[i];
      var existing = await getOne(
        'SELECT id FROM attendance_records WHERE student_id = $1 AND class_section_id = $2 AND date = $3',
        [rec.student_id, cid, date]
      );
      if (existing) {
        await run(
          "UPDATE attendance_records SET status = $1, marked_by = 'manual', updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [rec.status, existing.id]
        );
        updated += 1;
      } else {
        await run(
          "INSERT INTO attendance_records (student_id, class_section_id, date, status, marked_by) VALUES ($1, $2, $3, $4, 'manual')",
          [rec.student_id, cid, date, rec.status]
        );
        marked += 1;
      }
    }

    res.json({ success: true, marked: marked, updated: updated, total: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/qr/session', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    var classSectionId = parseInt(req.body.class_section_id, 10);
    if (!classSectionId) {
      return res.status(400).json({ error: 'class_section_id required' });
    }

    var cls = await getOwnedClassSection(req.user, classSectionId);
    if (!cls) {
      return res.status(404).json({ error: 'Class not found or not assigned to you' });
    }

    var teacherId = cls.teacher_record_id || cls.teacher_id;
    await run(
      'UPDATE attendance_qr_sessions SET is_active = false WHERE class_section_id = $1 AND teacher_id = $2 AND is_active = true',
      [classSectionId, teacherId]
    );

    var token = null;
    var displayCode = null;
    var expiresAt = null;
    var created = null;

    for (var attempt = 0; attempt < 5; attempt += 1) {
      token = generateToken();
      displayCode = generateDisplayCode();
      expiresAt = new Date(Date.now() + (QR_TTL_SECONDS * 1000));
      try {
        created = await run(
          `INSERT INTO attendance_qr_sessions
           (class_section_id, teacher_id, token_hash, display_code, expires_at)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, created_at, expires_at`,
          [classSectionId, teacherId, hashToken(token), displayCode, expiresAt]
        );
        break;
      } catch (err) {
        if (err.code !== '23505' || attempt === 4) {
          throw err;
        }
      }
    }

    var sessionId = created.rows[0].id;
    res.json({
      success: true,
      session_id: sessionId,
      class_section_id: classSectionId,
      class_name: cls.class_name,
      section: cls.section,
      subject: cls.subject,
      display_code: displayCode,
      payload: buildQrPayload(token, displayCode),
      expires_at: created.rows[0].expires_at,
      ttl_seconds: QR_TTL_SECONDS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/qr/session/:sessionId', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    var sessionId = parseInt(req.params.sessionId, 10);
    var status = await getSessionStatus(sessionId);
    if (!status) {
      return res.status(404).json({ error: 'QR session not found' });
    }

    var cls = await getOwnedClassSection(req.user, status.class_section_id);
    if (!cls) {
      return res.status(403).json({ error: 'Not allowed to view this QR session' });
    }

    res.json({ success: true, session: status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/qr/scan', authenticate, requireRole('student'), async function(req, res) {
  try {
    var parsed = parseQrPayload(req.body.payload || req.body.code || req.body.token);
    if (!parsed.token && !parsed.code) {
      return res.status(400).json({ error: 'Valid QR payload or code required' });
    }

    var session = null;
    if (parsed.token) {
      session = await getOne(
        `SELECT s.*, cs.class_name, cs.section, cs.subject
         FROM attendance_qr_sessions s
         JOIN class_sections cs ON s.class_section_id = cs.id
         WHERE s.token_hash = $1 AND s.is_active = true AND s.expires_at > CURRENT_TIMESTAMP`,
        [hashToken(parsed.token)]
      );
    }
    if (!session && parsed.code) {
      session = await getOne(
        `SELECT s.*, cs.class_name, cs.section, cs.subject
         FROM attendance_qr_sessions s
         JOIN class_sections cs ON s.class_section_id = cs.id
         WHERE s.display_code = $1 AND s.is_active = true AND s.expires_at > CURRENT_TIMESTAMP`,
        [parsed.code]
      );
    }
    if (!session) {
      return res.status(400).json({ error: 'QR code expired or invalid' });
    }

    var student = await getStudentForUser(req.user.id);
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    var enrollment = await getOne(
      'SELECT id FROM enrollments WHERE student_id = $1 AND class_section_id = $2',
      [student.id, session.class_section_id]
    );
    if (!enrollment) {
      return res.status(403).json({ error: 'You are not enrolled in this class' });
    }

    var attendance = await markStudentPresentFromQr(student.id, session.class_section_id, session.id);
    var claim = await run(
      `INSERT INTO attendance_qr_scans (session_id, student_id, attendance_record_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, student_id) DO NOTHING
       RETURNING id, scanned_at`,
      [session.id, student.id, attendance.record_id]
    );
    var alreadyScannedSession = claim.rows.length === 0;

    if (alreadyScannedSession) {
      claim = await run(
        `SELECT id, scanned_at FROM attendance_qr_scans
         WHERE session_id = $1 AND student_id = $2`,
        [session.id, student.id]
      );
    }

    res.json({
      success: true,
      session_id: session.id,
      class_section_id: session.class_section_id,
      class_name: session.class_name,
      section: session.section,
      subject: session.subject,
      student_db_id: student.id,
      student_id: student.student_id,
      student_name: student.full_name,
      attendance_status: 'present',
      already_marked: attendance.already_present,
      already_scanned_session: alreadyScannedSession,
      action: attendance.action,
      previous_status: attendance.previous_status,
      scanned_at: claim.rows[0].scanned_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my', authenticate, async function(req, res) {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Students only' });
    }

    var student = await getOne('SELECT id FROM students WHERE user_id = $1', [req.user.id]);
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    var query = `SELECT ar.*, cs.class_name, cs.section, cs.subject, ut.full_name as teacher_name
                 FROM attendance_records ar
                 JOIN class_sections cs ON ar.class_section_id = cs.id
                 JOIN teachers t ON cs.teacher_id = t.id
                 JOIN users ut ON t.user_id = ut.id
                 WHERE ar.student_id = $1`;
    var params = [student.id];

    if (req.query.class_id) {
      query += ' AND ar.class_section_id = $2';
      params.push(parseInt(req.query.class_id, 10));
    }
    query += ' ORDER BY ar.date DESC';

    var records = await getAll(query, params);
    var classMap = {};

    for (var i = 0; i < records.length; i += 1) {
      var r = records[i];
      var key = r.class_section_id;
      if (!classMap[key]) {
        classMap[key] = {
          class_section_id: key,
          class_name: r.class_name,
          section: r.section,
          subject: r.subject,
          teacher_name: r.teacher_name,
          total: 0,
          present: 0,
          absent: 0,
          late: 0
        };
      }
      classMap[key].total += 1;
      if (r.status === 'present') classMap[key].present += 1;
      else if (r.status === 'absent') classMap[key].absent += 1;
      else if (r.status === 'late') classMap[key].late += 1;
    }

    var classStats = Object.values(classMap).map(function(stat) {
      var attended = stat.present + stat.late;
      var pct = stat.total > 0 ? Math.round((attended / stat.total) * 100) : 0;
      stat.percentage = pct;
      stat.below_75 = stat.total > 0 ? pct < 75 : false;
      return stat;
    });

    res.json({ records: records, class_stats: classStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my-classes', authenticate, async function(req, res) {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
    var student = await getOne('SELECT id FROM students WHERE user_id = $1', [req.user.id]);
    if (!student) return res.status(404).json({ error: 'Not found' });

    var classes = await getAll(
      `SELECT cs.*, u.full_name as teacher_name
       FROM enrollments e
       JOIN class_sections cs ON e.class_section_id = cs.id
       JOIN teachers t ON cs.teacher_id = t.id
       JOIN users u ON t.user_id = u.id
       WHERE e.student_id = $1
       ORDER BY cs.class_name`,
      [student.id]
    );
    res.json({ classes: classes, total: classes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/class/:classId', authenticate, async function(req, res) {
  try {
    var date = req.query.date || today();
    var records = await getAll(
      `SELECT ar.*, s.student_id as student_roll, u.full_name as student_name
       FROM attendance_records ar
       JOIN students s ON ar.student_id = s.id
       JOIN users u ON s.user_id = u.id
       WHERE ar.class_section_id = $1 AND ar.date = $2
       ORDER BY u.full_name`,
      [req.params.classId, date]
    );

    var totalResult = await getOne('SELECT COUNT(*) as c FROM enrollments WHERE class_section_id = $1', [req.params.classId]);
    var total = parseInt(totalResult ? totalResult.c : 0, 10);

    res.json({
      class_id: parseInt(req.params.classId, 10),
      date: date,
      records: records,
      summary: {
        total_students: total,
        present: records.filter(function(r) { return r.status === 'present'; }).length,
        absent: records.filter(function(r) { return r.status === 'absent'; }).length,
        late: records.filter(function(r) { return r.status === 'late'; }).length,
        pending_review: records.filter(function(r) { return r.status === 'pending_review'; }).length
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/student/:studentId', authenticate, async function(req, res) {
  try {
    var query = `SELECT ar.*, cs.class_name, cs.section
                 FROM attendance_records ar
                 JOIN class_sections cs ON ar.class_section_id = cs.id
                 WHERE ar.student_id = $1`;
    var params = [req.params.studentId];
    if (req.query.class_id) {
      query += ' AND ar.class_section_id = $2';
      params.push(req.query.class_id);
    }
    query += ' ORDER BY ar.date DESC';

    var records = await getAll(query, params);
    var total = records.length;
    var present = records.filter(function(r) {
      return r.status === 'present' || r.status === 'late';
    }).length;

    res.json({
      student_id: parseInt(req.params.studentId, 10),
      records: records,
      summary: {
        total_classes: total,
        present: present,
        absent: total - present,
        percentage: total > 0 ? Math.round((present / total) * 100) : 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    var record = await getOne('SELECT id FROM attendance_records WHERE id = $1', [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (['present', 'absent', 'late', 'pending_review'].indexOf(req.body.status) === -1) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await run(
      "UPDATE attendance_records SET status = $1, notes = $2, marked_by = 'manual', updated_at = CURRENT_TIMESTAMP WHERE id = $3",
      [req.body.status, req.body.notes || null, req.params.id]
    );
    res.json({ success: true, id: parseInt(req.params.id, 10), status: req.body.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireRole('admin'), async function(req, res) {
  try {
    var result = await run('DELETE FROM attendance_records WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/report/:classId', authenticate, async function(req, res) {
  try {
    var startDate = req.query.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var endDate = req.query.end_date || today();

    var students = await getAll(
      `SELECT s.id, s.student_id as student_roll, u.full_name
       FROM students s
       JOIN enrollments e ON s.id = e.student_id
       JOIN users u ON s.user_id = u.id
       WHERE e.class_section_id = $1
       ORDER BY u.full_name`,
      [req.params.classId]
    );

    var report = [];
    for (var i = 0; i < students.length; i += 1) {
      var st = students[i];
      var records = await getAll(
        `SELECT status
         FROM attendance_records
         WHERE student_id = $1 AND class_section_id = $2 AND date BETWEEN $3 AND $4`,
        [st.id, req.params.classId, startDate, endDate]
      );
      var total = records.length;
      var present = records.filter(function(r) {
        return r.status === 'present' || r.status === 'late';
      }).length;
      report.push({
        student_id: st.id,
        student_roll: st.student_roll,
        student_name: st.full_name,
        total_classes: total,
        present: present,
        absent: total - present,
        percentage: total > 0 ? Math.round((present / total) * 100) : 0
      });
    }

    res.json({
      class_id: parseInt(req.params.classId, 10),
      start_date: startDate,
      end_date: endDate,
      report: report
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

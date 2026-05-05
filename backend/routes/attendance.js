const express = require('express');
const { getOne, getAll, run } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

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
    if (!isNaN(parseInt(sid))) {
      studentRecord = await getOne('SELECT id FROM students WHERE id = \$1', [parseInt(sid)]);
    }
    if (!studentRecord) {
      studentRecord = await getOne('SELECT id FROM students WHERE student_id = \$1', [String(sid)]);
    }
    if (!studentRecord) {
      return res.status(404).json({ error: 'Student not found' });
    }

    var actualId = studentRecord.id;
    var validStatus = ['present','absent','late','pending_review'].indexOf(status) !== -1 ? status : 'present';

    var existing = await getOne(
      'SELECT id FROM attendance_records WHERE student_id = \$1 AND class_section_id = \$2 AND date = \$3',
      [actualId, cid, date]
    );

    if (existing) {
      await run(
        'UPDATE attendance_records SET status=\$1, marked_by=\$2, notes=\$3, updated_at=CURRENT_TIMESTAMP WHERE id=\$4',
        [validStatus, marked_by, notes||null, existing.id]
      );
      res.json({ success: true, action: 'updated', id: existing.id, status: validStatus });
    } else {
      var result = await run(
        'INSERT INTO attendance_records (student_id, class_section_id, date, status, marked_by, notes) VALUES (\$1,\$2,\$3,\$4,\$5,\$6) RETURNING id',
        [actualId, cid, date, validStatus, marked_by, notes||null]
      );
      res.json({ success: true, action: 'created', id: result.rows[0].id, status: validStatus });
    }
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

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var existing = await getOne(
        'SELECT id FROM attendance_records WHERE student_id=\$1 AND class_section_id=\$2 AND date=\$3',
        [rec.student_id, cid, date]
      );
      if (existing) {
        await run("UPDATE attendance_records SET status=\$1, marked_by='manual', updated_at=CURRENT_TIMESTAMP WHERE id=\$2",
          [rec.status, existing.id]);
        updated++;
      } else {
        await run("INSERT INTO attendance_records (student_id, class_section_id, date, status, marked_by) VALUES (\$1,\$2,\$3,\$4,'manual')",
          [rec.student_id, cid, date, rec.status]);
        marked++;
      }
    }

    res.json({ success: true, marked: marked, updated: updated, total: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my', authenticate, async function(req, res) {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Students only' });
    }

    var student = await getOne('SELECT id FROM students WHERE user_id = \$1', [req.user.id]);
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    var query = 'SELECT ar.*, cs.class_name, cs.section, cs.subject, ut.full_name as teacher_name FROM attendance_records ar JOIN class_sections cs ON ar.class_section_id = cs.id JOIN teachers t ON cs.teacher_id = t.id JOIN users ut ON t.user_id = ut.id WHERE ar.student_id = \$1';
    var params = [student.id];

    if (req.query.class_id) {
      query += ' AND ar.class_section_id = \$2';
      params.push(parseInt(req.query.class_id));
    }
    query += ' ORDER BY ar.date DESC';

    var records = await getAll(query, params);

    var classMap = {};
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var key = r.class_section_id;
      if (!classMap[key]) {
        classMap[key] = { class_section_id: key, class_name: r.class_name, section: r.section, subject: r.subject, teacher_name: r.teacher_name, total: 0, present: 0, absent: 0, late: 0 };
      }
      classMap[key].total++;
      if (r.status === 'present') classMap[key].present++;
      else if (r.status === 'absent') classMap[key].absent++;
      else if (r.status === 'late') classMap[key].late++;
    }

    var class_stats = Object.values(classMap).map(function(s) {
      var attended = s.present + s.late;
      var pct = s.total > 0 ? Math.round((attended / s.total) * 100) : 0;
      s.percentage = pct;
      s.below_75 = s.total > 0 ? pct < 75 : false;
      return s;
    });

    res.json({ records: records, class_stats: class_stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my-classes', authenticate, async function(req, res) {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
    var student = await getOne('SELECT id FROM students WHERE user_id = \$1', [req.user.id]);
    if (!student) return res.status(404).json({ error: 'Not found' });

    var classes = await getAll(
      'SELECT cs.*, u.full_name as teacher_name FROM enrollments e JOIN class_sections cs ON e.class_section_id = cs.id JOIN teachers t ON cs.teacher_id = t.id JOIN users u ON t.user_id = u.id WHERE e.student_id = \$1 ORDER BY cs.class_name',
      [student.id]
    );
    res.json({ classes: classes, total: classes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/class/:classId', authenticate, async function(req, res) {
  try {
    var date = req.query.date || new Date().toISOString().split('T')[0];
    var records = await getAll(
      'SELECT ar.*, s.student_id as student_roll, u.full_name as student_name FROM attendance_records ar JOIN students s ON ar.student_id = s.id JOIN users u ON s.user_id = u.id WHERE ar.class_section_id = \$1 AND ar.date = \$2 ORDER BY u.full_name',
      [req.params.classId, date]
    );

    var totalResult = await getOne('SELECT COUNT(*) as c FROM enrollments WHERE class_section_id = \$1', [req.params.classId]);
    var total = parseInt(totalResult ? totalResult.c : 0);

    res.json({
      class_id: parseInt(req.params.classId), date: date, records: records,
      summary: {
        total_students: total,
        present: records.filter(function(r){return r.status==='present'}).length,
        absent: records.filter(function(r){return r.status==='absent'}).length,
        late: records.filter(function(r){return r.status==='late'}).length,
        pending_review: records.filter(function(r){return r.status==='pending_review'}).length
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/student/:studentId', authenticate, async function(req, res) {
  try {
    var query = 'SELECT ar.*, cs.class_name, cs.section FROM attendance_records ar JOIN class_sections cs ON ar.class_section_id = cs.id WHERE ar.student_id = \$1';
    var params = [req.params.studentId];
    if (req.query.class_id) { query += ' AND ar.class_section_id = \$2'; params.push(req.query.class_id); }
    query += ' ORDER BY ar.date DESC';

    var records = await getAll(query, params);
    var total = records.length;
    var present = records.filter(function(r){return r.status==='present'||r.status==='late'}).length;

    res.json({
      student_id: parseInt(req.params.studentId), records: records,
      summary: { total_classes: total, present: present, absent: total - present, percentage: total > 0 ? Math.round((present/total)*100) : 0 }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    var record = await getOne('SELECT id FROM attendance_records WHERE id = \$1', [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (['present','absent','late','pending_review'].indexOf(req.body.status) === -1) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await run("UPDATE attendance_records SET status=\$1, notes=\$2, marked_by='manual', updated_at=CURRENT_TIMESTAMP WHERE id=\$3",
      [req.body.status, req.body.notes||null, req.params.id]);
    res.json({ success: true, id: parseInt(req.params.id), status: req.body.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireRole('admin'), async function(req, res) {
  try {
    var result = await run('DELETE FROM attendance_records WHERE id = \$1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/report/:classId', authenticate, async function(req, res) {
  try {
    var startDate = req.query.start_date || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    var endDate = req.query.end_date || new Date().toISOString().split('T')[0];

    var students = await getAll(
      'SELECT s.id, s.student_id as student_roll, u.full_name FROM students s JOIN enrollments e ON s.id = e.student_id JOIN users u ON s.user_id = u.id WHERE e.class_section_id = \$1 ORDER BY u.full_name',
      [req.params.classId]
    );

    var report = [];
    for (var i = 0; i < students.length; i++) {
      var st = students[i];
      var records = await getAll(
        'SELECT status FROM attendance_records WHERE student_id=\$1 AND class_section_id=\$2 AND date BETWEEN \$3 AND \$4',
        [st.id, req.params.classId, startDate, endDate]
      );
      var total = records.length;
      var present = records.filter(function(r){return r.status==='present'||r.status==='late'}).length;
      report.push({ student_id: st.id, student_roll: st.student_roll, student_name: st.full_name, total_classes: total, present: present, absent: total - present, percentage: total > 0 ? Math.round((present/total)*100) : 0 });
    }

    res.json({ class_id: parseInt(req.params.classId), start_date: startDate, end_date: endDate, report: report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
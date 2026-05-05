const express = require('express');
const { getOne, getAll, run } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    var b = req.body;
    if (!b.class_name || !b.section || !b.subject || !b.teacher_id) {
      return res.status(400).json({ error: 'class_name, section, subject, teacher_id required' });
    }

    var teacher = await getOne('SELECT id FROM teachers WHERE id = \$1', [b.teacher_id]);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

    var result = await run(
      'INSERT INTO class_sections (class_name, section, subject, teacher_id, department, semester, schedule_day, schedule_time_start, schedule_time_end, room) VALUES (\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,\$10) RETURNING id',
      [b.class_name, b.section, b.subject, b.teacher_id, b.department||null, b.semester||null, b.schedule_day||null, b.schedule_time_start||null, b.schedule_time_end||null, b.room||null]
    );

    var cls = await getOne(
      'SELECT cs.*, u.full_name as teacher_name, (SELECT COUNT(*) FROM enrollments WHERE class_section_id = cs.id) as student_count FROM class_sections cs JOIN teachers t ON cs.teacher_id = t.id JOIN users u ON t.user_id = u.id WHERE cs.id = \$1',
      [result.rows[0].id]
    );

    res.status(201).json(cls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// IMPORTANT: /my-classes BEFORE /:id
router.get('/my-classes', authenticate, async function(req, res) {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Teachers only' });
    }

    var teacher = await getOne('SELECT id FROM teachers WHERE user_id = \$1', [req.user.id]);
    if (!teacher) return res.status(404).json({ error: 'Teacher profile not found' });

    var classes = await getAll(
      'SELECT cs.*, u.full_name as teacher_name, (SELECT COUNT(*) FROM enrollments e WHERE e.class_section_id = cs.id) as student_count FROM class_sections cs JOIN teachers t ON cs.teacher_id = t.id JOIN users u ON t.user_id = u.id WHERE cs.teacher_id = \$1 ORDER BY cs.class_name, cs.section',
      [teacher.id]
    );

    res.json({ classes: classes, total: classes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticate, async function(req, res) {
  try {
    var query = 'SELECT cs.*, u.full_name as teacher_name, (SELECT COUNT(*) FROM enrollments WHERE class_section_id = cs.id) as student_count FROM class_sections cs JOIN teachers t ON cs.teacher_id = t.id JOIN users u ON t.user_id = u.id';
    var params = [];

    if (req.query.teacher_id) {
      query += ' WHERE cs.teacher_id = \$1';
      params.push(req.query.teacher_id);
    }
    query += ' ORDER BY cs.class_name';

    var classes = await getAll(query, params);
    res.json({ classes: classes, total: classes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async function(req, res) {
  try {
    var cls = await getOne(
      'SELECT cs.*, u.full_name as teacher_name, (SELECT COUNT(*) FROM enrollments WHERE class_section_id = cs.id) as student_count FROM class_sections cs JOIN teachers t ON cs.teacher_id = t.id JOIN users u ON t.user_id = u.id WHERE cs.id = \$1',
      [req.params.id]
    );
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    res.json(cls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    var cls = await getOne('SELECT * FROM class_sections WHERE id = \$1', [req.params.id]);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    var fields = ['class_name','section','subject','teacher_id','department','semester','schedule_day','schedule_time_start','schedule_time_end','room','is_active'];
    var updates = [];
    var values = [];
    var idx = 1;

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (req.body[f] !== undefined) {
        updates.push(f + ' = $' + idx);
        values.push(req.body[f]);
        idx++;
      }
    }

    if (updates.length > 0) {
      values.push(req.params.id);
      await run('UPDATE class_sections SET ' + updates.join(', ') + ' WHERE id = $' + idx, values);
    }

    var updated = await getOne(
      'SELECT cs.*, u.full_name as teacher_name, (SELECT COUNT(*) FROM enrollments WHERE class_section_id = cs.id) as student_count FROM class_sections cs JOIN teachers t ON cs.teacher_id = t.id JOIN users u ON t.user_id = u.id WHERE cs.id = \$1',
      [req.params.id]
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireRole('admin'), async function(req, res) {
  try {
    var cls = await getOne('SELECT id FROM class_sections WHERE id = \$1', [req.params.id]);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    await run('DELETE FROM class_sections WHERE id = \$1', [req.params.id]);
    res.json({ success: true, deleted: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/students', authenticate, async function(req, res) {
  try {
    var students = await getAll(
      'SELECT s.*, u.email, u.full_name FROM students s JOIN enrollments e ON s.id = e.student_id JOIN users u ON s.user_id = u.id WHERE e.class_section_id = \$1 ORDER BY u.full_name',
      [req.params.id]
    );
    res.json({ class_id: parseInt(req.params.id), students: students, total: students.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
const express = require('express');
const { getOne, run } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    var student_ids = req.body.student_ids;
    var class_section_id = req.body.class_section_id;

    if (!student_ids || !class_section_id) {
      return res.status(400).json({ error: 'student_ids and class_section_id required' });
    }

    var cls = await getOne('SELECT id FROM class_sections WHERE id = \$1', [class_section_id]);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    var enrolled = 0;
    var skipped = 0;
    var errors = [];

    for (var i = 0; i < student_ids.length; i++) {
      var sid = student_ids[i];
      var student = await getOne('SELECT id FROM students WHERE id = \$1', [sid]);
      if (!student) {
        errors.push('Student ' + sid + ' not found');
        continue;
      }
      try {
        await run(
          'INSERT INTO enrollments (student_id, class_section_id) VALUES (\$1, \$2) ON CONFLICT DO NOTHING',
          [sid, class_section_id]
        );
        enrolled++;
      } catch(e) {
        skipped++;
      }
    }

    res.json({ success: true, enrolled: enrolled, skipped: skipped, errors: errors, class_section_id: class_section_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    var result = await run(
      'DELETE FROM enrollments WHERE student_id = \$1 AND class_section_id = \$2',
      [req.body.student_id, req.body.class_section_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Enrollment not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
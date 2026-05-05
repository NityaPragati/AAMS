const express = require('express');
const { getOne, getAll } = require('../database/db');
const aiService = require('../services/aiService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', authenticate, async function(req, res) {
  try {
    var today = new Date().toISOString().split('T')[0];

    var ts = await getOne('SELECT COUNT(*) as c FROM students');
    var tt = await getOne('SELECT COUNT(*) as c FROM teachers');
    var tc = await getOne('SELECT COUNT(*) as c FROM class_sections');
    var fr = await getOne('SELECT COUNT(*) as c FROM students WHERE face_registered = true');
    var tp = await getOne("SELECT COUNT(*) as c FROM attendance_records WHERE date = \$1 AND status = 'present'", [today]);
    var tto = await getOne('SELECT COUNT(*) as c FROM attendance_records WHERE date = \$1', [today]);
    var tpn = await getOne("SELECT COUNT(*) as c FROM attendance_records WHERE date = \$1 AND status = 'pending_review'", [today]);

    var aiStatus = await aiService.healthCheck();

    res.json({
      students: { total: parseInt(ts.c), face_registered: parseInt(fr.c), face_not_registered: parseInt(ts.c) - parseInt(fr.c) },
      teachers: { total: parseInt(tt.c) },
      classes: { total: parseInt(tc.c) },
      today: { date: today, total_records: parseInt(tto.c), present: parseInt(tp.c), pending_review: parseInt(tpn.c) },
      ai_service: { status: aiStatus.status || 'unknown', registered_faces: aiStatus.registered || 0 }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/recent', authenticate, async function(req, res) {
  try {
    var limit = parseInt(req.query.limit) || 20;
    var records = await getAll(
      'SELECT ar.*, s.student_id as student_roll, u.full_name as student_name, cs.class_name, cs.section FROM attendance_records ar JOIN students s ON ar.student_id = s.id JOIN users u ON s.user_id = u.id JOIN class_sections cs ON ar.class_section_id = cs.id ORDER BY ar.marked_at DESC LIMIT \$1',
      [limit]
    );
    res.json({ records: records, total: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pending', authenticate, async function(req, res) {
  try {
    var records = await getAll(
      "SELECT ar.*, s.student_id as student_roll, u.full_name as student_name, cs.class_name, cs.section FROM attendance_records ar JOIN students s ON ar.student_id = s.id JOIN users u ON s.user_id = u.id JOIN class_sections cs ON ar.class_section_id = cs.id WHERE ar.status = 'pending_review' ORDER BY ar.marked_at DESC"
    );
    res.json({ records: records, total: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
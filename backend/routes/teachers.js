const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, getOne, getAll, run } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, requireRole('admin'), async function(req, res) {
  var client = await pool.connect();
  try {
    var email = req.body.email;
    var password = req.body.password;
    var full_name = req.body.full_name;
    var teacher_id = req.body.teacher_id;
    var department = req.body.department;
    var designation = req.body.designation;

    if (!email || !password || !full_name || !teacher_id) {
      return res.status(400).json({ error: 'email, password, full_name, teacher_id required' });
    }

    if (await getOne('SELECT id FROM users WHERE email = \$1', [email])) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    var hash = bcrypt.hashSync(password, 10);

    await client.query('BEGIN');

    var u = await client.query(
      "INSERT INTO users (email, password, full_name, role) VALUES (\$1, \$2, \$3, 'teacher') RETURNING id",
      [email, hash, full_name]
    );

    var t = await client.query(
      'INSERT INTO teachers (user_id, teacher_id, department, designation) VALUES (\$1, \$2, \$3, \$4) RETURNING id',
      [u.rows[0].id, teacher_id, department || null, designation || null]
    );

    await client.query('COMMIT');

    var teacher = await getOne(
      'SELECT t.*, u.email, u.full_name FROM teachers t JOIN users u ON t.user_id = u.id WHERE t.id = \$1',
      [t.rows[0].id]
    );

    res.status(201).json(teacher);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get('/', authenticate, async function(req, res) {
  try {
    var teachers = await getAll(
      'SELECT t.*, u.email, u.full_name FROM teachers t JOIN users u ON t.user_id = u.id ORDER BY u.full_name'
    );
    res.json({ teachers: teachers, total: teachers.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async function(req, res) {
  try {
    var teacher = await getOne(
      'SELECT t.*, u.email, u.full_name FROM teachers t JOIN users u ON t.user_id = u.id WHERE t.id = \$1',
      [req.params.id]
    );
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
    res.json(teacher);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireRole('admin'), async function(req, res) {
  try {
    var teacher = await getOne('SELECT * FROM teachers WHERE id = \$1', [req.params.id]);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
    await run('DELETE FROM users WHERE id = \$1', [teacher.user_id]);
    res.json({ success: true, deleted: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
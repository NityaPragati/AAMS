const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, getOne, getAll, run } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  var client = await pool.connect();
  try {
    var email = req.body.email;
    var password = req.body.password;
    var full_name = req.body.full_name;
    var student_id = req.body.student_id;
    var department = req.body.department;
    var semester = req.body.semester;

    if (!email || !password || !full_name || !student_id) {
      return res.status(400).json({ error: 'email, password, full_name, student_id required' });
    }

    if (await getOne('SELECT id FROM users WHERE email = \$1', [email])) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    if (await getOne('SELECT id FROM students WHERE student_id = \$1', [student_id])) {
      return res.status(400).json({ error: 'Student ID already exists' });
    }

    var hash = bcrypt.hashSync(password, 10);

    await client.query('BEGIN');

    var userResult = await client.query(
      "INSERT INTO users (email, password, full_name, role) VALUES (\$1, \$2, \$3, 'student') RETURNING id",
      [email, hash, full_name]
    );

    var studentResult = await client.query(
      'INSERT INTO students (user_id, student_id, department, semester) VALUES (\$1, \$2, \$3, \$4) RETURNING id',
      [userResult.rows[0].id, student_id, department || null, semester || null]
    );

    await client.query('COMMIT');

    var student = await getOne(
      'SELECT s.*, u.email, u.full_name FROM students s JOIN users u ON s.user_id = u.id WHERE s.id = \$1',
      [studentResult.rows[0].id]
    );

    res.status(201).json(student);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get('/', authenticate, async function(req, res) {
  try {
    var query = 'SELECT s.*, u.email, u.full_name FROM students s JOIN users u ON s.user_id = u.id';
    var params = [];
    var conditions = [];
    var idx = 1;

    if (req.query.department) {
      conditions.push('s.department = $' + idx);
      params.push(req.query.department);
      idx++;
    }
    if (req.query.semester) {
      conditions.push('s.semester = $' + idx);
      params.push(parseInt(req.query.semester));
      idx++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY u.full_name';

    var students = await getAll(query, params);
    res.json({ students: students, total: students.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async function(req, res) {
  try {
    var student = await getOne(
      'SELECT s.*, u.email, u.full_name FROM students s JOIN users u ON s.user_id = u.id WHERE s.id = \$1',
      [req.params.id]
    );
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    var student = await getOne('SELECT * FROM students WHERE id = \$1', [req.params.id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (req.body.full_name) {
      await run('UPDATE users SET full_name = \$1, updated_at = CURRENT_TIMESTAMP WHERE id = \$2',
        [req.body.full_name, student.user_id]);
    }

    await run(
      'UPDATE students SET department = COALESCE(\$1, department), semester = COALESCE(\$2, semester) WHERE id = \$3',
      [req.body.department || null, req.body.semester || null, req.params.id]
    );

    var updated = await getOne(
      'SELECT s.*, u.email, u.full_name FROM students s JOIN users u ON s.user_id = u.id WHERE s.id = \$1',
      [req.params.id]
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireRole('admin'), async function(req, res) {
  try {
    var student = await getOne('SELECT * FROM students WHERE id = \$1', [req.params.id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    await run('DELETE FROM users WHERE id = \$1', [student.user_id]);
    res.json({ success: true, deleted: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
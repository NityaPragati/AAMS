const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getOne, run } = require('../database/db');
const config = require('../config');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async function(req, res) {
  try {
    var email = req.body.email;
    var password = req.body.password;
    var full_name = req.body.full_name;
    var role = req.body.role;

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'email, password, full_name required' });
    }

    var existing = await getOne('SELECT id FROM users WHERE email = \$1', [email]);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    var hash = bcrypt.hashSync(password, 10);
    var validRole = ['admin', 'teacher', 'student'].indexOf(role) !== -1 ? role : 'student';

    var result = await run(
      'INSERT INTO users (email, password, full_name, role) VALUES (\$1, \$2, \$3, \$4) RETURNING *',
      [email, hash, full_name, validRole]
    );

    var user = result.rows[0];
    var token = jwt.sign({ id: user.id, role: user.role }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

    res.status(201).json({
      access_token: token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async function(req, res) {
  try {
    var email = req.body.email;
    var password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    var user = await getOne('SELECT * FROM users WHERE email = \$1', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!user.is_active) return res.status(403).json({ error: 'Account deactivated' });

    var token = jwt.sign({ id: user.id, role: user.role }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

    var userData = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role
    };

    if (user.role === 'teacher') {
      var teacher = await getOne('SELECT * FROM teachers WHERE user_id = \$1', [user.id]);
      if (teacher) {
        userData.teacher_id = teacher.teacher_id;
        userData.teacher_record_id = teacher.id;
        userData.department = teacher.department;
        userData.designation = teacher.designation;
      }
    }

    if (user.role === 'student') {
      var student = await getOne('SELECT * FROM students WHERE user_id = \$1', [user.id]);
      if (student) {
        userData.student_id = student.student_id;
        userData.student_record_id = student.id;
        userData.department = student.department;
        userData.semester = student.semester;
        userData.face_registered = student.face_registered;
      }
    }

    res.json({ access_token: token, user: userData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authenticate, async function(req, res) {
  try {
    var userData = {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.full_name,
      role: req.user.role,
      is_active: req.user.is_active
    };

    if (req.user.role === 'teacher') {
      var teacher = await getOne('SELECT * FROM teachers WHERE user_id = \$1', [req.user.id]);
      if (teacher) {
        userData.teacher_id = teacher.teacher_id;
        userData.teacher_record_id = teacher.id;
        userData.department = teacher.department;
      }
    }

    if (req.user.role === 'student') {
      var student = await getOne('SELECT * FROM students WHERE user_id = \$1', [req.user.id]);
      if (student) {
        userData.student_id = student.student_id;
        userData.student_record_id = student.id;
        userData.department = student.department;
        userData.semester = student.semester;
        userData.face_registered = student.face_registered;
      }
    }

    res.json(userData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
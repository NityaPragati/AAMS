const { pool, getOne, run, testConnection } = require('./db');
const bcrypt = require('bcryptjs');
const config = require('../config');

async function initializeDatabase() {
  console.log('[DB] Initializing...');

  const connected = await testConnection();
  if (!connected) {
    throw new Error('Cannot connect to PostgreSQL');
  }

  const client = await pool.connect();

  try {
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('[DB] pgvector enabled');
    } catch (err) {
      console.warn('[DB] pgvector not available:', err.message);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('admin','teacher','student')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[DB] users table OK');

    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        student_id TEXT UNIQUE NOT NULL,
        department TEXT,
        semester INTEGER,
        face_registered BOOLEAN DEFAULT false,
        face_samples INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { await client.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS face_encoding TEXT'); } catch(e) {}
    console.log('[DB] students table OK');

    await client.query(`
      CREATE TABLE IF NOT EXISTS teachers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        teacher_id TEXT UNIQUE NOT NULL,
        department TEXT,
        designation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[DB] teachers table OK');

    await client.query(`
      CREATE TABLE IF NOT EXISTS class_sections (
        id SERIAL PRIMARY KEY,
        class_name TEXT NOT NULL,
        section TEXT NOT NULL,
        subject TEXT NOT NULL,
        teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        department TEXT,
        semester INTEGER,
        schedule_day TEXT,
        schedule_time_start TEXT,
        schedule_time_end TEXT,
        room TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[DB] class_sections table OK');

    await client.query(`
      CREATE TABLE IF NOT EXISTS enrollments (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        class_section_id INTEGER NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, class_section_id)
      )
    `);
    console.log('[DB] enrollments table OK');

    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        class_section_id INTEGER NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'absent' CHECK(status IN ('present','absent','late','pending_review')),
        confidence_score REAL,
        cosine_similarity REAL,
        liveness_score REAL,
        pose_yaw REAL,
        pose_pitch REAL,
        pose_roll REAL,
        is_frontal TEXT,
        decision TEXT,
        processing_time_ms REAL,
        marked_by TEXT DEFAULT 'ai',
        notes TEXT,
        face_embedding TEXT,
        marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, class_section_id, date)
      )
    `);
    console.log('[DB] attendance_records table OK');

    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_qr_sessions (
        id SERIAL PRIMARY KEY,
        class_section_id INTEGER NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
        teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        token_hash TEXT UNIQUE NOT NULL,
        display_code TEXT UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )
    `);
    console.log('[DB] attendance_qr_sessions table OK');

    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_qr_scans (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES attendance_qr_sessions(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        attendance_record_id INTEGER REFERENCES attendance_records(id) ON DELETE SET NULL,
        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, student_id)
      )
    `);
    console.log('[DB] attendance_qr_scans table OK');

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS face_embeddings (
          id SERIAL PRIMARY KEY,
          student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          embedding TEXT NOT NULL,
          sample_number INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[DB] face_embeddings table OK');
    } catch(e) {
      console.log('[DB] face_embeddings skipped');
    }

    await client.query('CREATE INDEX IF NOT EXISTS idx_att_date ON attendance_records(date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_att_student ON attendance_records(student_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_att_class ON attendance_records(class_section_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_qr_session_class ON attendance_qr_sessions(class_section_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_qr_session_expiry ON attendance_qr_sessions(expires_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_qr_scan_session ON attendance_qr_scans(session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_qr_scan_student ON attendance_qr_scans(student_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stu_sid ON students(student_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_usr_email ON users(email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_enr_class ON enrollments(class_section_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_enr_student ON enrollments(student_id)');
    console.log('[DB] indexes OK');

    var adminExists = await client.query('SELECT id FROM users WHERE email = \$1', [config.DEFAULT_ADMIN_EMAIL]);
    if (adminExists.rows.length === 0) {
      var hash = bcrypt.hashSync(config.DEFAULT_ADMIN_PASSWORD, 10);
      await client.query(
        'INSERT INTO users (email, password, full_name, role) VALUES (\$1, \$2, \$3, \$4)',
        [config.DEFAULT_ADMIN_EMAIL, hash, 'System Admin', 'admin']
      );
      console.log('[DB] Admin created: ' + config.DEFAULT_ADMIN_EMAIL);
    } else {
      console.log('[DB] Admin exists');
    }

    console.log('[DB] Database ready!');
  } catch (err) {
    console.error('[DB] Init error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initializeDatabase };

const express = require('express');
const cors = require('cors');
const config = require('./config');
const { initializeDatabase } = require('./database/init');

const app = express();

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || config.CORS_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS blocked'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/enrollment', require('./routes/enrollment'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/face', require('./routes/face'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Root
app.get('/', (req, res) => {
  res.json({
    service: 'Face Attendance System — Backend API',
    version: '2.0.0',
    database: 'PostgreSQL + pgvector'
  });
});

// Health check
app.get('/health', async (req, res) => {
  const aiService = require('./services/aiService');
  const { getOne } = require('./database/db');

  let dbStatus = 'offline';
  try {
    await getOne('SELECT 1 as ok');
    dbStatus = 'operational';
  } catch {
    dbStatus = 'offline';
  }

  const aiStatus = await aiService.healthCheck();

  res.json({
    backend: 'operational',
    database: dbStatus,
    database_type: 'postgresql',
    ai_service: aiStatus.status || 'unknown',
    ai_faces: aiStatus.registered || 0
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

// Start
async function startServer() {
  try {
    await initializeDatabase();

    app.listen(config.PORT, () => {
      console.log();
      console.log('='.repeat(55));
      console.log('  FACE ATTENDANCE SYSTEM — BACKEND');
      console.log(`  Server:   http://localhost:${config.PORT}`);
      console.log(`  Health:   http://localhost:${config.PORT}/health`);
      console.log(`  Database: PostgreSQL + pgvector`);
      console.log(`  DB Name:  ${config.DB.database}`);
      console.log();
      console.log('  Make sure AI service is running:');
      console.log('  cd .. && python run.py');
      console.log('='.repeat(55));
      console.log();
    });
  } catch (err) {
    console.error('[FATAL] Failed to start:', err.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;
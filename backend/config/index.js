require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 8000,
  JWT_SECRET: process.env.JWT_SECRET || 'fallback-secret-key',
  JWT_EXPIRES_IN: '8h',
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://localhost:8001',
  DEFAULT_ADMIN_EMAIL: process.env.DEFAULT_ADMIN_EMAIL || 'admin@attendance.com',
  DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
  CORS_ORIGINS: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'https://aams-psi.vercel.app'
  ],
  // PostgreSQL config — supports both individual fields AND connection string
  DB: {
    connectionString: process.env.DATABASE_URL || null,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'face_attendance',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  }
};
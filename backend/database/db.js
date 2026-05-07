const { Pool } = require('pg');
const config = require('../config');

let poolConfig;

if (config.DB.connectionString) {
  poolConfig = {
  connectionString: config.DB.connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
  };
  console.log('[DB] Using DATABASE_URL connection string');
} else {
  poolConfig = {
    host: config.DB.host,
    port: config.DB.port,
    database: config.DB.database,
    user: config.DB.user,
    password: config.DB.password,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  };
  console.log('[DB] Connecting to ' + config.DB.host + ':' + config.DB.port + '/' + config.DB.database);
}

const pool = new Pool(poolConfig);

pool.on('error', function(err) {
  console.error('[DB] Pool error:', err.message);
});

const getOne = async function(text, params) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
};

const getAll = async function(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
};

const run = async function(text, params) {
  const result = await pool.query(text, params);
  return result;
};

const testConnection = async function() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW() as now');
    client.release();
    console.log('[DB] Connection OK at ' + res.rows[0].now);
    return true;
  } catch (err) {
    console.error('[DB] Connection FAILED:', err.message);
    return false;
  }
};

module.exports = { pool, getOne, getAll, run, testConnection };
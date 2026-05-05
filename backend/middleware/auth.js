const jwt = require('jsonwebtoken');
const config = require('../config');
const { getOne } = require('../database/db');

async function authenticate(req, res, next) {
  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  var token = authHeader.split(' ')[1];

  try {
    var decoded = jwt.verify(token, config.JWT_SECRET);
    var user = await getOne('SELECT * FROM users WHERE id = \$1', [decoded.id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.is_active) return res.status(403).json({ error: 'Account deactivated' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole() {
  var roles = Array.prototype.slice.call(arguments);
  return function(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (roles.indexOf(req.user.role) === -1) {
      return res.status(403).json({ error: 'Requires role: ' + roles.join(' or ') });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
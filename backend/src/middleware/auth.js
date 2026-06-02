'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

/**
 * Require a valid JWT. Attaches req.user (the User document) on success.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Require the authenticated user to be an admin. Must run after requireAuth.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

module.exports = { requireAuth, requireAdmin, signToken };

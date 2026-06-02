'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { requireAuth, signToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login -> { token, user }
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    const user = await User.findOne({ username: username.trim() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken(user);
    res.json({ token, user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me -> current user
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

module.exports = router;

'use strict';

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const requirementRoutes = require('./routes/requirements');
const annotationRoutes = require('./routes/annotations');
const adminRoutes = require('./routes/admin');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/requirements', requirementRoutes);
  app.use('/api/annotations', annotationRoutes);
  app.use('/api/admin', adminRoutes);

  // 404
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Central error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

module.exports = createApp;

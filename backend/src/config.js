'use strict';

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 4000,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/rimay_annotation',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-a-real-deployment',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

module.exports = config;

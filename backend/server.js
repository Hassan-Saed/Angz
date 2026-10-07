/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('node:path');

const app = express();

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const { rateLimit } = require('./utils/rate-limit');
const storage = require('./utils/storage');

// Credential endpoints get a tighter budget than the rest of the API.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Please try again in a few minutes.',
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please try again later.',
});

// Routes.
// The reset limiter is mounted before the routers so it actually wraps the
// handler; middleware registered afterwards would never run for it.
app.use('/api/v1/auth/forgot-password', resetLimiter);
// Mount the credential limiter per endpoint, not on the whole `/auth` prefix.
  // On the prefix it also throttled profile reads, avatar uploads and settings
  // saves, so a handful of normal actions locked the user out with a 429.
  app.use('/api/v1/auth/login', credentialLimiter);
  app.use('/api/v1/auth/register', credentialLimiter);
  app.use('/api/v1/auth/google', credentialLimiter);
  app.use('/api/v1/auth', require('./routes/auth'));
  app.use('/api/v1/auth', require('./routes/profile'));
app.use('/api/v1/tasks', require('./routes/tasks'));
app.use('/api/v1/ai', require('./routes/ai'));
app.use('/api/v1/analytics', require('./routes/analytics'));

// Uploaded images. Served from outside the web root with an explicit
// content-type allow-list and `nosniff`, so an attacker cannot upload an HTML
// or SVG file and have it execute on this origin.
app.use(
  '/uploads',
  express.static(storage.UPLOAD_ROOT, {
    index: false,
    dotfiles: 'deny',
    maxAge: '7d',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    },
  }),
);

// Root & Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Angz Backend API', timestamp: new Date().toISOString() });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Multer surfaces size violations with a code; translate to a clean message.
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Image is too large' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }

  console.error('API Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Angz Backend API running on http://127.0.0.1:${PORT}`);
  console.log(`📁 Uploads served from ${storage.UPLOAD_ROOT}`);
});
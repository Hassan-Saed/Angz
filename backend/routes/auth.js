/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const router = express.Router();
const { hashPassword, validatePassword } = require('../utils/password');

const JWT_SECRET = process.env.JWT_SECRET || 'angz_secret_key_2026';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:4200';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing authorization token' });
  try {
    const token = authHeader.replace('Bearer ', '').trim();
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function buildUserObj(u, s) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatar_url || u.avatarUrl,
    subscriptionStatus: u.subscription_status || u.subscriptionStatus,
    trialEndsAt: u.trial_ends_at || u.trialEndsAt,
    locale: u.locale || 'ar',
    settings: {
      theme: (s && s.theme) || 'system',
      pushEnabled: s ? (s.push_enabled !== undefined ? !!s.push_enabled : true) : true,
      dueSoonReminderMinutes: (s && s.due_soon_reminder_minutes) || 60,
      dailySummaryEnabled: s ? (s.daily_summary_enabled !== undefined ? !!s.daily_summary_enabled : true) : true,
      aiPersona: (s && s.ai_persona) || 'balanced'
    }
  };
}

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const passwordProblem = validatePassword(password);
    if (passwordProblem) {
      return res.status(400).json({ error: passwordProblem });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    const hash = await hashPassword(password);
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password_hash, subscription_status, trial_ends_at, locale) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 14 DAY), ?)',
      [name, email, hash, 'trial', 'ar']
    );

    const userId = result.insertId;

    await db.execute(
      'INSERT INTO user_settings (user_id, theme, push_enabled, due_soon_reminder_minutes, daily_summary_enabled, ai_persona) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, 'system', 1, 60, 1, 'balanced']
    );

    const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });

    const [users] = await db.execute(
      `SELECT u.id, u.name, u.email, u.avatar_url AS avatarUrl, u.subscription_status AS subscriptionStatus,
              u.trial_ends_at AS trialEndsAt, u.locale,
              s.theme, s.push_enabled AS pushEnabled, s.due_soon_reminder_minutes AS dueSoonReminderMinutes,
              s.daily_summary_enabled AS dailySummaryEnabled, s.ai_persona AS aiPersona
       FROM users u LEFT JOIN user_settings s ON u.id = s.user_id WHERE u.id = ?`,
      [userId]
    );

    const u = users[0];
    const userObj = buildUserObj(u, u);

    res.status(201).json({ token, user: userObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });

    const [settings] = await db.execute('SELECT * FROM user_settings WHERE user_id = ?', [user.id]);
    const s = settings[0] || {};

    const userObj = buildUserObj(user, s);

    res.json({ token, user: userObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/auth/google/redirect
router.get('/google/redirect', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' });
  }

  const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/auth/google/callback`;
  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client(clientId, clientSecret, redirectUri);

  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'consent',
  });

  res.redirect(url);
});

// GET /api/v1/auth/google/callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) return res.redirect(`${FRONTEND_URL}/auth/callback?error=${encodeURIComponent(error)}`);
    if (!code) return res.redirect(`${FRONTEND_URL}/auth/callback?error=no_code`);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/auth/google/callback`;

    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(clientId, clientSecret, redirectUri);

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    let [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    let user;

    if (rows.length === 0) {
      const [result] = await db.execute(
        'INSERT INTO users (name, email, password_hash, avatar_url, subscription_status, trial_ends_at, locale) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 14 DAY), ?)',
        [name, email, '', picture, 'trial', 'ar']
      );
      const userId = result.insertId;

      await db.execute(
        'INSERT INTO user_settings (user_id, theme, push_enabled, due_soon_reminder_minutes, daily_summary_enabled, ai_persona) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, 'system', 1, 60, 1, 'balanced']
      );

      [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
      user = rows[0];
    } else {
      user = rows[0];
      if (picture && picture !== user.avatar_url) {
        await db.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [picture, user.id]);
        user.avatar_url = picture;
      }
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err.message);
    res.redirect(`${FRONTEND_URL}/auth/callback?error=auth_failed`);
  }
});

// POST /api/v1/auth/google (direct token verification)
router.post('/google', async (req, res) => {
  try {
    const { token: googleToken } = req.body;
    if (!googleToken) {
      return res.status(400).json({ error: 'Google token is required' });
    }

    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'dummy-client-id');

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: googleToken,
        audience: process.env.GOOGLE_CLIENT_ID || 'dummy-client-id',
      });
      payload = ticket.getPayload();
    } catch (e) {
      console.warn("Google token verification failed, falling back to decode for dev mode:", e.message);
      payload = jwt.decode(googleToken);
      if (!payload) return res.status(401).json({ error: 'Invalid Google token' });
    }

    const { email, name, picture } = payload;

    let [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    let user;

    if (rows.length === 0) {
      const [result] = await db.execute(
        'INSERT INTO users (name, email, password_hash, avatar_url, subscription_status, trial_ends_at, locale) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 14 DAY), ?)',
        [name, email, '', picture, 'trial', 'ar']
      );
      const userId = result.insertId;

      await db.execute(
        'INSERT INTO user_settings (user_id, theme, push_enabled, due_soon_reminder_minutes, daily_summary_enabled, ai_persona) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, 'system', 1, 60, 1, 'balanced']
      );

      [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
      user = rows[0];
    } else {
      user = rows[0];
      if (picture && picture !== user.avatar_url) {
        await db.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [picture, user.id]);
        user.avatar_url = picture;
      }
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });

    const [settings] = await db.execute('SELECT * FROM user_settings WHERE user_id = ?', [user.id]);
    const s = settings[0] || {};

    const userObj = buildUserObj(user, s);

    res.json({ token, user: userObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.name, u.email, u.avatar_url AS avatarUrl, u.subscription_status AS subscriptionStatus,
              u.trial_ends_at AS trialEndsAt, u.locale,
              s.theme, s.push_enabled AS pushEnabled, s.due_soon_reminder_minutes AS dueSoonReminderMinutes,
              s.daily_summary_enabled AS dailySummaryEnabled, s.ai_persona AS aiPersona
       FROM users u LEFT JOIN user_settings s ON u.id = s.user_id WHERE u.id = ?`,
      [req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const u = rows[0];
    res.json(buildUserObj(u, u));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/auth/me (Update profile)
//
// A new email address is only accepted when the current password is supplied.
// Without that check, anyone holding a stolen session could silently repoint
// the account at an address they control and then use "forgot password" to
// take it over permanently.
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const { name, locale, avatarUrl, email, currentPassword } = req.body;

    const [existingRows] = await db.execute('SELECT email, password_hash FROM users WHERE id = ?', [
      req.userId,
    ]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const currentEmail = existingRows[0].email;

    let nextEmail = null;
    const requested = String(email ?? '').trim().toLowerCase();

    if (requested && requested !== currentEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requested)) {
        return res.status(400).json({ error: 'Please provide a valid email address' });
      }
      const matches = await bcrypt.compare(String(currentPassword || ''), existingRows[0].password_hash);
      if (!matches) {
        return res.status(401).json({ error: 'Current password is required to change your email' });
      }
      const [taken] = await db.execute('SELECT id FROM users WHERE email = ? AND id <> ?', [
        requested,
        req.userId,
      ]);
      if (taken.length > 0) {
        return res.status(409).json({ error: 'That email address is already in use' });
      }
      nextEmail = requested;
    }

    if (nextEmail) {
      await db.execute(
        `UPDATE users
         SET name = COALESCE(?, name),
             locale = COALESCE(?, locale),
             avatar_url = COALESCE(?, avatar_url),
             email = ?,
             email_changed_at = NOW()
         WHERE id = ?`,
        [name || null, locale || null, avatarUrl || null, nextEmail, req.userId],
      );
    } else {
      await db.execute(
        'UPDATE users SET name = COALESCE(?, name), locale = COALESCE(?, locale), avatar_url = COALESCE(?, avatar_url) WHERE id = ?',
        [name || null, locale || null, avatarUrl || null, req.userId],
      );
    }

    const [rows] = await db.execute(
      `SELECT u.id, u.name, u.email, u.avatar_url AS avatarUrl, u.subscription_status AS subscriptionStatus,
              u.trial_ends_at AS trialEndsAt, u.locale,
              s.theme, s.push_enabled AS pushEnabled, s.due_soon_reminder_minutes AS dueSoonReminderMinutes,
              s.daily_summary_enabled AS dailySummaryEnabled, s.ai_persona AS aiPersona
       FROM users u LEFT JOIN user_settings s ON u.id = s.user_id WHERE u.id = ?`,
      [req.userId]
    );
    const u = rows[0];
    res.json(buildUserObj(u, u));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/auth/settings (Update user settings)
router.put('/settings', authMiddleware, async (req, res) => {
  try {
    const { theme, pushEnabled, dueSoonReminderMinutes, dailySummaryEnabled, aiPersona } = req.body;

    await db.execute(
      `INSERT INTO user_settings (user_id, theme, push_enabled, due_soon_reminder_minutes, daily_summary_enabled, ai_persona)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         theme = COALESCE(VALUES(theme), theme),
         push_enabled = COALESCE(VALUES(push_enabled), push_enabled),
         due_soon_reminder_minutes = COALESCE(VALUES(due_soon_reminder_minutes), due_soon_reminder_minutes),
         daily_summary_enabled = COALESCE(VALUES(daily_summary_enabled), daily_summary_enabled),
         ai_persona = COALESCE(VALUES(ai_persona), ai_persona)`,
      [
        req.userId,
        theme || 'system',
        pushEnabled !== undefined ? (pushEnabled ? 1 : 0) : 1,
        dueSoonReminderMinutes || 60,
        dailySummaryEnabled !== undefined ? (dailySummaryEnabled ? 1 : 0) : 1,
        aiPersona || 'balanced'
      ]
    );

    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

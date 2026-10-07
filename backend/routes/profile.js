/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
const express = require('express');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const db = require('../db');
const storage = require('../utils/storage');
const mailer = require('../utils/mailer');
const { hashPassword, validatePassword } = require('../utils/password');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'angz_secret_key_2026';
const RESET_TTL_MINUTES = 30;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(header.replace('Bearer ', '').trim(), JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Hashes a reset token for storage. The plaintext is emailed, never stored. */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Uniform response so the endpoint cannot be used to enumerate accounts. */
function genericForgotResponse(res) {
  res.json({
    message: 'If an account exists for that address, a reset link has been sent.',
  });
}

/* ------------------------------------------------------------------ *
 * POST /api/v1/auth/forgot-password   { email, locale }
 *
 * Always responds identically whether or not the address exists, so the
 * endpoint cannot be used to discover registered emails.
 * ------------------------------------------------------------------ */
router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const locale = req.body?.locale === 'ar' ? 'ar' : 'en';

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const [rows] = await db.execute('SELECT id, name, email FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return genericForgotResponse(res);
    }

    const user = rows[0];

    // Any previously issued token stops working as soon as a new one is
    // created, so only the newest link is ever valid.
    await db.execute(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [user.id],
    );

    const token = crypto.randomBytes(32).toString('hex');

    await db.execute(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
      [user.id, hashToken(token), RESET_TTL_MINUTES],
    );

    const base = process.env.FRONTEND_URL || 'http://127.0.0.1:4200';
    const link = `${base}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;

    const result = await mailer.sendPasswordReset({
      to: user.email,
      name: user.name,
      link,
      locale,
    });

    if (!result.sent) {
      // Honest failure rather than telling the user to check an inbox that
      // will never receive mail. The server log records why.
      console.error(`[auth] password reset not delivered: ${result.reason}`);
      return res.status(503).json({
        error:
          result.reason === 'smtp_not_configured'
            ? 'Password reset email is not configured on this server.'
            : 'Could not send the reset email. Please try again later.',
      });
    }

    return genericForgotResponse(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ *
 * POST /api/v1/auth/reset-password   { token, password }
 * ------------------------------------------------------------------ */
router.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }

  const problem = validatePassword(password);
  if (problem) {
    return res.status(400).json({ error: problem });
  }

  try {
    const [rows] = await db.execute(
      `SELECT id, user_id FROM password_resets
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
      [hashToken(token)],
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    const record = rows[0];

    const newHash = await hashPassword(password);
    await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, record.user_id]);

    // Burn every outstanding token for the account.
    await db.execute(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [record.user_id],
    );

    const jwtToken = jwt.sign({ id: record.user_id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ message: 'Password updated successfully.', token: jwtToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ *
 * PUT /api/v1/auth/password  { currentPassword, newPassword }
 * ------------------------------------------------------------------ */
router.put('/password', auth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  const problem = validatePassword(newPassword);
  if (problem) {
    return res.status(400).json({ error: problem });
  }

  try {
    const [rows] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [req.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const matches = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [
      await hashPassword(newPassword),
      req.userId,
    ]);

    // Changing the password invalidates any outstanding reset links.
    await db.execute(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [req.userId],
    );

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ *
 * Avatar upload
 *
 * `memoryStorage` keeps the buffer in memory so the bytes can be checked
 * before anything touches the disk; the size cap is enforced there too.
 * ------------------------------------------------------------------ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: storage.KINDS.avatar.maxBytes, files: 1 },
});

router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image was uploaded' });
  }

  let stored;
  try {
    stored = storage.storeImage({
      buffer: req.file.buffer,
      kind: 'avatar',
      originalName: req.file.originalname,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  try {
    // Record the previous avatar so it can be cleaned up after the swap.
    const [previous] = await db.execute(
      "SELECT stored_name FROM media WHERE user_id = ? AND kind = 'avatar' ORDER BY id DESC LIMIT 1",
      [req.userId],
    );

    await db.execute('DELETE FROM media WHERE user_id = ? AND kind = ?', [req.userId, 'avatar']);
    await db.execute(
      'INSERT INTO media (user_id, kind, original_name, stored_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
      [req.userId, 'avatar', stored.originalName, stored.storedName, stored.mimeType, stored.sizeBytes],
    );

    const url = storage.publicUrl(stored.storedName);
    await db.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [url, req.userId]);

    // Only delete the old file once the new record is committed, so a failure
    // here can never leave the account without a working avatar.
    if (previous[0]?.stored_name) {
      storage.removeStored(previous[0].stored_name);
    }

    res.status(201).json({ avatarUrl: url, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes });
  } catch (err) {
    storage.removeStored(stored.storedName);
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ *
 * DELETE /api/v1/auth/avatar
 * ------------------------------------------------------------------ */
router.delete('/avatar', auth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT stored_name FROM media WHERE user_id = ? AND kind = 'avatar'",
      [req.userId],
    );
    await db.execute("DELETE FROM media WHERE user_id = ? AND kind = 'avatar'", [req.userId]);
    await db.execute('UPDATE users SET avatar_url = NULL WHERE id = ?', [req.userId]);
    for (const row of rows) {
      storage.removeStored(row.stored_name);
    }
    res.json({ message: 'Avatar removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
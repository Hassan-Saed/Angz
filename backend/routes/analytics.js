/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'angz_secret_key_2026';

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing token' });
  try {
    const token = authHeader.replace('Bearer ', '').trim();
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /api/v1/analytics/summary
router.get('/summary', auth, async (req, res) => {
  try {
    const [tasks] = await db.execute('SELECT status, priority, completed_at FROM tasks WHERE user_id = ?', [req.userId]);

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'done').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const todo = tasks.filter(t => t.status === 'todo').length;
    const archived = tasks.filter(t => t.status === 'archived').length;

    const urgent = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;
    const high = tasks.filter(t => t.priority === 'high').length;
    const medium = tasks.filter(t => t.priority === 'medium').length;
    const low = tasks.filter(t => t.priority === 'low').length;

    const todayStr = new Date().toDateString();
    const completedToday = tasks.filter(t => t.completed_at && new Date(t.completed_at).toDateString() === todayStr).length;

    const completionRatio = total > 0 ? Math.round((completed / (total - archived || 1)) * 100) : 0;

    res.json({
      total,
      completed,
      inProgress,
      todo,
      archived,
      urgent,
      high,
      medium,
      low,
      completedToday,
      completionRatio
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

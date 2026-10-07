/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');
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

function mapTaskFromDb(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: decrypt(row.title),
    description: row.description ? decrypt(row.description) : null,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date ? new Date(row.due_date).toISOString().split('T')[0] : null,
    position: row.position || 0,
    mediaUrl: row.media_url || null,
    mediaName: row.media_name || null,
    mediaSizeBytes: row.media_size_bytes || null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  };
}

// GET /api/v1/tasks
router.get('/', auth, async (req, res) => {
  try {
    const { status, priority, search } = req.query;
    let query = 'SELECT * FROM tasks WHERE user_id = ?';
    const params = [req.userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (priority) {
      query += ' AND priority = ?';
      params.push(priority);
    }
    if (search) {
      query += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await db.execute(query, params);
    const mapped = rows.map(mapTaskFromDb);
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/tasks
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, due_date, dueDate, priority, status } = req.body;
    const finalDueDate = dueDate || due_date || null;
    const finalStatus = status || 'todo';
    const finalPriority = priority || 'medium';

    const encryptedTitle = encrypt(title || 'مهمة جديدة');
    const encryptedDesc = description ? encrypt(description) : null;

    const [result] = await db.execute(
      'INSERT INTO tasks (user_id, title, description, due_date, priority, status) VALUES (?, ?, ?, ?, ?, ?)',
      [req.userId, encryptedTitle, encryptedDesc, finalDueDate, finalPriority, finalStatus]
    );

    const [rows] = await db.execute('SELECT * FROM tasks WHERE id = ?', [result.insertId]);
    res.status(201).json(mapTaskFromDb(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/tasks/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { title, description, status, priority, dueDate, due_date, completedAt, completed_at, mediaUrl } = req.body;

    const fields = [];
    const params = [];

    if (title !== undefined) { fields.push('title = ?'); params.push(encrypt(title)); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description ? encrypt(description) : null); }
    if (status !== undefined) {
      fields.push('status = ?');
      params.push(status);
      if (status === 'done' && completedAt === undefined && completed_at === undefined) {
        fields.push('completed_at = NOW()');
      } else if (status !== 'done') {
        fields.push('completed_at = NULL');
      }
    }
    if (priority !== undefined) { fields.push('priority = ?'); params.push(priority); }
    if (dueDate !== undefined || due_date !== undefined) {
      fields.push('due_date = ?');
      params.push(dueDate || due_date || null);
    }
    if (completedAt !== undefined || completed_at !== undefined) {
      fields.push('completed_at = ?');
      params.push(completedAt || completed_at || null);
    }
    if (mediaUrl !== undefined) { fields.push('media_url = ?'); params.push(mediaUrl); }

    if (fields.length > 0) {
      params.push(req.params.id, req.userId);
      await db.execute(`UPDATE tasks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ? AND user_id = ?`, params);
    }

    const [rows] = await db.execute('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(mapTaskFromDb(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/tasks/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

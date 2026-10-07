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

/** Only two languages are supported; anything unknown falls back to English. */
function normaliseLocale(value) {
  return String(value || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/**
 * Reply copy, keyed by locale.
 *
 * Kept as a plain object rather than JSON files because the copy is small,
 * server-owned, and must stay in lockstep with the keyword matcher below.
 */
const COPY = {
  ar: {
    welcome:
      'مرحبًا! أنا مساعدك الذكي في أنجز. أستطيع مساعدتك في ترتيب أهدافك وتنظيم يومك. ' +
      'اسألني مثلًا: «ما الأولوية اليوم؟» أو «اقترح خطة لإنجاز مهامي العاجلة».',
    urgent: (title) =>
      `أولويتك القصوى اليوم هي المهمة العاجلة: «${title}». نوصي بالبدء بها فورًا دون تشتت.`,
    noUrgent: (title) => `ليس لديك مهام عاجلة حاليًا. أفضل مهمة تبدأ بها هي: «${title}».`,
    allDone: 'ممتاز! جميع مهامك مكتملة أو منظمة ببراعة 🎉',
    plan:
      'إليك خطة العمل المقترحة لليوم:\n' +
      '1️⃣ ابدأ بالمهام العاجلة ⚡\n' +
      '2️⃣ ركّز على المهام المتبقية لمدة 45 دقيقة بدون تشتت.\n' +
      '3️⃣ خذ استراحة 10 دقائق ثم راجع تقدمك.',
    summary: (done, pending) =>
      `ملخص إنجازك حتى الآن: إجمالي المهام المكتملة (${done})، والمهام المتبقية (${pending}). واصل التقدم الرائع!`,
    generic: [
      (pending) =>
        `تحليل سريع لمهامك: لديك ${pending} مهمة قائمة. ركّز على مهمة واحدة في كل مرة وسجّل تقدمك باستمرار.`,
      () => 'نصيحة إنتاجية: قسّم المهمة الكبيرة إلى خطوات صغيرة لا تتجاوز 15 دقيقة لكل خطوة لتسهيل تنفيذها.',
      () => 'أنا هنا لدعمك! تم حفظ رسالتك في قاعدة البيانات، وأي مهمة جديدة تضيفها سأحللها في خطتك اليومية.',
    ],
    notFound: (pending) =>
      `لم أفهم طلبك تمامًا. لديك ${pending} مهمة قيد الانتظار. جرّب أن تسألني عن الأولوية أو خطة اليوم.`,
  },
  en: {
    welcome:
      'Hello! I am your smart assistant in Angz. I can help you plan your goals and organise your day. ' +
      'Ask me things like "What is the priority today?" or "Suggest a plan for my urgent tasks".',
    urgent: (title) =>
      `Your top priority today is the urgent task: "${title}". I recommend starting with it immediately, without distractions.`,
    noUrgent: (title) =>
      `You have no urgent tasks right now. The best task to begin with is: "${title}".`,
    allDone: 'Excellent! All of your tasks are complete or impeccably organised 🎉',
    plan:
      'Here is the plan I suggest for today:\n' +
      '1️⃣ Start with the urgent tasks ⚡\n' +
      '2️⃣ Focus on the remaining tasks for 45 minutes without distractions.\n' +
      '3️⃣ Take a 10-minute break, then review your progress.',
    summary: (done, pending) =>
      `Here is your progress so far: ${done} task(s) completed and ${pending} still pending. Keep up the great work!`,
    generic: [
      (pending) =>
        `A quick look at your tasks: you have ${pending} pending. Focus on one task at a time and keep logging progress.`,
      () => 'Productivity tip: break a large task into small steps of no more than 15 minutes each so they are easy to start.',
      () => 'I am here to support you! Your message was saved to the database, and I will factor in any new task you add into your daily plan.',
    ],
    notFound: (pending) =>
      `I did not quite understand that. You have ${pending} pending task(s). Try asking me about your priority or a plan for today.`,
  },
};

/**
 * Keyword buckets per locale. Kept next to COPY so adding a phrase without its
 * reply (or vice versa) is obvious in review.
 */
const KEYWORDS = {
  ar: [
    { bucket: 'priority', terms: ['اولوية', 'أولوية', 'عاجل', 'عاجلة', 'الأهم', 'اهم', 'ابدأ', 'ابدا', 'priority'] },
    { bucket: 'plan', terms: ['خطة', 'خطة', 'تقسيم', 'اقسم', 'قسّم', 'جدول', 'تنظيم', 'plan', 'split', 'schedule'] },
    { bucket: 'summary', terms: ['ملخص', 'تقرير', 'انجاز', 'إنجاز', 'تقدم', 'تقدم', 'summary', 'progress', 'report'] },
  ],
  en: [
    { bucket: 'priority', terms: ['priority', 'urgent', 'important', 'first', 'start', 'next'] },
    { bucket: 'plan', terms: ['plan', 'split', 'schedule', 'organise', 'organize', 'break'] },
    { bucket: 'summary', terms: ['summary', 'progress', 'report', 'done', 'stats'] },
  ],
};

/** Picks the first matching bucket, or null when nothing matches. */
function matchBucket(lower, locale) {
  for (const { bucket, terms } of KEYWORDS[locale]) {
    if (terms.some((term) => lower.includes(term))) {
      return bucket;
    }
  }
  return null;
}

function buildReply({ locale, text, urgentTasks, todoTasks, doneCount }) {
  const copy = COPY[locale];
  const lower = text.toLowerCase();
  const bucket = matchBucket(lower, locale);

  switch (bucket) {
    case 'priority':
      if (urgentTasks.length > 0) return copy.urgent(urgentTasks[0].title);
      if (todoTasks.length > 0) return copy.noUrgent(todoTasks[0].title);
      return copy.allDone;
    case 'plan':
      return copy.plan;
    case 'summary':
      return copy.summary(doneCount, todoTasks.length);
    default: {
      // Seeded pick keeps consecutive unmatched messages from repeating
      // themselves without needing a random source.
      const index = text.length % copy.generic.length;
      return copy.generic[index](todoTasks.length);
    }
  }
}

// GET /api/v1/ai/history?locale=ar
router.get('/history', auth, async (req, res) => {
  try {
    const locale = normaliseLocale(req.query.locale);
    const [rows] = await db.execute(
      'SELECT id, role, content, created_at AS createdAt FROM ai_messages WHERE user_id = ? ORDER BY id ASC',
      [req.userId]
    );

    if (rows.length === 0) {
      // Greet in the language the user is currently browsing in.
      await db.execute(
        'INSERT INTO ai_messages (user_id, role, content) VALUES (?, ?, ?)',
        [req.userId, 'assistant', COPY[locale].welcome]
      );
      const [initialRows] = await db.execute(
        'SELECT id, role, content, created_at AS createdAt FROM ai_messages WHERE user_id = ? ORDER BY id ASC',
        [req.userId]
      );
      return res.json(initialRows);
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/ai/chat  { prompt, locale }
router.post('/chat', auth, async (req, res) => {
  try {
    const { prompt, content, locale } = req.body;
    const messageText = (prompt || content || '').trim();
    if (!messageText) return res.status(400).json({ error: 'Prompt is required' });

    const activeLocale = normaliseLocale(locale);

    // 1. Persist the user's message.
    await db.execute(
      'INSERT INTO ai_messages (user_id, role, content) VALUES (?, ?, ?)',
      [req.userId, 'user', messageText]
    );

    // 2. Load the user's tasks so the answer is grounded in real data.
    //    Titles are encrypted at rest, so they must be decrypted to be read.
    const { decrypt } = require('../utils/crypto');
    const [rows] = await db.execute(
      'SELECT title, priority, status, due_date FROM tasks WHERE user_id = ? AND status != "archived" ORDER BY priority DESC',
      [req.userId]
    );
    const tasks = rows.map((row) => ({ ...row, title: decrypt(row.title) }));

    const urgentTasks = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done');
    const todoTasks = tasks.filter((t) => t.status === 'todo');
    const doneCount = tasks.filter((t) => t.status === 'done').length;

    const reply = buildReply({
      locale: activeLocale,
      text: messageText,
      urgentTasks,
      todoTasks,
      doneCount,
    });

    // 3. Persist the assistant reply.
    const [result] = await db.execute(
      'INSERT INTO ai_messages (user_id, role, content) VALUES (?, ?, ?)',
      [req.userId, 'assistant', reply]
    );

    await db.execute(
      'INSERT INTO ai_conversations (user_id, prompt, response) VALUES (?, ?, ?)',
      [req.userId, messageText, reply]
    );

    const [replyRows] = await db.execute(
      'SELECT id, role, content, created_at AS createdAt FROM ai_messages WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(replyRows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/ai/clear  { locale }
router.post('/clear', auth, async (req, res) => {
  try {
    const locale = normaliseLocale(req.body.locale);
    await db.execute('DELETE FROM ai_messages WHERE user_id = ?', [req.userId]);
    await db.execute(
      'INSERT INTO ai_messages (user_id, role, content) VALUES (?, ?, ?)',
      [req.userId, 'assistant', COPY[locale].welcome]
    );
    res.json({ message: 'Chat history cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// Exported for unit tests: the copy/matching logic is pure and can be
// exercised without a database or an HTTP server.
module.exports.COPY = COPY;
module.exports.KEYWORDS = KEYWORDS;
module.exports.normaliseLocale = normaliseLocale;
module.exports.matchBucket = matchBucket;
module.exports.buildReply = buildReply;
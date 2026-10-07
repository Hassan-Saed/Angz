/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */

/**
 * Fixed-window rate limiter held in process memory.
 *
 * Protects the credential endpoints from brute force. Deliberately simple and
 * dependency-free; for a multi-instance deployment swap the store for Redis so
 * the counters are shared.
 *
 * `req.userId` is used as the key when present so a signed-in user is not
 * penalised for their whole IP, and falls back to the client address.
 */

const buckets = new Map();

/** Drops expired buckets so the map cannot grow without bound. */
function sweep(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function clientKey(req) {
  return req.userId ? `u:${req.userId}` : `ip:${req.ip || 'unknown'}`;
}

/**
 * @param {object} options
 * @param {number} options.windowMs  Length of the counting window.
 * @param {number} options.max       Requests allowed per window.
 * @param {string} options.message   Body returned once the limit is hit.
 */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Too many requests' } = {}) {
  return function limiter(req, res, next) {
    const now = Date.now();
    const key = clientKey(req);

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }

    return next();
  };
}

// Periodic cleanup; unref keeps the timer from holding the process open.
const sweeper = setInterval(() => sweep(Date.now()), 60_000);
if (typeof sweeper.unref === 'function') {
  sweeper.unref();
}

module.exports = { rateLimit };
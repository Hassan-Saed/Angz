/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
const crypto = require('node:crypto');

/**
 * AES-256-GCM helper.
 *
 * The key is read from `ENCRYPTION_KEY` and must be exactly 64 hexadecimal
 * characters (32 bytes). Anything else — a passphrase in plain text, a key of
 * the wrong length, an odd number of hex digits — makes `createCipheriv` throw
 * "Invalid key length" at the moment of the first encrypt or decrypt, which is
 * long after boot and gives no hint as to the cause. Validating once, loudly,
 * at startup turns a confusing per-request 500 into an actionable message.
 */

const RAW_KEY = process.env.ENCRYPTION_KEY || '';
const BYTES = 32;
const IV_LENGTH = 16;

function describeProblem(value) {
  if (!value) {
    return 'ENCRYPTION_KEY is not set.';
  }
  if (!/^[0-9a-fA-F]+$/.test(value)) {
    return 'ENCRYPTION_KEY must contain only hexadecimal characters (0-9, a-f). ' +
      'A plain-text passphrase such as "my secret key" cannot be used directly.';
  }
  if (value.length !== BYTES * 2) {
    return `ENCRYPTION_KEY must be exactly ${BYTES * 2} hexadecimal characters (32 bytes); got ${value.length}.`;
  }
  return null;
}

const problem = describeProblem(RAW_KEY);
const KEY = problem ? null : Buffer.from(RAW_KEY, 'hex');

/**
 * Encrypts UTF-8 text. The output is `iv:authTag:ciphertext`, all hex, so it
 * stays safe to store in a plain VARCHAR/TEXT column.
 */
function encrypt(text) {
  if (text === null || text === undefined || text === '') return text;
  if (!KEY) throw new Error(problem);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

/**
 * Reverses `encrypt`. Values that are not in our envelope are returned
 * unchanged, so a database written before encryption was enabled still reads.
 */
function decrypt(payload) {
  if (payload === null || payload === undefined || payload === '') return payload;
  if (typeof payload !== 'string') return payload;
  if (!KEY) throw new Error(problem);

  const parts = payload.split(':');
  if (parts.length !== 3) return payload;

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(parts[0], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
    let decrypted = decipher.update(parts[2], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // Wrong key or tampered ciphertext. Surfacing the raw envelope would be
    // worse than returning it untouched, so the caller sees the stored value.
    return payload;
  }
}

/** True when the configured key is usable. */
function isConfigured() {
  return !problem;
}

/** Human-readable description of why the key is unusable, or null. */
function configurationError() {
  return problem;
}

module.exports = { encrypt, decrypt, isConfigured, configurationError };
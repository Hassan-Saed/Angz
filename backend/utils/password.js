/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Returns a human-readable problem with the password, or null when it is
 * acceptable. Kept in one place so register, reset and change all enforce the
 * same rule instead of drifting apart.
 */
function validatePassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (password.length > 200) {
    return 'Password must be at most 200 characters long';
  }
  return null;
}

module.exports = { hashPassword, validatePassword, BCRYPT_ROUNDS };
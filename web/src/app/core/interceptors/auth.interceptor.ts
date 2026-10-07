/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthService } from '../services/auth.service';

/**
 * Attaches the Sanctum bearer token and asks Laravel for JSON responses.
 * Skips the OAuth endpoints, which the browser must reach unauthenticated.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();

  const isAuthFlow =
    req.url.includes('/auth/google') || req.url.includes('/sanctum/csrf-cookie');

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (token && !isAuthFlow) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return next(req.clone({ setHeaders: headers }));
};
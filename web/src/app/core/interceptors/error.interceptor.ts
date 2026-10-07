/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Centralises API error handling: signs the user out on a 401 and normalises
 * Laravel's error payloads into a predictable shape for the UI.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401 && !req.url.includes('/auth/me')) {
          auth.logout();
        }
        return throwError(() => normalise(error));
      }
      return throwError(() => error);
    }),
  );
};

export interface ApiError {
  status: number;
  /** i18n key from `errors.*`, e.g. `errors.network`. */
  messageKey: string;
  /** Field-level validation errors, keyed by field name. */
  fields: Record<string, string[]>;
  raw: HttpErrorResponse;
}

const STATUS_MESSAGE_KEYS: Record<number, string> = {
  0: 'errors.network',
  401: 'errors.unauthorized',
  403: 'errors.forbidden',
  404: 'errors.notFound',
  422: 'errors.generic',
  429: 'errors.tooManyRequests',
  500: 'errors.serverError',
  503: 'errors.serverError',
};

function normalise(error: HttpErrorResponse): ApiError {
  const payload = error.error as
    | { message?: string; errors?: Record<string, string[]> }
    | null;

  return {
    status: error.status,
    messageKey: STATUS_MESSAGE_KEYS[error.status] ?? 'errors.generic',
    fields: payload?.errors ?? {},
    raw: error,
  };
}
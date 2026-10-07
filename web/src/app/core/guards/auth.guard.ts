/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Blocks the authenticated area until the session is known, so a hard refresh
 * on `/dashboard` does not bounce the user to `/login` before the token has
 * been validated.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.authenticated()) {
    return true;
  }
  if (auth.token()) {
    return auth.restore().pipe(
      map(() => true),
      // `restore()` already clears the token on 401; fall back to /login on any failure.
      catchError(() => of(router.createUrlTree(['/login']))),
    );
  }

  return router.createUrlTree(['/login']);
};

/** Keeps signed-in users away from `/login`. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.authenticated() ? router.createUrlTree(['/dashboard']) : true;
};

/** Guards the AI Agent, which is restricted to trial and premium accounts. */
export const trialGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.aiAgentUnlocked()
    ? true
    : router.createUrlTree(['/profile/billing']);
};
/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';

/**
 * Landing page for `/auth/callback?token=...` (or `?error=...`), where the
 * backend OAuth handler redirects back after a Google sign-in. Exchanges the
 * token for the user record, or surfaces a localised reason for the failure.
 */
@Component({
  selector: 'app-auth-callback-page',
  template: `
    <main class="grid min-h-dvh place-items-center px-4 text-slate-600 dark:text-slate-300">
      <div class="w-full max-w-sm space-y-4 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg dark:border-slate-800 dark:bg-slate-900">
        @if (hasError()) {
          <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
            <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <p class="text-base font-bold text-slate-900 dark:text-white">{{ errorMessage() }}</p>
          <button
            type="button"
            (click)="goToLogin()"
            class="w-full rounded-xl bg-forest-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-forest-700"
          >
            {{ i18n.t('BackToLogin') }}
          </button>
        } @else {
          <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-forest-600 border-t-transparent"></div>
          <p class="text-sm">{{ i18n.t('Redirecting') }}</p>
        }
      </div>
    </main>
  `,
})
export class AuthCallbackPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);

  protected readonly hasError = signal(false);
  protected readonly errorMessage = signal('');

  /** Maps Google's OAuth error codes onto translation keys. */
  private readonly errorKeyByCode: Record<string, string> = {
    no_code: 'GoogleNoCode',
    access_denied: 'GoogleAccessDenied',
    auth_failed: 'GoogleAuthFailed',
  };

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const token = params.get('token');
    const error = params.get('error');

    if (error) {
      this.fail(this.errorKeyByCode[error] ?? 'AuthUnknownError');
      return;
    }

    if (!token) {
      this.fail('AuthCancelled');
      return;
    }

    this.auth.completeLogin(token).subscribe({
      error: () => this.fail('AuthUnknownError'),
    });
  }

  protected goToLogin(): void {
    void this.router.navigateByUrl('/login');
  }

  private fail(key: string): void {
    this.errorMessage.set(this.i18n.t(key));
    this.hasError.set(true);
  }
}
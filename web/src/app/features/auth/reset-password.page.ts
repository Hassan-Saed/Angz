/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Icon } from '../../shared/ui/icon';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';

/**
 * Single card that handles both halves of password recovery: requesting a
 * reset link, and setting a new password once a token arrives. Keeping them
 * together means the user never lands on a page that cannot do the next step.
 */
@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, Icon],
  template: `
    <main class="grid min-h-dvh place-items-center bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <section
        class="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8 dark:border-slate-800 dark:bg-slate-900"
      >
        <header class="text-center">
          <div
            class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-forest-100 text-forest-700 dark:bg-forest-950/60 dark:text-forest-300"
          >
            <app-icon name="lock" sizeClass="h-7 w-7" />
          </div>
          <h1 class="mt-4 text-xl font-extrabold text-slate-900 dark:text-white">
            {{ i18n.t('ResetPasswordTitle') }}
          </h1>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {{ i18n.t('ResetPasswordSubtitle') }}
          </p>
        </header>

        @if (sent()) {
          <!-- Confirmation state -->
          <div class="space-y-4 text-center">
            <p class="rounded-xl bg-forest-50 p-4 text-sm text-forest-800 dark:bg-forest-950/40 dark:text-forest-200">
              {{ i18n.t('ResetLinkSent', { email: email.trim() }) }}
            </p>
            <a
              routerLink="/login"
              class="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {{ i18n.t('BackToLogin') }}
            </a>
          </div>
        } @else if (token) {
          <!-- Set a new password -->
          <form class="space-y-4" (ngSubmit)="submit()">
            <div>
              <label class="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {{ i18n.t('NewPassword') }}
              </label>
              <input
                type="password"
                [(ngModel)]="password"
                name="password"
                autocomplete="new-password"
                required
                class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 transition-all duration-200 focus:border-forest-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label class="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {{ i18n.t('ConfirmPassword') }}
              </label>
              <input
                type="password"
                [(ngModel)]="confirm"
                name="confirm"
                autocomplete="new-password"
                required
                class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 transition-all duration-200 focus:border-forest-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <p class="text-[11px] text-slate-400">{{ i18n.t('PasswordRuleHint') }}</p>

            @if (error()) {
              <p class="rounded-xl bg-red-50 p-3 text-center text-xs font-semibold text-red-600 dark:bg-red-950/50 dark:text-red-400">
                {{ error() }}
              </p>
            }

            <button
              type="submit"
              [disabled]="loading()"
              class="w-full rounded-xl bg-forest-600 px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:bg-forest-700 hover:shadow-lg disabled:opacity-50"
            >
              {{ loading() ? i18n.t('Saving') : i18n.t('SetNewPassword') }}
            </button>
          </form>
        } @else {
          <!-- Request a link -->
          <form class="space-y-4" (ngSubmit)="request()">
            <div>
              <label class="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {{ i18n.t('EmailAddress') }}
              </label>
              <input
                type="email"
                [(ngModel)]="email"
                name="email"
                autocomplete="email"
                required
                class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 transition-all duration-200 focus:border-forest-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            @if (error()) {
              <p class="rounded-xl bg-red-50 p-3 text-center text-xs font-semibold text-red-600 dark:bg-red-950/50 dark:text-red-400">
                {{ error() }}
              </p>
            }

            <button
              type="submit"
              [disabled]="loading()"
              class="w-full rounded-xl bg-forest-600 px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:bg-forest-700 hover:shadow-lg disabled:opacity-50"
            >
              {{ loading() ? i18n.t('Sending') : i18n.t('SendResetLink') }}
            </button>
          </form>
        }

        <a routerLink="/login" class="block text-center text-xs font-bold text-forest-600 hover:underline dark:text-forest-400">
          {{ i18n.t('BackToLogin') }}
        </a>
      </section>
    </main>
  `,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected confirm = '';

  protected readonly token = new URLSearchParams(window.location.search).get('token') ?? '';
  protected readonly loading = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected request(): void {
    this.error.set(null);
    const address = this.email.trim();
    if (!address) {
      this.error.set(this.i18n.t('ValidationEmailRequired'));
      return;
    }

    this.loading.set(true);
    this.auth.forgotPassword(address).subscribe({
      next: () => {
        this.loading.set(false);
        this.sent.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.readError(err, 'ResetRequestFailed'));
      },
    });
  }

  protected submit(): void {
    this.error.set(null);

    if (this.password.length < 8) {
      this.error.set(this.i18n.t('ValidationPasswordTooShort'));
      return;
    }
    if (this.password !== this.confirm) {
      this.error.set(this.i18n.t('ValidationPasswordMismatch'));
      return;
    }

    this.loading.set(true);
    this.auth.resetPassword(this.token, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigateByUrl('/dashboard');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.readError(err, 'ResetFailed'));
      },
    });
  }

  private readError(err: unknown, fallbackKey: string): string {
    const payload = err as { error?: { error?: string } } | null;
    return payload?.error?.error || this.i18n.t(fallbackKey);
  }
}
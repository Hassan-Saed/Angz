/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-page.html',
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly loading = signal<boolean>(false);
  protected readonly errorMsg = signal<string | null>(null);

  name = '';
  email = '';
  password = '';

  toggleMode(): void {
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
    this.errorMsg.set(null);
  }

  onSubmit(): void {
    if (!this.email || !this.password) {
      this.errorMsg.set(this.i18n.t('FillAllFields'));
      return;
    }
    if (this.mode() === 'register' && !this.name) {
      this.errorMsg.set(this.i18n.t('EnterNameToRegister'));
      return;
    }

    this.loading.set(true);
    this.errorMsg.set(null);

    if (this.mode() === 'login') {
      this.auth.login(this.email, this.password).subscribe({
        next: () => this.loading.set(false),
        error: (err) => {
          this.loading.set(false);
          this.errorMsg.set(err?.error?.error || this.i18n.t('InvalidCredentials'));
        },
      });
    } else {
      this.auth.register(this.name, this.email, this.password).subscribe({
        next: () => this.loading.set(false),
        error: (err) => {
          this.loading.set(false);
          this.errorMsg.set(err?.error?.error || this.i18n.t('CouldNotCreateAccount'));
        },
      });
    }
  }

  enterDemo(): void {
    this.auth.enterDemoSession();
  }

  loginWithGoogle(): void {
    this.auth.loginWithGoogle();
  }
}

/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';

import { hasAiAccess, trialDaysRemaining, type User } from '../models/user.model';
import { API_BASE_URL } from '../tokens/api.tokens';
import { I18nService } from './i18n.service';

const TOKEN_STORAGE_KEY = 'angz.token';
const DEMO_TOKEN = 'angz.demo-token';

function defaultSettings(): NonNullable<User['settings']> {
  return {
    theme: 'system',
    pushEnabled: true,
    dueSoonReminderMinutes: 60,
    dailySummaryEnabled: true,
    aiPersona: 'balanced',
  };
}

function makeDemoUser(): User {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 13);
  return {
    id: 1,
    name: 'أحمد علي',
    email: 'demo@angz.local',
    avatarUrl: null,
    subscriptionStatus: 'trial',
    trialEndsAt: trialEndsAt.toISOString(),
    locale: 'ar',
    settings: defaultSettings(),
  };
}

export interface AuthResponse {
  token: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly i18n = inject(I18nService);

  private readonly currentUser = signal<User | null>(null);
  private readonly isAuthenticated = signal<boolean>(false);
  private readonly isResolving = signal<boolean>(false);

  readonly user = this.currentUser.asReadonly();
  readonly authenticated = this.isAuthenticated.asReadonly();
  readonly resolving = this.isResolving.asReadonly();

  readonly subscriptionStatus = computed(() => this.currentUser()?.subscriptionStatus ?? 'free');
  readonly trialDaysLeft = computed(() => {
    const user = this.currentUser();
    return user ? trialDaysRemaining(user) : null;
  });
  readonly aiAgentUnlocked = computed(() => {
    const user = this.currentUser();
    return user ? hasAiAccess(user) : false;
  });

  token(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Turns a stored avatar reference into something the browser can load.
   *
   * Google sign-in stores an absolute `https://…` picture URL, while uploads
   * store a server-relative path like `/uploads/avatars/…` that must be
   * prefixed with the API origin (the web app is served from another port).
   */
  resolveMediaUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    return `${this.baseUrl}${value.startsWith('/') ? '' : '/'}${value}`;
  }

  register(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/api/v1/auth/register`, { name, email, password }).pipe(
      tap((res) => {
        this.storeToken(res.token);
        this.currentUser.set(res.user);
        this.isAuthenticated.set(true);
        void this.router.navigateByUrl('/dashboard');
      })
    );
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/api/v1/auth/login`, { email, password }).pipe(
      tap((res) => {
        this.storeToken(res.token);
        this.currentUser.set(res.user);
        this.isAuthenticated.set(true);
        void this.router.navigateByUrl('/dashboard');
      })
    );
  }

  loginWithGoogle(): void {
    window.location.assign(`${this.baseUrl}/api/v1/auth/google/redirect`);
  }

  completeLogin(token: string): Observable<User> {
    this.storeToken(token);
    this.isResolving.set(true);

    return this.http.get<User>(`${this.baseUrl}/api/v1/auth/me`).pipe(
      tap((user) => {
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        this.isResolving.set(false);
        void this.router.navigateByUrl('/dashboard');
      }),
      catchError((error: HttpErrorResponse) => {
        this.clearToken();
        this.isResolving.set(false);
        return throwError(() => error);
      })
    );
  }

  bootstrapSession(): void {
    if (this.token() === DEMO_TOKEN) {
      this.enterDemoSession();
      return;
    }

    if (this.token()) {
      this.restore().subscribe({ error: () => {} });
      return;
    }

    this.enterDemoSession();
  }

  restore(): Observable<User | null> {
    if (!this.token()) {
      return of(null);
    }

    if (this.token() === DEMO_TOKEN) {
      const user = makeDemoUser();
      this.currentUser.set(user);
      this.isAuthenticated.set(true);
      return of(user);
    }

    this.isResolving.set(true);

    return this.http.get<User>(`${this.baseUrl}/api/v1/auth/me`).pipe(
      tap((user) => {
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        this.isResolving.set(false);
      }),
      map((user) => user),
      catchError((error: HttpErrorResponse) => {
        this.clearToken();
        this.currentUser.set(null);
        this.isAuthenticated.set(false);
        this.isResolving.set(false);
        return throwError(() => error);
      })
    );
  }

  /**
   * Updates the profile. Changing the email additionally requires
   * `currentPassword`, which the backend enforces.
   */
  updateProfile(patch: {
    name?: string;
    email?: string;
    locale?: string;
    currentPassword?: string;
  }): Observable<User> {
    return this.http.put<User>(`${this.baseUrl}/api/v1/auth/me`, patch).pipe(
      tap((updated) => {
        this.currentUser.set(updated);
      })
    );
  }

  /** Uploads a new profile picture and refreshes the cached user. */
  uploadAvatar(file: File): Observable<{ avatarUrl: string; mimeType: string; sizeBytes: number }> {
    const form = new FormData();
    form.append('avatar', file, file.name);

    return this.http
      .post<{ avatarUrl: string; mimeType: string; sizeBytes: number }>(
        `${this.baseUrl}/api/v1/auth/avatar`,
        form,
      )
      .pipe(
        tap((res) => {
          // Reflect the new picture immediately without a round trip to /me.
          this.currentUser.update((user) =>
            user ? { ...user, avatarUrl: this.resolveMediaUrl(res.avatarUrl) } : user,
          );
        }),
      );
  }

  deleteAvatar(): Observable<{ message: string }> {
    return this.http
      .delete<{ message: string }>(`${this.baseUrl}/api/v1/auth/avatar`)
      .pipe(
        tap(() => {
          this.currentUser.update((user) => (user ? { ...user, avatarUrl: null } : user));
        }),
      );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.baseUrl}/api/v1/auth/password`, {
      currentPassword,
      newPassword,
    });
  }

  /** Unauthenticated: always resolves, never reveals whether the email exists. */
  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/api/v1/auth/forgot-password`, {
      email,
      locale: this.i18n.locale(),
    });
  }

  /** Consumes a reset token and signs the user in with the returned JWT. */
  resetPassword(token: string, password: string): Observable<{ token: string }> {
    return this.http
      .post<{ token: string }>(`${this.baseUrl}/api/v1/auth/reset-password`, { token, password })
      .pipe(
        tap((res) => {
          this.storeToken(res.token);
          this.isAuthenticated.set(true);
        }),
      );
  }

  updateSettings(settingsPatch: Partial<User['settings']>): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/auth/settings`, settingsPatch).pipe(
      tap(() => {
        const current = this.currentUser();
        if (current) {
          this.currentUser.set({
            ...current,
            settings: { ...current.settings, ...settingsPatch },
          });
        }
      })
    );
  }

  enterDemoSession(): void {
    const user = makeDemoUser();
    this.currentUser.set(user);
    this.isAuthenticated.set(true);
    this.isResolving.set(false);
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, DEMO_TOKEN);
    } catch {}
  }

  readonly planLabel = computed<string>(() => {
    const status = this.subscriptionStatus();
    switch (status) {
      case 'trial':
        return 'trial';
      case 'premium':
        return 'premium';
      default:
        return 'free';
    }
  });

  logout(): void {
    this.clearToken();
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
    void this.router.navigateByUrl('/login');
  }

  private storeToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {}
  }

  private clearToken(): void {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {}
  }
}

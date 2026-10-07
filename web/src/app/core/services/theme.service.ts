/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'angz.theme';

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Dark/light theme state, persisted to localStorage and seeded from
 * `prefers-color-scheme` until the user picks explicitly.
 *
 * The `dark` class lives on `<html>` so Tailwind's
 * `@custom-variant dark (&:where(.dark, .dark *))` variant picks it up.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly preference = signal<ThemePreference>('system');
  readonly resolved = signal<ResolvedTheme>('light');

  readonly isDark = computed(() => this.resolved() === 'dark');

  constructor() {
    if (this.isBrowser) {
      this.restore();
      this.watchSystem();
    }

    effect(() => {
      const theme = this.resolved();
      const root = this.document.documentElement;

      root.classList.toggle('dark', theme === 'dark');
      root.style.colorScheme = theme;
    });
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    this.apply();
    this.persist();
  }

  /** Flips between light and dark, leaving `system` behind once chosen. */
  toggle(): void {
    this.setPreference(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  private restore(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isThemePreference(stored)) {
        this.preference.set(stored);
      }
    } catch {
      // Private-mode browsers throw on localStorage access; fall back to system.
    }
    this.apply();
  }

  private persist(): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, this.preference());
    } catch {
      // Ignore: the theme still applies for this session.
    }
  }

  private apply(): void {
    const preference = this.preference();
    this.resolved.set(
      preference === 'system' ? this.systemTheme() : preference,
    );
  }

  private systemTheme(): ResolvedTheme {
    const view = this.document.defaultView;
    return view?.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private watchSystem(): void {
    const view = this.document.defaultView;
    const query = view?.matchMedia('(prefers-color-scheme: dark)');
    if (!query) {
      return;
    }

    const sync = () => {
      if (this.preference() === 'system') {
        this.resolved.set(query.matches ? 'dark' : 'light');
      }
    };

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', sync);
    } else {
      query.addListener(sync);
    }
  }
}
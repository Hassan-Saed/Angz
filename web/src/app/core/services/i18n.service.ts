/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type Locale = 'en' | 'ar';
export type TextDirection = 'rtl' | 'ltr';
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
export type TranslationValue = string | Record<string, string>;
export type TranslationTree = { [key: string]: TranslationValue | TranslationTree };

export type TranslationParams = Record<string, string | number>;

const PLURAL_CATEGORIES: readonly PluralCategory[] = [
  'zero',
  'one',
  'two',
  'few',
  'many',
  'other',
];

const STORAGE_KEY = 'angz.locale';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly http = inject(HttpClient);

  private readonly dictionary = signal<ReadonlyMap<string, TranslationValue>>(new Map());
  private readonly isLoaded = signal(false);
  private readonly loadError = signal<string | null>(null);

  readonly locale = signal<Locale>('en');
  readonly dir = computed<TextDirection>(() =>
    this.locale() === 'ar' ? 'rtl' : 'ltr',
  );
  readonly ready = computed(() => this.isLoaded());
  readonly error = computed(() => this.loadError());

  /**
   * Per-locale formatters. Arabic and English disagree on plural categories
   * (Arabic has six, English has two) and on month names, so a single
   * hard-coded `Intl.PluralRules('en')` would render the wrong form for
   * counts like 11 and 100. Arabic also needs Latin digits pinned explicitly:
   * the default `ar` numeral system is environment-dependent, while
   * `ar-u-nu-latn` is deterministic.
   *
   * Built lazily and cached per locale, so switching language is cheap.
   */
  private readonly pluralRulesCache = new Map<Locale, Intl.PluralRules>();
  private readonly numberFormatCache = new Map<Locale, Intl.NumberFormat>();
  private readonly dateFormatCache = new Map<Locale, Intl.DateTimeFormat>();
  private readonly relativeFormatCache = new Map<Locale, Intl.RelativeTimeFormat>();

  private pluralRules(locale: Locale): Intl.PluralRules {
    let rules = this.pluralRulesCache.get(locale);
    if (!rules) {
      rules = new Intl.PluralRules(locale);
      this.pluralRulesCache.set(locale, rules);
    }
    return rules;
  }

  private formatter(locale: Locale): Intl.NumberFormat {
    let fmt = this.numberFormatCache.get(locale);
    if (!fmt) {
      fmt = new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en');
      this.numberFormatCache.set(locale, fmt);
    }
    return fmt;
  }

  private dateFormatter(locale: Locale): Intl.DateTimeFormat {
    let fmt = this.dateFormatCache.get(locale);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn-ca-gregory' : 'en-u-nu-latn-ca-gregory', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      this.dateFormatCache.set(locale, fmt);
    }
    return fmt;
  }

  private relativeFormatter(locale: Locale): Intl.RelativeTimeFormat {
    let fmt = this.relativeFormatCache.get(locale);
    if (!fmt) {
      fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      this.relativeFormatCache.set(locale, fmt);
    }
    return fmt;
  }

  private readonly warnedKeys = new Set<string>();
  private readonly document = inject(DOCUMENT);

  constructor() {
    this.restoreLocale();

    effect(() => {
      const locale = this.locale();
      const dir = this.dir();
      const html = this.document.documentElement;
      html.setAttribute('dir', dir);
      html.setAttribute('lang', locale);
    });
  }

  private restoreLocale(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'ar' || stored === 'en') {
        this.locale.set(stored);
      }
    } catch {}
  }

  setLocale(locale: Locale): void {
    this.locale.set(locale);
    this.isLoaded.set(false);
    this.load();
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {}
  }

  toggleLocale(): void {
    this.setLocale(this.locale() === 'en' ? 'ar' : 'en');
  }

  load(): void {
    if (this.isLoaded()) {
      return;
    }

    this.http.get<TranslationTree>(`assets/i18n/${this.locale()}.json`).subscribe({
      next: (tree) => {
        const size = flatten(tree).size;
        this.dictionary.set(flatten(tree));
        this.isLoaded.set(true);
        this.loadError.set(null);
        if (size === 0) {
          // A dictionary that parses but is empty means the asset resolved to
          // the SPA index.html (wrong path) rather than the JSON file.
          console.error(
            `[i18n] assets/i18n/${this.locale()}.json resolved but contained no keys`,
          );
        }
      },
      error: (err) => {
        // Previously this only recorded the error, so `t()` silently returned
        // the raw key for every string and the UI looked "translated" while
        // showing things like `Dashboard`. Surface it loudly instead.
        console.error(
          `[i18n] failed to load assets/i18n/${this.locale()}.json — check the "assets" entries in angular.json`,
          err,
        );
        this.loadError.set(`assets/i18n/${this.locale()}.json`);
        this.isLoaded.set(true);
      },
    });
  }

  t(key: string, params?: TranslationParams): string {
    const value = this.dictionary().get(key);

    if (value === undefined) {
      this.warnMissing(key);
      return key;
    }
    if (typeof value === 'string') {
      return interpolate(value, params);
    }

    this.warnMissing(`${key} (expected a string, found a plural group)`);
    return key;
  }

  plural(key: string, count: number, params?: TranslationParams): string {
    const value = this.dictionary().get(key);

    if (value === undefined) {
      this.warnMissing(key);
      return key;
    }
    if (typeof value === 'string') {
      this.warnMissing(`${key} (expected a plural group, found a string)`);
      return value;
    }

    const category = this.pluralRules(this.locale()).select(count) as PluralCategory;
    const template = value[category] ?? value['other'];

    if (template === undefined) {
      this.warnMissing(`${key}.${category}`);
      return key;
    }

    return interpolate(template, { count: this.num(count), ...params });
  }

  /** Latin digits with locale grouping (e.g. 1,234,567). */
  num(value: number): string {
    return this.formatter(this.locale()).format(value);
  }

  /** Locale-appropriate long date, e.g. "6 October 2026" / "6 أكتوبر 2026". */
  date(value: Date | string | number): string {
    return this.dateFormatter(this.locale()).format(new Date(value));
  }

  /** Locale-appropriate relative time, e.g. "tomorrow" / "غدًا". */
  relative(value: Date | string | number): string {
    const target = new Date(value);
    const diffDays = Math.round((target.getTime() - startOfDay(new Date()).getTime()) / 86_400_000);

    return this.relativeFormatter(this.locale()).format(diffDays, 'day');
  }

  has(key: string): boolean {
    return this.dictionary().has(key);
  }

  private warnMissing(key: string): void {
    if (this.warnedKeys.has(key)) {
      return;
    }
    this.warnedKeys.add(key);
    console.warn(`[i18n] missing translation: ${key}`);
  }
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
}

function flatten(tree: TranslationTree, prefix = ''): Map<string, TranslationValue> {
  const out = new Map<string, TranslationValue>();

  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isPluralGroup(value)) {
      out.set(path, value);
      continue;
    }
    if (value !== null && typeof value === 'object') {
      for (const [nestedKey, nestedValue] of flatten(value as TranslationTree, path)) {
        out.set(nestedKey, nestedValue);
      }
      continue;
    }

    out.set(path, value as string);
  }

  return out;
}

function isPluralGroup(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => PLURAL_CATEGORIES.includes(key as PluralCategory));
}

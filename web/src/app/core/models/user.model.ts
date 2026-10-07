/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
export type SubscriptionStatus = 'free' | 'trial' | 'premium';

export interface User {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  subscriptionStatus: SubscriptionStatus;
  /** ISO-8601 timestamp; null unless the account is on a trial. */
  trialEndsAt: string | null;
  locale: string;
  settings: UserSettings;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  pushEnabled: boolean;
  dueSoonReminderMinutes: number | null;
  dailySummaryEnabled: boolean;
  aiPersona: AiPersona;
}

export type AiPersona = 'strict' | 'friendly' | 'balanced';

export const TRIAL_DAYS = 14;

/** True when the AI Agent, analytics, and large uploads should be unlocked. */
export function hasAiAccess(user: Pick<User, 'subscriptionStatus'>): boolean {
  return user.subscriptionStatus === 'trial' || user.subscriptionStatus === 'premium';
}

/** Whole days left in the trial; null when the account is not on a trial. */
export function trialDaysRemaining(user: Pick<User, 'trialEndsAt'>, now = new Date()): number | null {
  if (!user.trialEndsAt) {
    return null;
  }

  const end = new Date(user.trialEndsAt);
  const msPerDay = 86_400_000;
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / msPerDay));
}
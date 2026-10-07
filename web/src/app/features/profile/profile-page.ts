/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Icon } from '../../shared/ui/icon';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, Icon],
  templateUrl: './profile-page.html',
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  // --- Editable profile fields -------------------------------------------
  protected name = '';
  protected email = '';
  /** Only sent when the address actually changes. */
  protected currentPasswordForEmail = '';
  private loadedForUserId: number | null = null;

  // --- Password change ---------------------------------------------------
  protected currentPassword = '';
  protected newPassword = '';
  protected confirmPassword = '';

  // --- UI state ----------------------------------------------------------
  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly uploadingAvatar = signal(false);

  protected readonly profileMessage = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly passwordMessage = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly avatarMessage = signal<{ ok: boolean; text: string } | null>(null);

  /** Local preview shown while the upload is in flight. */
  protected readonly avatarPreview = signal<string | null>(null);

  /**
   * Picture to render. `resolveMediaUrl` is applied again here because the
   * avatar may come from Google (already absolute) or from our own upload
   * (a server-relative path that needs the API origin).
   */
  protected readonly avatarUrl = computed(() => {
    const raw = this.avatarPreview() ?? this.auth.user()?.avatarUrl ?? null;
    return raw ? this.auth.resolveMediaUrl(raw) : null;
  });
  protected readonly initials = computed(() => {
    const name = this.auth.user()?.name ?? '';
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  });

  protected readonly subscriptionLabel = computed(() => {
    const map: Record<string, string> = {
      free: 'PlanFree',
      trial: 'PlanTrial',
      premium: 'PlanPremium',
    };
    return this.i18n.t(map[this.auth.subscriptionStatus()] ?? 'PlanFree');
  });

  protected readonly trialDaysText = computed(() => {
    const days = this.auth.trialDaysLeft();
    return days === null ? '' : this.i18n.plural('TrialDaysLeft', days);
  });

  /**
   * Syncs the form fields from the signed-in user exactly once per user, so an
   * in-progress edit is never overwritten by a background refresh.
   */
  protected syncFields(): void {
    const user = this.auth.user();
    if (!user || this.loadedForUserId === user.id) return;
    this.loadedForUserId = user.id;
    this.name = user.name ?? '';
    this.email = user.email ?? '';
  }

  constructor() {
    this.syncFields();
  }

  protected saveProfile(): void {
    this.profileMessage.set(null);

    const name = this.name.trim();
    const email = this.email.trim();
    const user = this.auth.user();

    if (!name) {
      this.profileMessage.set({ ok: false, text: this.i18n.t('ValidationNameRequired') });
      return;
    }

    const emailChanged = user ? email.toLowerCase() !== user.email.toLowerCase() : false;
    if (emailChanged && !this.currentPasswordForEmail) {
      this.profileMessage.set({
        ok: false,
        text: this.i18n.t('ValidationPasswordNeededForEmail'),
      });
      return;
    }

    this.savingProfile.set(true);
    const patch: Parameters<AuthService['updateProfile']>[0] = { name, email };
    if (emailChanged) {
      patch.currentPassword = this.currentPasswordForEmail;
    }

    this.auth.updateProfile(patch).subscribe({
      next: (updated) => {
        this.currentPasswordForEmail = '';
        this.loadedForUserId = updated.id;
        this.email = updated.email;
        this.profileMessage.set({ ok: true, text: this.i18n.t('ProfileSaved') });
        this.finish(this.savingProfile);
      },
      error: (err) => {
        this.profileMessage.set({ ok: false, text: this.errorText(err, 'ProfileSaveFailed') });
        this.finish(this.savingProfile);
      },
    });
  }

  protected onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.avatarMessage.set(null);
    if (!file) return;

    // Cheap client-side guard; the server re-validates independently.
    // Some Windows/Explorer picks report an empty or wrong `file.type`, so
    // fall back to the extension rather than refusing a perfectly valid image.
    const mimeLooksImage = file.type ? file.type.startsWith('image/') : false;
    const extLooksImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
    if (!mimeLooksImage && !extLooksImage) {
      this.avatarMessage.set({ ok: false, text: this.i18n.t('AvatarInvalidType') });
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.avatarMessage.set({ ok: false, text: this.i18n.t('AvatarTooLarge') });
      input.value = '';
      return;
    }

    const preview = URL.createObjectURL(file);
    this.avatarPreview.set(preview);

    this.uploadingAvatar.set(true);
    this.auth.uploadAvatar(file).subscribe({
      next: () => {
        this.avatarMessage.set({ ok: true, text: this.i18n.t('AvatarUpdated') });
        this.revokePreview();
        this.finish(this.uploadingAvatar);
      },
      error: (err) => {
        this.avatarMessage.set({ ok: false, text: this.errorText(err, 'AvatarUpdateFailed') });
        this.revokePreview();
        // Clears the chosen file so re-picking the same image fires `change`.
        input.value = '';
        this.finish(this.uploadingAvatar);
      },
    });
  }

  protected removeAvatar(): void {
    this.avatarMessage.set(null);
    this.uploadingAvatar.set(true);
    this.auth.deleteAvatar().subscribe({
      next: () => {
        this.avatarMessage.set({ ok: true, text: this.i18n.t('AvatarRemoved') });
        this.revokePreview();
        this.finish(this.uploadingAvatar);
      },
      error: (err) => {
        this.avatarMessage.set({ ok: false, text: this.errorText(err, 'AvatarUpdateFailed') });
        this.finish(this.uploadingAvatar);
      },
    });
  }

  protected changePassword(): void {
    this.passwordMessage.set(null);

    if (!this.currentPassword) {
      this.passwordMessage.set({ ok: false, text: this.i18n.t('ValidationCurrentPassword') });
      return;
    }
    if (this.newPassword.length < 8) {
      this.passwordMessage.set({ ok: false, text: this.i18n.t('ValidationPasswordTooShort') });
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordMessage.set({ ok: false, text: this.i18n.t('ValidationPasswordMismatch') });
      return;
    }

    this.savingPassword.set(true);
    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
        this.passwordMessage.set({ ok: true, text: this.i18n.t('PasswordChanged') });
        this.finish(this.savingPassword);
      },
      error: (err) => {
        this.passwordMessage.set({ ok: false, text: this.errorText(err, 'PasswordChangeFailed') });
        this.finish(this.savingPassword);
      },
    });
  }

  logout(): void {
    this.auth.logout();
  }

  private revokePreview(): void {
    const current = this.avatarPreview();
    if (current) {
      URL.revokeObjectURL(current);
      this.avatarPreview.set(null);
    }
  }

  /** Surfaces the server's message when present, otherwise the fallback key. */
  private errorText(err: unknown, fallbackKey: string): string {
    const payload = err as { error?: { error?: string }; message?: string } | null;
    return payload?.error?.error || payload?.message || this.i18n.t(fallbackKey);
  }

  private finish(flag: ReturnType<typeof signal<boolean>>): void {
    setTimeout(() => flag.set(false), 0);
  }
}
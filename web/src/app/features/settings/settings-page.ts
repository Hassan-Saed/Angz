/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Icon } from '../../shared/ui/icon';
import { Typewriter } from '../../shared/ui/typewriter';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService, type ThemePreference } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, Icon, Typewriter],
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);

  protected readonly saveSuccess = signal<boolean>(false);

  protected readonly themeOptions: { value: ThemePreference; labelKey: string }[] = [
    { value: 'light', labelKey: 'settings.themeLight' },
    { value: 'dark', labelKey: 'settings.themeDark' },
    { value: 'system', labelKey: 'settings.themeSystem' },
  ];

  /**
   * Persona copy is resolved through i18n rather than hard-coded, so it
   * re-renders in the active language when the user switches.
   */
  protected readonly aiPersonas = computed(() => [
    { id: 'balanced', name: this.i18n.t('PersonaBalanced'), desc: this.i18n.t('PersonaBalancedHint') },
    { id: 'focused', name: this.i18n.t('PersonaFocused'), desc: this.i18n.t('PersonaFocusedHint') },
    { id: 'supportive', name: this.i18n.t('PersonaSupportive'), desc: this.i18n.t('PersonaSupportiveHint') },
  ]);

  setTheme(t: ThemePreference): void {
    this.theme.setPreference(t);
    this.saveSettings({ theme: t });
  }

  togglePush(enabled: boolean): void {
    this.saveSettings({ pushEnabled: enabled });
  }

  toggleDailySummary(enabled: boolean): void {
    this.saveSettings({ dailySummaryEnabled: enabled });
  }

  setPersona(persona: string): void {
    this.saveSettings({ aiPersona: persona });
  }

  private saveSettings(patch: any): void {
    this.auth.updateSettings(patch).subscribe({
      next: () => {
        this.saveSuccess.set(true);
        setTimeout(() => this.saveSuccess.set(false), 2000);
      }
    });
  }
}

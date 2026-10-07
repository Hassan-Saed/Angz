/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Icon } from '../../shared/ui/icon';
import { Typewriter } from '../../shared/ui/typewriter';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { TasksService } from '../../core/services/tasks.service';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink, Icon, Typewriter],
  templateUrl: './dashboard-page.html',
})
export class DashboardPage {
  protected readonly auth = inject(AuthService);
  protected readonly tasks = inject(TasksService);
  protected readonly i18n = inject(I18nService);

  /** Time-of-day salutation, resolved through i18n so it localises properly. */
  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const key = hour < 12 ? 'GreetingMorning' : hour < 18 ? 'GreetingAfternoon' : 'GreetingEvening';
    const name = this.auth.user()?.name || this.i18n.t('GreetingFallbackName');
    return `${this.i18n.t(key)}, ${name}!`;
  });

  protected readonly todayLabel = computed(() => this.i18n.date(new Date()));

  /**
   * Short situational summary. Picks one of three keys and interpolates the
   * count, rather than concatenating a sentence per locale in TypeScript.
   */
  protected readonly briefLine = computed(() => {
    const urgent = this.tasks.urgentCount();
    const pending = this.tasks.pendingCount();

    if (urgent > 0) {
      return this.i18n.t('BriefUrgent', { count: urgent });
    }
    if (pending === 0) {
      return this.i18n.t('BriefAllDone');
    }
    return this.i18n.t('BriefPending', { count: pending });
  });

  protected readonly recentTasks = computed(() => {
    return this.tasks.all().slice(0, 5);
  });
}

/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Icon } from '../../shared/ui/icon';
import { Typewriter } from '../../shared/ui/typewriter';
import { I18nService } from '../../core/services/i18n.service';
import { TasksService } from '../../core/services/tasks.service';

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CommonModule, Icon, Typewriter],
  templateUrl: './analytics-page.html',
})
export class AnalyticsPage {
  protected readonly i18n = inject(I18nService);
  protected readonly tasks = inject(TasksService);

  protected readonly totalCount = computed(() => this.tasks.all().length);
  protected readonly completionRatio = computed(() => this.tasks.completionRatio());

  protected readonly byStatus = computed(() => this.tasks.countByStatus());
  protected readonly byPriority = computed(() => this.tasks.countByPriority());

  protected readonly statusEntries = computed(() => {
    const counts = this.byStatus();
    const total = this.totalCount() || 1;
    const labels: Record<string, { name: string; color: string }> = {
      todo: { name: this.i18n.t('StatusTodo'), color: 'bg-forest-500' },
      in_progress: { name: this.i18n.t('StatusInProgress'), color: 'bg-amber-500' },
      done: { name: this.i18n.t('StatusDone'), color: 'bg-emerald-500' },
      archived: { name: this.i18n.t('StatusArchived'), color: 'bg-slate-400' },
    };

    return Object.entries(counts).map(([key, count]) => ({
      key,
      name: labels[key]?.name || key,
      color: labels[key]?.color || 'bg-slate-500',
      count,
      percent: Math.round((count / total) * 100),
    }));
  });

  protected readonly priorityEntries = computed(() => {
    const counts = this.byPriority();
    const total = this.totalCount() || 1;
    const labels: Record<string, { name: string; color: string }> = {
      urgent: { name: this.i18n.t('PriorityUrgent'), color: 'bg-red-600' },
      high: { name: this.i18n.t('PriorityHigh'), color: 'bg-orange-500' },
      medium: { name: this.i18n.t('PriorityMedium'), color: 'bg-blue-500' },
      low: { name: this.i18n.t('PriorityLow'), color: 'bg-slate-400' },
    };

    return Object.entries(counts).map(([key, count]) => ({
      key,
      name: labels[key]?.name || key,
      color: labels[key]?.color || 'bg-slate-500',
      count,
      percent: Math.round((count / total) * 100),
    }));
  });
}

/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Icon } from '../../shared/ui/icon';
import { Typewriter } from '../../shared/ui/typewriter';
import { I18nService } from '../../core/services/i18n.service';
import { TasksService } from '../../core/services/tasks.service';
import type { TaskPriority, TaskStatus } from '../../core/models/task.model';

@Component({
  selector: 'app-tasks-page',
  standalone: true,
  imports: [CommonModule, FormsModule, Icon, Typewriter],
  templateUrl: './tasks-page.html',
})
export class TasksPage {
  protected readonly tasks = inject(TasksService);
  protected readonly i18n = inject(I18nService);

  protected readonly viewMode = signal<'list' | 'board'>('list');
  protected readonly searchQuery = signal<string>('');
  protected readonly selectedStatusFilter = signal<string>('all');
  protected readonly isModalOpen = signal<boolean>(false);

  newTaskTitle = '';
  newTaskDescription = '';
  newTaskPriority: TaskPriority = 'medium';
  newTaskStatus: TaskStatus = 'todo';
  newTaskDueDate = new Date().toISOString().split('T')[0];

  protected readonly columns: { status: TaskStatus; labelKey: string }[] = [
    { status: 'todo', labelKey: 'StatusTodo' },
    { status: 'in_progress', labelKey: 'StatusInProgress' },
    { status: 'done', labelKey: 'StatusDone' },
  ];

  protected readonly filteredTasks = computed(() => {
    let list = this.tasks.all();
    const query = this.searchQuery().toLowerCase().trim();
    const status = this.selectedStatusFilter();

    if (status !== 'all') {
      if (status === 'urgent') {
        list = list.filter((t) => t.priority === 'urgent');
      } else {
        list = list.filter((t) => t.status === status);
      }
    }

    if (query) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          (t.description ?? '').toLowerCase().includes(query),
      );
    }

    return list;
  });

  openCreateModal(): void {
    this.newTaskTitle = '';
    this.newTaskDescription = '';
    this.newTaskPriority = 'medium';
    this.newTaskStatus = 'todo';
    this.newTaskDueDate = new Date().toISOString().split('T')[0];
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  submitNewTask(): void {
    if (!this.newTaskTitle.trim()) return;
    this.tasks.createTask({
      title: this.newTaskTitle.trim(),
      description: this.newTaskDescription.trim() || undefined,
      priority: this.newTaskPriority,
      status: this.newTaskStatus,
      dueDate: this.newTaskDueDate,
    });
    this.closeModal();
  }

  getPriorityBadge(priority: TaskPriority): { text: string; bg: string; color: string } {
    switch (priority) {
      case 'urgent':
        return { text: this.i18n.t('PriorityUrgent'), bg: 'bg-red-100 dark:bg-red-950/60', color: 'text-red-700 dark:text-red-300' };
      case 'high':
        return { text: this.i18n.t('PriorityHigh'), bg: 'bg-orange-100 dark:bg-orange-950/60', color: 'text-orange-700 dark:text-orange-300' };
      case 'medium':
        return { text: this.i18n.t('PriorityMedium'), bg: 'bg-blue-100 dark:bg-blue-950/60', color: 'text-blue-700 dark:text-blue-300' };
      default:
        return { text: this.i18n.t('PriorityLow'), bg: 'bg-slate-100 dark:bg-slate-800', color: 'text-slate-600 dark:text-slate-400' };
    }
  }

  getStatusBadge(status: TaskStatus): { text: string; bg: string; color: string } {
    switch (status) {
      case 'done':
        return { text: this.i18n.t('StatusDone'), bg: 'bg-emerald-100 dark:bg-emerald-950/60', color: 'text-emerald-700 dark:text-emerald-300' };
      case 'in_progress':
        return { text: this.i18n.t('StatusInProgress'), bg: 'bg-amber-100 dark:bg-amber-950/60', color: 'text-amber-700 dark:text-amber-300' };
      case 'archived':
        return { text: this.i18n.t('StatusArchived'), bg: 'bg-slate-100 dark:bg-slate-800', color: 'text-slate-500' };
      default:
        return { text: this.i18n.t('StatusTodo'), bg: 'bg-slate-100 dark:bg-slate-800', color: 'text-slate-700 dark:text-slate-300' };
    }
  }
}

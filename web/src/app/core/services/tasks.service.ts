/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { API_BASE_URL } from '../tokens/api.tokens';
import type { Task, TaskDraft, TaskPriority, TaskStatus } from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = inject(API_BASE_URL);

  private readonly tasks = signal<Task[]>([]);
  private readonly loadingState = signal<boolean>(false);

  readonly all = this.tasks.asReadonly();
  readonly loading = this.loadingState.asReadonly();

  readonly byStatus = (status: TaskStatus) =>
    computed(() => this.tasks().filter((task) => task.status === status));

  readonly urgentCount = computed(
    () =>
      this.tasks().filter(
        (task) => task.priority === 'urgent' && task.status !== 'done' && task.status !== 'archived',
      ).length,
  );

  readonly completedToday = computed(() => {
    const today = new Date().toDateString();
    return this.tasks().filter(
      (task) => task.completedAt !== null && new Date(task.completedAt).toDateString() === today,
    ).length;
  });

  readonly pendingCount = computed(
    () => this.tasks().filter((task) => task.status !== 'done' && task.status !== 'archived').length,
  );

  readonly completionRatio = computed(() => {
    const list = this.tasks().filter((task) => task.status !== 'archived');
    if (list.length === 0) return 0;
    const done = list.filter((task) => task.status === 'done').length;
    return Math.round((done / list.length) * 100);
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loadingState.set(true);
    this.http.get<Task[]>(`${this.base}/api/v1/tasks`).subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.loadingState.set(false);
      },
      error: () => {
        // Fallback initial demo tasks if offline / server booting up
        if (this.tasks().length === 0) {
          const now = new Date().toISOString();
          const today = new Date().toISOString().split('T')[0];
          this.tasks.set([
            {
              id: 1,
              userId: this.auth.user()?.id ?? 1,
              title: 'إعداد عرض مشروع أنجز النهاية',
              description: 'مراجعة كافة الواجهات والخدمات والتأكد من دعم الهواتف المحمولة والتخزين في قاعدة البيانات',
              status: 'in_progress',
              priority: 'urgent',
              dueDate: today,
              position: 1,
              mediaUrl: null,
              mediaName: null,
              mediaSizeBytes: null,
              completedAt: null,
              createdAt: now,
              updatedAt: now,
            },
            {
              id: 2,
              userId: this.auth.user()?.id ?? 1,
              title: 'تصميم واجهة المستخدم Responsive',
              description: 'ضبط المقاسات والشاشات للأجهزة الذكية والأجهزة اللوحية وتجربة RTL',
              status: 'done',
              priority: 'high',
              dueDate: today,
              position: 2,
              mediaUrl: null,
              mediaName: null,
              mediaSizeBytes: null,
              completedAt: now,
              createdAt: now,
              updatedAt: now,
            },
            {
              id: 3,
              userId: this.auth.user()?.id ?? 1,
              title: 'ربط APIs قاعدة البيانات MySQL',
              description: 'إنشاء واستدعاء كافة APIs الخاصة بالمهام والذكاء الاصطناعي والمستخدمين',
              status: 'in_progress',
              priority: 'high',
              dueDate: today,
              position: 3,
              mediaUrl: null,
              mediaName: null,
              mediaSizeBytes: null,
              completedAt: null,
              createdAt: now,
              updatedAt: now,
            },
          ]);
        }
        this.loadingState.set(false);
      },
    });
  }

  createTask(draft: Partial<TaskDraft>): Task {
    const now = new Date().toISOString();
    const tempId = Date.now();
    const task: Task = {
      id: tempId,
      userId: this.auth.user()?.id ?? 1,
      title: draft.title?.trim() || 'مهمة جديدة',
      description: draft.description ?? null,
      status: draft.status ?? 'todo',
      priority: draft.priority ?? 'medium',
      dueDate: draft.dueDate ?? new Date().toISOString().split('T')[0],
      mediaUrl: draft.mediaUrl ?? null,
      mediaName: draft.mediaName ?? null,
      mediaSizeBytes: draft.mediaSizeBytes ?? null,
      position: this.tasks().length + 1,
      completedAt: draft.status === 'done' ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    // Optimistic update
    this.tasks.update((list) => [task, ...list]);

    this.http.post<Task>(`${this.base}/api/v1/tasks`, draft).subscribe({
      next: (serverTask) => {
        this.tasks.update((list) => list.map((t) => (t.id === tempId ? serverTask : t)));
      },
      error: (err) => {
        console.warn('API post task error, using optimistic task:', err);
      },
    });

    return task;
  }

  updateTask(id: number, patch: Partial<Task>): void {
    const now = new Date().toISOString();
    this.tasks.update((list) =>
      list.map((task) =>
        task.id === id ? { ...task, ...patch, updatedAt: now } : task,
      ),
    );

    this.http.put<Task>(`${this.base}/api/v1/tasks/${id}`, patch).subscribe({
      next: (res) => {
        this.tasks.update((list) => list.map((t) => (t.id === id ? res : t)));
      },
      error: (err) => {
        console.warn('API update task error:', err);
      },
    });
  }

  setStatus(id: number, status: TaskStatus): void {
    this.updateTask(id, {
      status,
      completedAt: status === 'done' ? new Date().toISOString() : null,
    });
  }

  deleteTask(id: number): void {
    this.tasks.update((list) => list.filter((task) => task.id !== id));
    this.http.delete(`${this.base}/api/v1/tasks/${id}`).subscribe({
      error: (err) => console.warn('API delete task error:', err),
    });
  }

  countByPriority(): Record<TaskPriority, number> {
    const result: Record<TaskPriority, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    for (const task of this.tasks()) {
      result[task.priority]++;
    }
    return result;
  }

  countByStatus(): Record<TaskStatus, number> {
    const result: Record<TaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      done: 0,
      archived: 0,
    };
    for (const task of this.tasks()) {
      result[task.status]++;
    }
    return result;
  }
}
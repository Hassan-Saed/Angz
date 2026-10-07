/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/** Mirrors the `tasks` table status/priority enums in the Laravel schema. */
export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done', 'archived'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export interface Task {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** ISO-8601 date, or null when the task has no deadline. */
  dueDate: string | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaSizeBytes: number | null;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskDraft = Omit<Task, 'id' | 'userId' | 'completedAt' | 'createdAt' | 'updatedAt'>;

export const TASK_COLUMNS: readonly { status: TaskStatus; count: number }[] = [
  { status: 'todo', count: 0 },
  { status: 'in_progress', count: 1 },
  { status: 'done', count: 2 },
];

/** Kanban only renders the three active statuses; archived is list-only. */
export const BOARD_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done'];

export function isOverdue(task: Pick<Task, 'dueDate' | 'status'>, now = new Date()): boolean {
  if (!task.dueDate || task.status === 'done' || task.status === 'archived') {
    return false;
  }
  const due = new Date(task.dueDate);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < now.getTime();
}

export function isDueToday(task: Pick<Task, 'dueDate' | 'status'>, now = new Date()): boolean {
  if (!task.dueDate || task.status === 'done' || task.status === 'archived') {
    return false;
  }
  const due = new Date(task.dueDate);
  return due.toDateString() === now.toDateString();
}

export interface DailySummary {
  date: string;
  urgentCount: number;
  dueTodayCount: number;
  completedCount: number;
  pendingCount: number;
  /** 0-100, rounded. */
  progressPercent: number;
  aiBrief: string | null;
}

/** Subscription-dependent upload ceilings, enforced again server-side. */
export const MEDIA_LIMITS: Record<'free' | 'trial' | 'premium', number> = {
  free: 5 * 1024 * 1024,
  trial: 5 * 1024 * 1024,
  premium: 100 * 1024 * 1024,
};
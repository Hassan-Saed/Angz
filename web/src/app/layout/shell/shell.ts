/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { Icon } from '../../shared/ui/icon';
import { AuthService } from '../../core/services/auth.service';
import { I18nService, type Locale } from '../../core/services/i18n.service';
import { PlatformService } from '../../core/services/platform.service';
import { TasksService } from '../../core/services/tasks.service';
import { ThemeService } from '../../core/services/theme.service';
import type { Task } from '../../core/models/task.model';

interface NavItem {
  labelKey: string;
  path: string;
  icon: 'home' | 'tasks' | 'sparkle' | 'chart' | 'user' | 'settings' | 'shield';
}

const NAV_ITEMS: readonly NavItem[] = [
  { labelKey: 'Dashboard', path: '/dashboard', icon: 'home' },
  { labelKey: 'Tasks', path: '/tasks', icon: 'tasks' },
  { labelKey: 'AiAgent', path: '/ai-agent', icon: 'sparkle' },
  { labelKey: 'Analytics', path: '/analytics', icon: 'chart' },
  { labelKey: 'Profile', path: '/profile', icon: 'user' },
  { labelKey: 'Settings', path: '/settings', icon: 'settings' },
  { labelKey: 'About', path: '/about', icon: 'shield' },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './shell.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly platform = inject(PlatformService);
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly tasksSvc = inject(TasksService);
  private readonly router = inject(Router);

  protected readonly sidebarOpen = signal(false);
  protected readonly searchOpen = signal(false);
  protected readonly notificationsOpen = signal(false);
  protected readonly searchQuery = signal('');

  /**
   * Search only runs once the user confirms, so results never churn on every
   * keystroke and an accidental single character cannot dump the whole list.
   */
  protected readonly searchSubmitted = signal(false);

  /** Latest confirmed query, used to label the result count. */
  protected readonly submittedQuery = signal('');

  protected readonly searchResults = computed<Task[]>(() => {
    if (!this.searchSubmitted()) {
      return [];
    }
    const needle = this.submittedQuery().trim().toLowerCase();
    if (!needle) {
      return [];
    }
    return this.tasksSvc
      .all()
      .filter(
        (task) =>
          task.title.toLowerCase().includes(needle) ||
          (task.description ?? '').toLowerCase().includes(needle),
      )
      .slice(0, 8);
  });

  protected readonly hasSearchResults = computed(
    () => this.searchSubmitted() && this.submittedQuery().trim().length > 0,
  );

  protected readonly isDesktop = this.platform.isDesktop;

  protected readonly navItems = NAV_ITEMS;
  protected readonly bottomNavItems = NAV_ITEMS.slice(0, 4);

  /**
   * Label for the language toggle. It always names the language the user would
   * *switch to*, not the one currently active: while the UI is in English the
   * button reads "العربية", and while it is in Arabic the button reads
   * "الإنجليزية". Naming the target rather than the current state means the
   * button never has to be read as "current: English".
   */
  protected readonly otherLocale = computed<Locale>(() =>
    this.i18n.locale() === 'en' ? 'ar' : 'en',
  );

  protected readonly languageToggleLabel = computed(() =>
    this.i18n.t(this.otherLocale() === 'ar' ? 'SwitchToArabic' : 'SwitchToEnglish'),
  );

  protected readonly userInitials = computed(() => {
    const name = this.auth.user()?.name ?? '';
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  });

  protected toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  protected toggleSearch(): void {
    this.searchOpen.update((v) => !v);
    this.notificationsOpen.set(false);
    if (!this.searchOpen()) {
      this.resetSearch();
    }
  }

  /** Runs the search for the current query. */
  protected submitSearch(): void {
    this.submittedQuery.set(this.searchQuery());
    this.searchSubmitted.set(true);
  }

  /** Jumps to the task board so the chosen task can be acted on. */
  protected openSearchResult(task: Task): void {
    this.closeSearch();
    void this.router.navigate(['/tasks'], { queryParams: { q: task.title } });
  }

  protected resetSearch(): void {
    this.searchQuery.set('');
    this.submittedQuery.set('');
    this.searchSubmitted.set(false);
  }

  protected statusLabel(status: Task['status']): string {
    switch (status) {
      case 'done':
        return this.i18n.t('StatusDone');
      case 'in_progress':
        return this.i18n.t('StatusInProgress');
      case 'archived':
        return this.i18n.t('StatusArchived');
      default:
        return this.i18n.t('StatusTodo');
    }
  }

  protected toggleNotifications(): void {
    this.notificationsOpen.update((v) => !v);
    this.searchOpen.set(false);
  }

  protected closeSearch(): void {
    this.searchOpen.set(false);
    this.resetSearch();
  }

  protected closeNotifications(): void {
    this.notificationsOpen.set(false);
  }

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  protected toggleLanguage(): void {
    this.i18n.toggleLocale();
  }

  protected logout(): void {
    this.auth.logout();
  }

  protected isActive(path: string): boolean {
    const url = this.router.url.split('?')[0];
    return url === path || url.startsWith(`${path}/`);
  }
}

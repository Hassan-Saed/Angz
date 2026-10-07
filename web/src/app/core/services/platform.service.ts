/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

/** Matches Tailwind's `lg` breakpoint, kept in sync with the Tailwind theme. */
export const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

export type LayoutMode = 'desktop' | 'mobile';

/**
 * Viewport-derived layout state.
 *
 * The web app shows a persistent sidebar from `lg` up and a slide-over drawer
 * below it. Keeping the breakpoint in one place means the shell and the
 * "dialog on desktop / bottom sheet on mobile" decision can never disagree
 * with the Tailwind classes.
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly desktopMatches = signal(false);
  private readonly viewportWidth = signal(0);

  /** Overridable for tests and for forcing a layout while debugging. */
  readonly forceLayout = signal<'auto' | LayoutMode>('auto');

  readonly isDesktop = computed(() => this.desktopMatches());
  readonly width = computed(() => this.viewportWidth());

  readonly layout = computed<LayoutMode>(() => {
    const forced = this.forceLayout();
    return forced === 'auto' ? (this.desktopMatches() ? 'desktop' : 'mobile') : forced;
  });

  /**
   * True when an action should render as a centred dialog rather than a
   * bottom sheet, so forms like "Add Task" stay in context on both.
   */
  readonly prefersDialog = computed(() => this.layout() === 'desktop');

  constructor() {
    if (this.isBrowser) {
      this.watch();
    }
  }

  private watch(): void {
    const view = this.document.defaultView;
    if (!view) {
      return;
    }

    const query = view.matchMedia(DESKTOP_MEDIA_QUERY);
    const sync = () => this.desktopMatches.set(query.matches);
    sync();

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', sync);
    } else {
      // Safari < 14 and older WebKit builds only expose the deprecated API.
      query.addListener(sync);
    }

    view.addEventListener('resize', () => this.viewportWidth.set(view.innerWidth));
    this.viewportWidth.set(view.innerWidth);
  }
}
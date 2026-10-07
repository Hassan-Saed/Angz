/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';

/**
 * Reveals `text` one character at a time, like a chat transcript being typed.
 *
 * Implemented as a component rather than a DOM-reading attribute directive on
 * purpose. A directive that inspects `element.textContent` in `ngOnInit` reads
 * the *unresolved* template source (`{{ i18n.t('x') }}`), which is why the
 * previous attempt printed raw translation keys and then froze on whichever
 * language happened to be active when it first ran.
 *
 * Here Angular binds `[text]` normally, so the value is already-translated
 * text. The effect re-runs whenever it changes (e.g. the user switches
 * language) and `onCleanup` cancels the previous timers, so there is no stale
 * interval left appending to the new string.
 */
@Component({
  selector: 'app-typewriter',
  template: `<span>{{ visible() }}</span>@if (typing()) {<span class="typewriter-caret" aria-hidden="true"></span>}`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Typewriter {
  /** Full text to reveal. Changing it restarts the animation. */
  readonly text = input('');
  /** Milliseconds between characters. */
  readonly speed = input(45);
  /** Milliseconds to wait before the first character appears. */
  readonly delay = input(0);

  protected readonly visible = signal('');
  protected readonly typing = signal(false);

  private readonly document = inject(DOCUMENT);

  constructor() {
    effect((onCleanup) => {
      const full = this.text();
      const speed = Math.max(1, this.speed());

      this.visible.set('');
      this.typing.set(false);

      // Respect the OS "reduce motion" setting: show the text immediately
      // rather than animating, instead of fighting the user's preference.
      if (this.prefersReducedMotion() || !full) {
        this.visible.set(full);
        return;
      }

      let index = 0;
      let interval: ReturnType<typeof setInterval> | undefined;
      this.typing.set(true);

      const startTimer = setTimeout(() => {
        interval = setInterval(() => {
          index += 1;
          this.visible.set(full.slice(0, index));
          if (index >= full.length && interval) {
            clearInterval(interval);
            interval = undefined;
            this.typing.set(false);
          }
        }, speed);
      }, Math.max(0, this.delay()));

      onCleanup(() => {
        clearTimeout(startTimer);
        if (interval) {
          clearInterval(interval);
        }
        this.typing.set(false);
      });
    });
  }

  private prefersReducedMotion(): boolean {
    return this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
  }
}
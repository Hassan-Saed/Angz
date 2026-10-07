/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Component, ElementRef, ViewChild, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Icon } from '../../shared/ui/icon';
import { Typewriter } from '../../shared/ui/typewriter';
import { AiAgentService } from '../../core/services/ai-agent.service';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-ai-agent-page',
  standalone: true,
  imports: [CommonModule, FormsModule, Icon, Typewriter],
  templateUrl: './ai-agent-page.html',
})
export class AiAgentPage {
  protected readonly agent = inject(AiAgentService);
  protected readonly i18n = inject(I18nService);

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLUListElement>;

protected readonly draft = signal('');

  constructor() {
    // History is fetched here rather than in the service constructor so the
    // cost is only paid when this page is actually opened.
    this.agent.loadHistory();

    // Keep the newest message in view as the conversation grows, without
    // reading the list inside an effect (which would re-run on every append
    // and force a change-detection pass per message).
    effect(() => {
      this.agent.messages().length;
      this.scrollToBottom();
    });
  }

  sendSuggestion(text: string): void {
    this.draft.set(text);
    this.send();
  }

  send(): void {
    const text = this.draft().trim();
    if (!text || this.agent.loading()) return;

    this.draft.set('');
    this.agent.send(text).subscribe({
      next: () => this.scrollToBottom(),
    });
  }

  clear(): void {
    this.agent.clear();
  }

  private scrollToBottom(): void {
    // rAF rather than a fixed timeout: the DOM for a new message is committed
    // on the next frame, so this avoids a second layout pass.
    requestAnimationFrame(() => {
      const el = this.scrollContainer?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}

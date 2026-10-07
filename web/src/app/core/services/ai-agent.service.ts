import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';

import { I18nService } from './i18n.service';
import { API_BASE_URL } from '../tokens/api.tokens';
import type { AiMessage } from '../models/ai.model';

/**
 * Client-side fallback copy, shown only when the API is unreachable.
 * Mirrors the server's `COPY` in backend/routes/ai.js so an offline user still
 * gets a reply in their language instead of a hard-coded string.
 */
const FALLBACK_COPY = {
  ar: {
    welcome:
      'مرحبًا! أنا مساعدك الذكي في أنجز. أستطيع مساعدتك في ترتيب أهدافك وتنظيم يومك. ' +
      'اسألني مثلًا: «ما الأولوية اليوم؟» أو «اقترح خطة لإنجاز مهامي العاجلة».',
    reply:
      'أولويتك اليوم هي التركيز على المهمة العاجلة، وقسّم مهامك المعقدة إلى خانات زمنية قصيرة. ' +
      'تعذّر الاتصال بالخادم في الوقت الحالي، لذا هذه نصيحة عامة.',
  },
  en: {
    welcome:
      'Hello! I am your smart assistant in Angz. I can help you plan your goals and organise your day. ' +
      'Ask me things like "What is the priority today?" or "Suggest a plan for my urgent tasks".',
    reply:
      'Your priority today is to focus on the urgent task, and split complex work into short time blocks. ' +
      'The server was unreachable, so this is general guidance.',
  },
} as const;

/**
 * Upper bound on how many messages are rendered at once.
 *
 * History grows without limit, and every entry is a DOM node inside a
 * change-detected `@for`. Rendering thousands of them makes typing in the
 * composer progressively slower. Older messages stay in the database and are
 * still counted by the server; only the visible window is capped.
 */
const MAX_RENDERED_MESSAGES = 150;

@Injectable({ providedIn: 'root' })
export class AiAgentService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly i18n = inject(I18nService);

  /** Copy for the active locale, re-read whenever the language changes. */
  private readonly copy = computed(() =>
    this.i18n.locale() === 'ar' ? FALLBACK_COPY.ar : FALLBACK_COPY.en,
  );

  private readonly all = signal<AiMessage[]>([]);
  private readonly loadingState = signal<boolean>(false);

  /** The slice actually handed to the template. */
  readonly messages = computed(() => {
    const list = this.all();
    return list.length > MAX_RENDERED_MESSAGES
      ? list.slice(list.length - MAX_RENDERED_MESSAGES)
      : list;
  });

  readonly loading = this.loadingState.asReadonly();

  constructor() {
    // Seed with a welcome message so the panel is never blank. The history
    // request is deliberately NOT fired here: this service is root-provided,
    // so doing it in the constructor would download the entire conversation on
    // every page of the app, including pages that never show the chat. The AI
    // page calls `loadHistory()` when it opens.
    this.all.set([this.assistantMessage(this.copy().welcome)]);
  }

  loadHistory(): void {
    this.http
      .get<AiMessage[]>(`${this.base}/api/v1/ai/history`, {
        params: { locale: this.i18n.locale() },
      })
      .subscribe({
        next: (list) => {
          this.all.set(list && list.length > 0 ? list : [this.assistantMessage(this.copy().welcome)]);
        },
        error: () => {
          // Offline: keep the locally seeded welcome message.
        },
      });
  }

  send(content: string): Observable<AiMessage> {
    const text = content.trim();
    if (!text) {
      return of(this.assistantMessage(''));
    }

    const tempUserMsg: AiMessage = {
      id: Date.now(),
      conversationId: 1,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    this.all.update((list) => [...list, tempUserMsg]);
    this.loadingState.set(true);

    return this.http
      .post<AiMessage>(`${this.base}/api/v1/ai/chat`, {
        prompt: text,
        content: text,
        locale: this.i18n.locale(),
      })
      .pipe(
        tap((responseMsg) => {
          this.all.update((list) => [...list, responseMsg]);
          this.loadingState.set(false);
        }),
        catchError((err) => {
          console.warn('AI chat API unavailable, using local fallback:', err);
          const fallbackMsg = this.assistantMessage(this.copy().reply);
          this.all.update((list) => [...list, fallbackMsg]);
          this.loadingState.set(false);
          return of(fallbackMsg);
        }),
      );
  }

  clear(): void {
    this.http
      .post(`${this.base}/api/v1/ai/clear`, { locale: this.i18n.locale() })
      .subscribe({
        next: () => this.all.set([this.assistantMessage(this.copy().welcome)]),
        error: () => this.all.set([this.assistantMessage(this.copy().welcome)]),
      });
  }

  private assistantMessage(content: string): AiMessage {
    return {
      id: Date.now(),
      conversationId: 1,
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
    };
  }
}
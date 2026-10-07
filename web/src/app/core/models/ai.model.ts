/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
export type AiRole = 'user' | 'assistant';

export interface AiMessage {
  id: number;
  conversationId: number | null;
  role: AiRole;
  content: string;
  createdAt: string;
}

export interface AiConversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface AiChatResponse {
  message: AiMessage;
  conversationId: number;
}
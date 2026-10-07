/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { InjectionToken } from '@angular/core';

/** Base URL of the Laravel API. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => 'http://127.0.0.1:3000',
});

/**
 * Shape of `public/assets/config.json`, so the API base URL and Google client
 * id can change per environment without a rebuild.
 */
export interface RuntimeConfig {
  apiBaseUrl: string;
  googleClientId: string;
}
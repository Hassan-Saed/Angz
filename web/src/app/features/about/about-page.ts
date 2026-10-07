/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Icon } from '../../shared/ui/icon';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-about-page',
  standalone: true,
  imports: [CommonModule, Icon],
  templateUrl: './about-page.html',
})
export class AboutPage {
  protected readonly i18n = inject(I18nService);

  /** Kept in one place so the year never drifts from the LICENSE file. */
  protected readonly year = new Date().getFullYear();

  protected readonly techStack = computed(() => [
    this.i18n.t('TechFrontend'),
    this.i18n.t('TechBackend'),
    this.i18n.t('TechDatabase'),
    this.i18n.t('TechAuth'),
  ]);
}
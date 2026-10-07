/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Component, inject } from '@angular/core';

import { AuthService } from '../../core/services/auth.service';
import { Typewriter } from '../../shared/ui/typewriter';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-billing-page',
  imports: [Typewriter],
  templateUrl: './billing-page.html',
})
export class BillingPage {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  upgrade(): void {
    window.alert(this.i18n.t('PlanPremium'));
  }
}

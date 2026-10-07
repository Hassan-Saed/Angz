/*
 * Copyright (c) 2026 Hassan Saed Mohamed. All Rights Reserved.
 * SPDX-License-Identifier: LicenseRef-Proprietary
 * No licence is granted. See LICENSE for permitted and prohibited uses.
 */
import { Routes } from '@angular/router';

import { ProfilePage } from './profile-page';

export const PROFILE_ROUTES: Routes = [
  { path: '', component: ProfilePage },
  {
    path: 'billing',
    loadComponent: () =>
      import('../billing/billing-page').then((m) => m.BillingPage),
  },
];



import { Routes } from '@angular/router';
import { HomePage } from './pages/home';
import { PlanPage } from './pages/plan';
import { GuidePage } from './pages/guide';
import { ProviderPage, ReviewsPage } from './pages/reviews';
import { PvgenPage } from './pages/pvgen';
import { CookiesPage, PrivacyPage } from './pages/legal';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'SunSorted | Solar planner for Irish homes' },
  { path: 'plan', component: PlanPage, title: 'Plan your solar | SunSorted' },
  { path: 'guide/esb-data', component: GuidePage, title: 'Get your ESB smart meter data | SunSorted' },
  { path: 'reviews', component: ReviewsPage, title: 'Solar installer reviews | SunSorted' },
  { path: 'reviews/:slug', component: ProviderPage, title: 'Installer reviews | SunSorted' },
  { path: 'pvgen', component: PvgenPage, title: 'PVGen introductions | SunSorted' },
  { path: 'privacy', component: PrivacyPage, title: 'Privacy policy | SunSorted' },
  { path: 'cookies', component: CookiesPage, title: 'Cookie policy | SunSorted' },
  { path: '**', redirectTo: '' },
];

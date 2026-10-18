import { Routes } from '@angular/router';
import { HomePage } from './pages/home';
import { PlanPage } from './pages/plan';
import { GuidePage } from './pages/guide';
import { ProviderPage, ReviewsPage } from './pages/reviews';
import { QuotePage } from './pages/quote';
import { SeaiPage } from './pages/seai';
import { CookiesPage, PrivacyPage } from './pages/legal';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'GreenWattz | Solar planner for Irish homes' },
  { path: 'plan', component: PlanPage, title: 'Plan your solar | GreenWattz' },
  { path: 'guide/esb-data', component: GuidePage, title: 'Get your ESB smart meter data | GreenWattz' },
  { path: 'reviews', component: ReviewsPage, title: 'Solar installer reviews | GreenWattz' },
  { path: 'reviews/:slug', component: ProviderPage, title: 'Installer reviews | GreenWattz' },
  { path: 'seai-installers', component: SeaiPage, title: 'SEAI registered solar companies | GreenWattz' },
  { path: 'quote', component: QuotePage, title: 'Find installers | GreenWattz' },
  { path: 'privacy', component: PrivacyPage, title: 'Privacy policy | GreenWattz' },
  { path: 'cookies', component: CookiesPage, title: 'Cookie policy | GreenWattz' },
  { path: '**', redirectTo: '' },
];

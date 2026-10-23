import { Routes } from '@angular/router';
import { HomePage } from './pages/home';
import { PlanPage, stepIndex } from './pages/plan';
import { GuidePage } from './pages/guide';
import { ProviderPage, ReviewsPage } from './pages/reviews';
import { QuotePage } from './pages/quote';
import { SeaiPage } from './pages/seai';
import { EstimatesPage } from './pages/estimates';
import { BlogPage, PostPage } from './pages/blog';
import { GlossaryPage } from './pages/glossary';
import { postBySlug } from './data/posts';
import { CookiesPage, PrivacyPage } from './pages/legal';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'GreenWattz | Solar planner for Irish homes' },
  {
    path: 'plan', component: PlanPage, runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    title: (route) => `${['Usage', 'Home', 'Your plan'][stepIndex(route.queryParamMap.get('step'))]} | Plan your solar | GreenWattz`,
  },
  { path: 'guide/esb-data', component: GuidePage, title: 'Get your ESB smart meter data | GreenWattz' },
  { path: 'reviews', component: ReviewsPage, title: 'Solar installer reviews | GreenWattz' },
  { path: 'reviews/:slug', component: ProviderPage, title: 'Installer reviews | GreenWattz' },
  { path: 'seai-installers', component: SeaiPage, title: 'SEAI registered solar companies | GreenWattz' },
  { path: 'estimates', component: EstimatesPage, title: 'How we estimate | GreenWattz' },
  { path: 'blog', component: BlogPage, title: 'Guides and news | GreenWattz' },
  { path: 'blog/:slug', component: PostPage, title: (route) => { const p = postBySlug(route.paramMap.get('slug')); return (p ? p.title : 'Article not found') + ' | GreenWattz'; } },
  { path: 'glossary', component: GlossaryPage, title: 'Solar glossary for Irish homeowners | GreenWattz' },
  { path: 'quote', component: QuotePage, title: 'Find installers | GreenWattz' },
  { path: 'account', loadComponent: () => import('./pages/account').then((m) => m.AccountPage), title: 'Your account | GreenWattz' },
  { path: 'compare-quotes', loadComponent: () => import('./pages/quote-compare').then((m) => m.QuoteComparePage), title: 'Compare your solar quotes | GreenWattz' },
  { path: 'check-quote', loadComponent: () => import('./pages/quote-check').then((m) => m.QuoteCheckPage), title: 'Is your solar quote a fair price? | GreenWattz' },
  { path: 'privacy', component: PrivacyPage, title: 'Privacy policy | GreenWattz' },
  { path: 'cookies', component: CookiesPage, title: 'Cookie policy | GreenWattz' },
  { path: '**', redirectTo: '' },
];

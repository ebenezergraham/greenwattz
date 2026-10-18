import { Routes } from '@angular/router';
import { HomePage } from './pages/home';
import { PlanPage, STEP_KEYS } from './pages/plan';
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
    title: (route) => { const k = route.queryParamMap.get('step'); const i = STEP_KEYS.indexOf(k ?? 'usage'); return `${['Usage', 'Home', 'Strategy', 'Cost'][i < 0 ? 0 : i]} | Plan your solar | GreenWattz`; },
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
  { path: 'privacy', component: PrivacyPage, title: 'Privacy policy | GreenWattz' },
  { path: 'cookies', component: CookiesPage, title: 'Cookie policy | GreenWattz' },
  { path: '**', redirectTo: '' },
];

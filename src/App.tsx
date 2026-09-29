import { useStore } from './lib/store';
import { routeStore, buildHash } from './router';
import { settingsStore } from './settings';
import { Icon } from './ui/Icon';
import { Toast } from './ui/Toast';
import { UpdateBanner } from './ui/UpdateBanner';
import { AddView } from './views/Add';
import { DiaryView } from './views/Diary';
import { FoodEditorView } from './views/FoodEditor';
import { ProductsView } from './views/Products';
import { RecipeEditorView } from './views/RecipeEditor';
import { ScannerView } from './views/Scanner';
import { AiEstimateView } from './views/AiEstimate';
import { Onboarding } from './views/Onboarding';
import { SettingsView } from './views/Settings';
import { StatsView } from './views/Stats';
import { diaryDate } from './uiState';
import type { ComponentType } from 'preact';

const ROUTES: Record<string, { view: ComponentType; tabbar: boolean }> = {
  '/': { view: DiaryView, tabbar: true },
  '/dodaj': { view: AddView, tabbar: false },
  '/statystyki': { view: StatsView, tabbar: true },
  '/ustawienia': { view: SettingsView, tabbar: true },
  '/produkty': { view: ProductsView, tabbar: true },
  '/produkt': { view: FoodEditorView, tabbar: false },
  '/przepis': { view: RecipeEditorView, tabbar: false },
  '/skaner': { view: ScannerView, tabbar: false },
  '/ai': { view: AiEstimateView, tabbar: false },
};

export function App() {
  const route = useStore(routeStore);
  const settings = useStore(settingsStore);
  const date = useStore(diaryDate);
  if (!settings.onboarded) {
    return (
      <div class="app">
        <Onboarding />
        <Toast />
      </div>
    );
  }
  const r = ROUTES[route.path] ?? ROUTES['/'];
  const View = r.view;
  return (
    <div class="app">
      <UpdateBanner />
      <main key={route.path}>
        <View />
      </main>
      {r.tabbar && (
        <nav class="tabbar" aria-label="Nawigacja">
          <Tab href="/" icon="book" label="Dziennik" current={route.path === '/'} />
          <Tab href="/statystyki" icon="chart" label="Statystyki" current={route.path === '/statystyki'} />
          <a class="fab" href={buildHash('/dodaj', { d: date })} aria-label="Dodaj jedzenie" data-testid="fab">
            <Icon name="plus" />
          </a>
          <Tab href="/produkty" icon="box" label="Produkty" current={route.path === '/produkty'} />
          <Tab href="/ustawienia" icon="settings" label="Ustawienia" current={route.path === '/ustawienia'} />
        </nav>
      )}
      <Toast />
    </div>
  );
}

function Tab({ href, icon, label, current }: { href: string; icon: string; label: string; current: boolean }) {
  return (
    <a href={buildHash(href)} aria-current={current ? 'page' : undefined}>
      <Icon name={icon} />
      {label}
    </a>
  );
}

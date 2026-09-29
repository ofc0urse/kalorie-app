import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore } from '../lib/store';
import type { Food } from '../lib/types';
import { localPool, runUsdaSearch, searchLocal, useOffSearch, type OnlineState } from '../search';
import { dataVersion, settingsStore } from '../settings';
import { FoodList } from './FoodList';
import { Icon } from './Icon';

/** Wyniki wyszukiwania: lokalne (od razu) + Open Food Facts (z opóźnieniem) + USDA (na żądanie). */
export function SearchResults({ q, onPick, onCreate }: { q: string; onPick: (f: Food) => void; onCreate?: (name: string) => void }) {
  const settings = useStore(settingsStore);
  const version = useStore(dataVersion);
  const [pool, setPool] = useState<{ foods: Food[]; usage: Map<string, number> } | null>(null);
  const [usda, setUsda] = useState<OnlineState>({ status: 'idle', foods: [] });
  useEffect(() => {
    void localPool().then(setPool);
  }, [version]);
  useEffect(() => setUsda({ status: 'idle', foods: [] }), [q]);

  const local = useMemo(() => (pool ? searchLocal(q, pool.foods, pool.usage) : []), [q, pool]);
  const localIds = useMemo(() => new Set(local.map((f) => f.id)), [local]);
  const off = useOffSearch(q, settings.offPreferPoland);
  const offFoods = off.foods.filter((f) => !localIds.has(f.id));

  return (
    <div data-testid="search-results">
      <section class="card mt" style={{ padding: '4px 12px' }} aria-label="Produkty na urządzeniu">
        <FoodList foods={local} onPick={onPick} empty={q.trim().length >= 2 ? 'Brak wyników w bazie na urządzeniu.' : 'Wpisz co najmniej 2 litery.'} />
      </section>

      <h2 class="section-label row">
        <span class="grow">Open Food Facts</span>
        {(off.status === 'loading' || off.status === 'waiting') && <span class="spinner" aria-label="Szukam" />}
      </h2>
      <section class="card" style={{ padding: '4px 12px' }} aria-label="Wyniki Open Food Facts" data-testid="off-results">
        {off.status === 'idle' && <p class="empty small">Wpisz co najmniej 3 litery, aby szukać produktów ze sklepów.</p>}
        {off.status === 'waiting' && <p class="empty small">Za chwilę szukam…</p>}
        {off.status === 'loading' && <p class="empty small">Szukam w Open Food Facts…</p>}
        {(off.status === 'error' || off.status === 'limited' || off.status === 'offline') && (
          <div class="empty small stack">
            <span>{off.message}</span>
            {off.status !== 'offline' && (
              <button class="btn small outline" onClick={off.retry}>
                Spróbuj ponownie
              </button>
            )}
          </div>
        )}
        {off.status === 'done' && <FoodList foods={offFoods} onPick={onPick} empty="Brak nowych wyników w Open Food Facts." />}
      </section>

      <h2 class="section-label">USDA (nazwy angielskie)</h2>
      <section class="card" style={{ padding: '4px 12px' }} data-testid="usda-results">
        {usda.status === 'idle' && (
          <div class="empty">
            <button
              class="btn small outline"
              disabled={q.trim().length < 2}
              onClick={async () => {
                setUsda({ status: 'loading', foods: [] });
                setUsda(await runUsdaSearch(q, settings.usdaApiKey));
              }}
              data-testid="usda-search"
            >
              <Icon name="search" class="sm" /> Szukaj „{q.trim()}” w USDA
            </button>
          </div>
        )}
        {usda.status === 'loading' && <p class="empty small">Szukam w USDA…</p>}
        {usda.status !== 'idle' && usda.status !== 'loading' && usda.status !== 'done' && <p class="empty small">{usda.message}</p>}
        {usda.status === 'done' && <FoodList foods={usda.foods} onPick={onPick} empty="Brak wyników. Spróbuj po angielsku, np. „apple”." />}
      </section>

      {onCreate && (
        <button class="btn outline block mt" onClick={() => onCreate(q.trim())} data-testid="create-from-search">
          <Icon name="plus" class="sm" /> Dodaj własny produkt „{q.trim()}”
        </button>
      )}
      <p class="tiny muted center mt">
        Dane z Open Food Facts (licencja ODbL) i USDA FoodData Central tworzą społeczność i instytucje – sprawdzaj wartości z etykietą.
      </p>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'preact/hooks';
import { allFavorites, recentFoods, type FavoriteRow, type RecentRow } from '../db/db';
import { today } from '../lib/date';
import { fmt0 } from '../lib/nutrition';
import { useStore } from '../lib/store';
import { matchScore } from '../lib/text';
import type { Food } from '../lib/types';
import { goBack, navigate, routeStore } from '../router';
import { dataVersion, settingsStore } from '../settings';
import { diaryDate } from '../uiState';
import { FoodSheet } from '../ui/FoodSheet';
import { Icon } from '../ui/Icon';
import { QuickAddSheet } from '../ui/QuickAddSheet';
import { SourceBadge } from '../ui/SourceBadge';

type Tab = 'recent' | 'fav';

export function AddView() {
  const route = useStore(routeStore);
  const settings = useStore(settingsStore);
  const version = useStore(dataVersion);
  const date = route.params.get('d') || diaryDate.get() || today();
  const [meal, setMeal] = useState(route.params.get('m') || guessMeal(settings.meals.map((m) => m.id)));
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('recent');
  const [recents, setRecents] = useState<RecentRow[]>([]);
  const [favs, setFavs] = useState<FavoriteRow[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [quick, setQuick] = useState(false);

  useEffect(() => {
    void recentFoods(40).then(setRecents);
    void allFavorites().then(setFavs);
  }, [version]);

  const mealName = settings.meals.find((m) => m.id === meal)?.name ?? 'Posiłek';
  const localHits = useMemo(() => {
    if (!q.trim()) return [];
    const pool = new Map<string, Food>();
    for (const r of recents) pool.set(r.food.id, r.food);
    for (const f of favs) pool.set(f.food.id, f.food);
    return [...pool.values()]
      .map((f) => ({ f, s: matchScore(`${f.name} ${f.brand ?? ''}`, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.f);
  }, [q, recents, favs]);

  const afterAdd = () => {
    diaryDate.set(date);
  };

  return (
    <div class="page no-tabbar" data-testid="add-view">
      <header class="topbar">
        <button class="icon-btn" onClick={() => goBack()} aria-label="Wstecz">
          <Icon name="back" />
        </button>
        <h1>
          <label class="visually-hidden" for="meal-pick">
            Posiłek
          </label>
          <select
            id="meal-pick"
            class="select"
            style={{ minHeight: 40, width: 'auto', fontWeight: 700, border: 0, background: 'transparent', paddingRight: 30 }}
            value={meal}
            onChange={(e) => setMeal((e.currentTarget as HTMLSelectElement).value)}
            data-testid="add-meal-select"
          >
            {settings.meals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </h1>
        <button class="icon-btn" onClick={() => navigate('/')} aria-label="Gotowe – wróć do dziennika">
          <Icon name="check" />
        </button>
      </header>

      <div class="searchbar">
        <Icon name="search" />
        <input
          class="input"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          placeholder="Szukaj produktu, np. jabłko"
          value={q}
          onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
          aria-label="Szukaj produktu"
          data-testid="search"
        />
        {q && (
          <button class="icon-btn clear" onClick={() => setQ('')} aria-label="Wyczyść">
            <Icon name="x" class="sm" />
          </button>
        )}
      </div>

      {!q && (
        <div class="quick-actions mt">
          <button onClick={() => navigate('/skaner', { d: date, m: meal })} data-testid="qa-scan">
            <Icon name="barcode" />
            Skanuj kod
          </button>
          <button onClick={() => navigate('/ai', { d: date, m: meal })} data-testid="qa-photo">
            <Icon name="camera" />
            Zdjęcie (AI)
          </button>
          <button onClick={() => navigate('/ai', { d: date, m: meal, tryb: 'opis' })} data-testid="qa-describe">
            <Icon name="text" />
            Opisz posiłek
          </button>
          <button onClick={() => setQuick(true)} data-testid="qa-quick">
            <Icon name="flash" />
            Szybkie kcal
          </button>
        </div>
      )}

      {q ? (
        <section class="mt">
          <FoodList foods={localHits} onPick={setSelected} empty="Brak wyników wśród ostatnich i ulubionych." />
        </section>
      ) : (
        <>
          <div class="seg mt" role="group" aria-label="Lista">
            <button aria-pressed={tab === 'recent'} onClick={() => setTab('recent')}>
              Ostatnie
            </button>
            <button aria-pressed={tab === 'fav'} onClick={() => setTab('fav')}>
              Ulubione
            </button>
          </div>
          <section class="card mt" style={{ padding: '4px 12px' }}>
            {tab === 'recent' && (
              <FoodList foods={recents.map((r) => r.food)} onPick={setSelected} empty="Tu pojawią się ostatnio dodawane produkty." />
            )}
            {tab === 'fav' && <FoodList foods={favs.map((f) => f.food)} onPick={setSelected} empty="Oznacz produkt gwiazdką, aby trafił do ulubionych." />}
          </section>
        </>
      )}

      {selected && <FoodSheet food={selected} date={date} meal={meal} onClose={() => setSelected(null)} onAdded={afterAdd} />}
      {quick && <QuickAddSheet date={date} meal={meal} onClose={() => setQuick(false)} onAdded={afterAdd} />}
      <p class="tiny muted center mt">
        Dodajesz do: {mealName}, {date === today() ? 'dzisiaj' : date}
      </p>
    </div>
  );
}

export function FoodList({ foods, onPick, empty }: { foods: Food[]; onPick: (f: Food) => void; empty?: string }) {
  if (!foods.length) return empty ? <p class="empty small">{empty}</p> : null;
  return (
    <div class="list">
      {foods.map((f) => (
        <FoodRow key={f.id} food={f} onPick={onPick} />
      ))}
    </div>
  );
}

export function FoodRow({ food, onPick }: { food: Food; onPick: (f: Food) => void }) {
  const unit = food.unit === 'ml' ? 'ml' : 'g';
  const p = food.portions?.[0];
  return (
    <button class="list-item" onClick={() => onPick(food)} data-testid="food-row">
      <div class="grow">
        <div class="title ellipsis">
          {food.name} <SourceBadge source={food.source} />
        </div>
        <div class="sub ellipsis">
          {food.brand ? `${food.brand} · ` : ''}
          {fmt0(food.per100.kcal)} kcal / 100 {unit}
          {p ? ` · ${p.label} ${fmt0(p.grams)} ${unit}` : ''}
        </div>
      </div>
      <Icon name="plus" class="sm accent" />
    </button>
  );
}

/** Domyślny posiłek wg pory dnia. */
export function guessMeal(ids: string[], hour = new Date().getHours()): string {
  const pick = (id: string) => (ids.includes(id) ? id : ids[0]);
  if (hour < 11) return pick('breakfast');
  if (hour < 16) return pick('lunch');
  if (hour < 21) return pick('dinner');
  return pick('snacks');
}

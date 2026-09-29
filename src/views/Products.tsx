import { useEffect, useMemo, useState } from 'preact/hooks';
import { allFavorites, allFoods, allRecipes, type FavoriteRow } from '../db/db';
import { BASIC_CATEGORIES, BASIC_FOODS } from '../data/basicFoods';
import { fmt0, recipeToFood } from '../lib/nutrition';
import { useStore } from '../lib/store';
import { matchScore } from '../lib/text';
import type { Food, Recipe } from '../lib/types';
import { navigate, routeStore } from '../router';
import { dataVersion } from '../settings';
import { diaryDate } from '../uiState';
import { FoodList } from '../ui/FoodList';
import { FoodSheet } from '../ui/FoodSheet';
import { Icon } from '../ui/Icon';

type Tab = 'mine' | 'recipes' | 'fav' | 'basic';

export function ProductsView() {
  const version = useStore(dataVersion);
  const route = useStore(routeStore);
  const tab = (route.params.get('t') as Tab) || 'mine';
  const setTab = (t: Tab) => navigate('/produkty', { t }, true);
  const [foods, setFoods] = useState<Food[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [favs, setFavs] = useState<FavoriteRow[]>([]);
  const [cat, setCat] = useState(BASIC_CATEGORIES[0]);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<Food | null>(null);

  useEffect(() => {
    void allFoods().then((f) => setFoods(f.filter((x) => x.source === 'custom').sort((a, b) => a.name.localeCompare(b.name, 'pl'))));
    void allRecipes().then(setRecipes);
    void allFavorites().then(setFavs);
  }, [version]);

  const filtered = useMemo(() => {
    const f = (list: Food[]) => (filter.trim() ? list.filter((x) => matchScore(`${x.name} ${x.brand ?? ''}`, filter) > 0) : list);
    return {
      mine: f(foods),
      fav: f(favs.map((x) => x.food)),
      basic: filter.trim() ? f(BASIC_FOODS) : BASIC_FOODS.filter((x) => x.category === cat),
    };
  }, [foods, favs, filter, cat]);

  return (
    <div class="page" data-testid="products">
      <header class="topbar">
        <span class="spacer" />
        <h1>Produkty</h1>
        <span class="spacer" />
      </header>
      <div class="seg" role="group" aria-label="Kategoria listy">
        <button aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>
          Moje
        </button>
        <button aria-pressed={tab === 'recipes'} onClick={() => setTab('recipes')}>
          Przepisy
        </button>
        <button aria-pressed={tab === 'fav'} onClick={() => setTab('fav')}>
          Ulubione
        </button>
        <button aria-pressed={tab === 'basic'} onClick={() => setTab('basic')}>
          Baza
        </button>
      </div>

      {tab !== 'recipes' && (
        <div class="searchbar mt">
          <Icon name="search" />
          <input class="input" type="search" placeholder="Filtruj" value={filter} onInput={(e) => setFilter((e.currentTarget as HTMLInputElement).value)} aria-label="Filtruj listę" />
        </div>
      )}

      {tab === 'mine' && (
        <>
          <button class="btn primary block mt" onClick={() => navigate('/produkt')} data-testid="new-food">
            <Icon name="plus" class="sm" /> Nowy produkt
          </button>
          <section class="card mt" style={{ padding: '4px 12px' }}>
            <FoodList foods={filtered.mine} onPick={(f) => navigate('/produkt', { id: f.id })} empty="Nie masz jeszcze własnych produktów. Dodaj je ręcznie albo skanując kod kreskowy." />
          </section>
        </>
      )}

      {tab === 'recipes' && (
        <>
          <button class="btn primary block mt" onClick={() => navigate('/przepis')} data-testid="new-recipe">
            <Icon name="pot" class="sm" /> Nowy przepis
          </button>
          <section class="card mt" style={{ padding: '4px 12px' }}>
            {recipes.length === 0 && <p class="empty small">Przepis to potrawa z kilku składników – np. owsianka, zupa, sałatka. Policzysz ją raz i dodasz porcją.</p>}
            <div class="list">
              {recipes.map((r) => {
                const f = recipeToFood(r);
                return (
                  <button class="list-item" key={r.id} onClick={() => navigate('/przepis', { id: r.id })} data-testid="recipe-row">
                    <div class="grow">
                      <div class="title ellipsis">{r.name}</div>
                      <div class="sub">
                        {r.ingredients.length} składn. · porcja {fmt0(f.portions[0].grams)} g · {fmt0((f.per100.kcal * f.portions[0].grams) / 100)} kcal
                      </div>
                    </div>
                    <Icon name="edit" class="sm" />
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}

      {tab === 'fav' && (
        <section class="card mt" style={{ padding: '4px 12px' }}>
          <FoodList foods={filtered.fav} onPick={setPreview} empty="Brak ulubionych. Oznacz produkt gwiazdką przy dodawaniu." />
        </section>
      )}

      {tab === 'basic' && (
        <>
          {!filter.trim() && (
            <div class="chips mt">
              {BASIC_CATEGORIES.map((c) => (
                <button key={c} class="chip" aria-pressed={c === cat} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <section class="card mt" style={{ padding: '4px 12px' }}>
            <FoodList foods={filtered.basic} onPick={setPreview} />
          </section>
          <p class="tiny muted center mt">Wbudowana baza: {BASIC_FOODS.length} produktów, działa bez internetu. Wartości na 100 g, węglowodany przyswajalne.</p>
        </>
      )}

      {preview && (
        <FoodSheet
          food={preview}
          date={diaryDate.get()}
          meal="snacks"
          onClose={() => setPreview(null)}
          onEditFood={(f) => {
            setPreview(null);
            navigate('/produkt', { id: f.id });
          }}
        />
      )}
    </div>
  );
}

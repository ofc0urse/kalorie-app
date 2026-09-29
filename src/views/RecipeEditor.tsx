import { useEffect, useState } from 'preact/hooks';
import { deleteRecipe, getRecipe, putRecipe } from '../db/db';
import { fmt0, fmt1, recipeToFood, recipeTotals, round1, scale } from '../lib/nutrition';
import { useStore } from '../lib/store';
import { uid } from '../lib/text';
import { toast } from '../lib/toast';
import type { Food, Recipe, RecipeIngredient } from '../lib/types';
import { goBack, routeStore } from '../router';
import { bumpData } from '../settings';
import { Icon } from '../ui/Icon';
import { NumField } from '../ui/NumField';
import { SearchResults } from '../ui/SearchResults';
import { Sheet } from '../ui/Sheet';
import { Topbar } from '../ui/Topbar';

/** Przepis złożony z kilku składników – zapisywany jako "produkt" do dodawania porcjami. */
export function RecipeEditorView() {
  const route = useStore(routeStore);
  const id = route.params.get('id');
  const [orig, setOrig] = useState<Recipe | null>(null);
  const [name, setName] = useState('');
  const [servings, setServings] = useState<number | null>(1);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [cooked, setCooked] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [amountFor, setAmountFor] = useState<{ food: Food; index: number | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    void getRecipe(id).then((r) => {
      if (!r) return;
      setOrig(r);
      setName(r.name);
      setServings(r.servings);
      setIngredients(r.ingredients);
      const raw = r.ingredients.reduce((s, i) => s + i.grams, 0);
      setCooked(Math.abs(r.totalGrams - raw) > 0.5 ? r.totalGrams : null);
    });
  }, [id]);

  const rawGrams = ingredients.reduce((s, i) => s + i.grams, 0);
  const total = cooked && cooked > 0 ? cooked : rawGrams;
  const totals = recipeTotals({ ingredients });
  const perServing = (x: number) => x / Math.max(1, servings ?? 1);
  const valid = name.trim().length > 0 && ingredients.length > 0 && total > 0;

  const save = async () => {
    const now = Date.now();
    const r: Recipe = {
      id: orig?.id ?? uid(),
      name: name.trim(),
      ingredients,
      totalGrams: round1(total),
      servings: Math.max(1, Math.round(servings ?? 1)),
      createdAt: orig?.createdAt ?? now,
      updatedAt: now,
    };
    await putRecipe(r);
    bumpData();
    toast('Zapisano przepis', { kind: 'success' });
    goBack('/produkty');
  };

  return (
    <div class="page no-tabbar" data-testid="recipe-editor">
      <Topbar title={orig ? 'Edytuj przepis' : 'Nowy przepis'} />
      <div class="stack">
        <label class="field">
          <span>Nazwa przepisu *</span>
          <input class="input" value={name} placeholder="np. Owsianka z bananem" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} data-testid="re-name" />
        </label>

        <section class="card">
          <div class="card-title">
            <h3>Składniki</h3>
            <span class="small muted">{fmt0(rawGrams)} g</span>
          </div>
          {ingredients.length === 0 && <p class="empty small">Dodaj pierwszy składnik.</p>}
          <div class="list">
            {ingredients.map((ing, i) => (
              <div class="list-item" key={i}>
                <button class="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => setAmountFor({ food: ing.food, index: i })}>
                  <div class="title ellipsis">{ing.food.name}</div>
                  <div class="sub">
                    {fmt0(ing.grams)} {ing.food.unit === 'ml' ? 'ml' : 'g'} · {fmt0(scale(ing.food.per100, ing.grams).kcal)} kcal
                  </div>
                </button>
                <button class="icon-btn" aria-label={`Usuń ${ing.food.name}`} onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))}>
                  <Icon name="trash" class="sm" />
                </button>
              </div>
            ))}
          </div>
          <button class="btn outline block mt" onClick={() => setPicking(true)} data-testid="re-add-ingredient">
            <Icon name="plus" class="sm" /> Dodaj składnik
          </button>
        </section>

        <div class="grid-2">
          <NumField label="Liczba porcji" value={servings} onChange={setServings} testId="re-servings" />
          <NumField label="Waga po ugotowaniu" value={cooked} onChange={setCooked} suffix="g" placeholder={fmt0(rawGrams)} />
        </div>
        <p class="tiny muted">Wagę po ugotowaniu podaj, jeśli chcesz odważać gotową potrawę (np. zupa odparowuje, kasza wchłania wodę).</p>

        {ingredients.length > 0 && (
          <section class="card" data-testid="re-summary">
            <h3>Na porcję ({fmt0(total / Math.max(1, servings ?? 1))} g)</h3>
            <p class="mt">
              <b>{fmt0(perServing(totals.kcal))} kcal</b> · B {fmt1(perServing(totals.protein))} g · T {fmt1(perServing(totals.fat))} g · W {fmt1(perServing(totals.carbs))} g · Bł{' '}
              {fmt1(perServing(totals.fiber))} g
            </p>
            <p class="small muted mt">
              Cały przepis: {fmt0(totals.kcal)} kcal · na 100 g: {fmt0(recipeToFood({ id: 'x', name, ingredients, totalGrams: total, servings: 1, createdAt: 0, updatedAt: 0 }).per100.kcal)} kcal
            </p>
          </section>
        )}

        <button class="btn primary block" disabled={!valid} onClick={save} data-testid="re-save">
          Zapisz przepis
        </button>
        {orig && (
          <button
            class="btn danger block"
            onClick={async () => {
              if (!confirm(`Usunąć przepis „${orig.name}”?`)) return;
              await deleteRecipe(orig.id);
              bumpData();
              toast('Usunięto przepis', {
                undo: async () => {
                  await putRecipe(orig);
                  bumpData();
                },
              });
              goBack('/produkty');
            }}
          >
            Usuń przepis
          </button>
        )}
      </div>

      {picking && <IngredientPicker onClose={() => setPicking(false)} onPick={(f) => { setPicking(false); setAmountFor({ food: f, index: null }); }} />}
      {amountFor && (
        <AmountSheet
          food={amountFor.food}
          initial={amountFor.index != null ? ingredients[amountFor.index].grams : amountFor.food.portions[0]?.grams ?? 100}
          onClose={() => setAmountFor(null)}
          onSave={(grams) => {
            if (amountFor.index != null) setIngredients(ingredients.map((x, j) => (j === amountFor.index ? { ...x, grams } : x)));
            else setIngredients([...ingredients, { food: { ...amountFor.food }, grams }]);
            setAmountFor(null);
          }}
        />
      )}
    </div>
  );
}

function IngredientPicker({ onClose, onPick }: { onClose: () => void; onPick: (f: Food) => void }) {
  const [q, setQ] = useState('');
  return (
    <Sheet title="Wybierz składnik" onClose={onClose}>
      <div class="searchbar">
        <Icon name="search" />
        <input class="input" type="search" placeholder="Szukaj produktu" value={q} autoFocus onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} data-testid="ingredient-search" />
      </div>
      {q.trim() && <SearchResults q={q} onPick={(f) => onPick(f)} />}
    </Sheet>
  );
}

function AmountSheet({ food, initial, onClose, onSave }: { food: Food; initial: number; onClose: () => void; onSave: (g: number) => void }) {
  const [grams, setGrams] = useState<number | null>(initial);
  const unit = food.unit === 'ml' ? 'ml' : 'g';
  return (
    <Sheet title={food.name} onClose={onClose}>
      <div class="stack">
        {food.portions.length > 0 && (
          <div class="chips">
            {food.portions.map((p) => (
              <button key={p.label} class="chip" aria-pressed={grams === p.grams} onClick={() => setGrams(p.grams)}>
                {p.label} ({fmt0(p.grams)} {unit})
              </button>
            ))}
          </div>
        )}
        <NumField label={`Ilość (${unit})`} value={grams} onChange={setGrams} suffix={unit} autoFocus testId="ingredient-grams" />
        <p class="small muted">{grams ? `${fmt0(scale(food.per100, grams).kcal)} kcal` : ''}</p>
        <button class="btn primary block" disabled={!grams || grams <= 0} onClick={() => onSave(round1(grams!))} data-testid="ingredient-save">
          Zapisz składnik
        </button>
      </div>
    </Sheet>
  );
}

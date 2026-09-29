import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getRecent, isFavorite, toggleFavorite } from '../db/db';
import { addEntry, removeEntries, updateEntry } from '../diary';
import { fmt0, fmt1, round1, scale } from '../lib/nutrition';
import { useStore } from '../lib/store';
import type { Entry, Food } from '../lib/types';
import { settingsStore } from '../settings';
import { Icon } from './Icon';
import { NumField } from './NumField';
import { Sheet } from './Sheet';
import { SourceBadge } from './SourceBadge';

/**
 * Arkusz wyboru ilości – do dodawania produktu do dziennika albo edycji wpisu.
 */
export function FoodSheet({
  food,
  date,
  meal,
  entry,
  onClose,
  onAdded,
  onEditFood,
}: {
  food: Food;
  date: string;
  meal: string;
  entry?: Entry;
  onClose: () => void;
  onAdded?: () => void;
  onEditFood?: (f: Food) => void;
}) {
  const settings = useStore(settingsStore);
  const unit = food.unit === 'ml' ? 'ml' : 'g';
  const portions = useMemo(() => [{ label: unit, grams: 1 }, ...(food.portions ?? []).filter((p) => p.grams > 0)], [food]);
  // Stan początkowy ustawiany synchronicznie: edycja → zapisane wartości, nowy wpis → pierwsza porcja
  const initial = (() => {
    if (entry) {
      const i = portions.findIndex((p, idx) => idx > 0 && p.label === entry.portionLabel);
      return i > 0 && entry.portionQty ? { idx: i, qty: entry.portionQty } : { idx: 0, qty: entry.grams };
    }
    return portions.length > 1 ? { idx: 1, qty: 1 } : { idx: 0, qty: 100 };
  })();
  const [portionIdx, setPortionIdx] = useState(initial.idx);
  const [qty, setQtyState] = useState<number | null>(initial.qty);
  const touched = useRef(false);
  const setQty = (v: number | null) => {
    touched.current = true;
    setQtyState(v);
  };
  const [mealId, setMealId] = useState(entry?.meal ?? meal);
  const [fav, setFav] = useState(false);

  useEffect(() => {
    void isFavorite(food.id).then(setFav);
    if (entry) return;
    // Podpowiedź: ostatnio użyta ilość – tylko jeśli użytkownik jeszcze nic nie zmienił
    void getRecent(food.id).then((r) => {
      if (!r?.lastGrams || touched.current) return;
      const i = portions.findIndex((p, idx) => idx > 0 && Math.abs(r.lastGrams / p.grams - Math.round(r.lastGrams / p.grams)) < 0.01);
      if (i > 0) {
        setPortionIdx(i);
        setQtyState(round1(r.lastGrams / portions[i].grams));
      } else {
        setPortionIdx(0);
        setQtyState(round1(r.lastGrams));
      }
    });
  }, [food.id]);

  const portion = portions[portionIdx];
  const grams = (qty ?? 0) * portion.grams;
  const n = scale(food.per100, grams);
  const valid = grams > 0 && grams < 20000;

  const save = async () => {
    if (!valid) return;
    const extra = portionIdx > 0 ? { portionLabel: portion.label, portionQty: qty ?? undefined } : { portionLabel: undefined, portionQty: undefined };
    if (entry) {
      await updateEntry(entry, { grams: round1(grams), meal: mealId, ...extra });
    } else {
      await addEntry({ date, meal: mealId, food, grams: round1(grams), ...extra });
    }
    onClose();
    onAdded?.();
  };

  return (
    <Sheet
      title={
        <span>
          {food.name} <SourceBadge source={food.source} />
          {food.brand && <div class="small muted" style={{ fontWeight: 500, marginTop: 2 }}>{food.brand}</div>}
        </span>
      }
      label={food.name}
      onClose={onClose}
    >
      <div class="stack">
        <div class="nutri-grid" data-testid="sheet-nutrients">
          <div>
            <b>{fmt0(n.kcal)}</b>
            <span>kcal</span>
          </div>
          <div>
            <b>{fmt1(n.protein)}</b>
            <span>białko</span>
          </div>
          <div>
            <b>{fmt1(n.fat)}</b>
            <span>tłuszcz</span>
          </div>
          <div>
            <b>{fmt1(n.carbs)}</b>
            <span>węgle</span>
          </div>
          <div>
            <b>{fmt1(n.fiber)}</b>
            <span>błonnik</span>
          </div>
        </div>
        <p class="tiny muted center">
          Na 100 {unit}: {fmt0(food.per100.kcal)} kcal · B {fmt1(food.per100.protein)} · T {fmt1(food.per100.fat)} · W {fmt1(food.per100.carbs)} · Bł {fmt1(food.per100.fiber)}
        </p>

        {portions.length > 1 && (
          <div class="chips" role="group" aria-label="Jednostka">
            {portions.map((p, i) => (
              <button
                key={p.label + i}
                class="chip"
                aria-pressed={i === portionIdx}
                onClick={() => {
                  // przelicz ilość tak, by zachować podobną wagę
                  const g = grams;
                  touched.current = true;
                  setPortionIdx(i);
                  if (i === 0) setQty(round1(g || 100));
                  else setQty(g > 0 ? Math.max(0.5, Math.round((g / p.grams) * 2) / 2) : 1);
                }}
              >
                {i === 0 ? unit : `${p.label} (${fmt0(p.grams)} ${unit})`}
              </button>
            ))}
          </div>
        )}

        <div class="amount-row">
          <NumField
            label={portionIdx === 0 ? `Ilość (${unit})` : `Liczba: ${portion.label}`}
            value={qty}
            onChange={setQty}
            suffix={portionIdx === 0 ? unit : '×'}
            testId="amount"
          />
          <label class="field">
            <span>Posiłek</span>
            <select class="select" value={mealId} onChange={(e) => setMealId((e.currentTarget as HTMLSelectElement).value)} data-testid="meal-select">
              {settings.meals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {portionIdx > 0 && <p class="small muted">= {fmt1(grams)} {unit}</p>}

        <button class="btn primary block" disabled={!valid} onClick={save} data-testid="sheet-save">
          <Icon name={entry ? 'check' : 'plus'} />
          {entry ? 'Zapisz' : 'Dodaj do dziennika'}
        </button>
        <div class="row">
          <button
            class="btn outline grow"
            onClick={async () => {
              setFav(await toggleFavorite(food));
            }}
            aria-pressed={fav}
          >
            <Icon name="star" filled={fav} class="sm" />
            {fav ? 'W ulubionych' : 'Do ulubionych'}
          </button>
          {onEditFood && (food.source === 'custom' || food.source === 'off' || food.source === 'usda') && (
            <button class="btn outline" onClick={() => onEditFood(food)}>
              <Icon name="edit" class="sm" />
              Edytuj
            </button>
          )}
        </div>
        {entry && (
          <button
            class="btn danger block"
            onClick={async () => {
              await removeEntries([entry]);
              onClose();
            }}
          >
            <Icon name="trash" class="sm" />
            Usuń z dziennika
          </button>
        )}
      </div>
    </Sheet>
  );
}

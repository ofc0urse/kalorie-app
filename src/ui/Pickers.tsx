import { useState } from 'preact/hooks';
import { fmt0, round1, scale } from '../lib/nutrition';
import type { Food } from '../lib/types';
import { Icon } from './Icon';
import { NumField } from './NumField';
import { SearchResults } from './SearchResults';
import { Sheet } from './Sheet';

export function IngredientPicker({ onClose, onPick, title = 'Wybierz składnik' }: { onClose: () => void; onPick: (f: Food) => void; title?: string }) {
  const [q, setQ] = useState('');
  return (
    <Sheet title={title} onClose={onClose}>
      <div class="searchbar">
        <Icon name="search" />
        <input class="input" type="search" placeholder="Szukaj produktu" value={q} autoFocus onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} data-testid="ingredient-search" />
      </div>
      {q.trim() && <SearchResults q={q} onPick={(f) => onPick(f)} />}
    </Sheet>
  );
}

export function AmountSheet({ food, initial, onClose, onSave }: { food: Food; initial: number; onClose: () => void; onSave: (g: number) => void }) {
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

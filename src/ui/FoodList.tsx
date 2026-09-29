import { fmt0 } from '../lib/nutrition';
import type { Food } from '../lib/types';
import { Icon } from './Icon';
import { SourceBadge } from './SourceBadge';

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


import { useState } from 'preact/hooks';
import { addEntry } from '../diary';
import { kcalFromMacros } from '../lib/nutrition';
import { uid } from '../lib/text';
import { NumField } from './NumField';
import { Sheet } from './Sheet';

/** Szybkie dodanie samych kalorii / makro bez produktu. */
export function QuickAddSheet({ date, meal, onClose, onAdded }: { date: string; meal: string; onClose: () => void; onAdded?: () => void }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);
  const [fiber, setFiber] = useState<number | null>(null);
  const macrosKcal = kcalFromMacros({ protein: protein ?? 0, fat: fat ?? 0, carbs: carbs ?? 0, fiber: fiber ?? 0 });
  const finalKcal = kcal ?? (macrosKcal > 0 ? Math.round(macrosKcal) : null);
  return (
    <Sheet title="Szybkie dodanie" onClose={onClose}>
      <div class="stack">
        <label class="field">
          <span>Nazwa (opcjonalnie)</span>
          <input class="input" value={name} placeholder="np. Obiad w restauracji" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} data-testid="quick-name" />
        </label>
        <NumField label="Kalorie" value={kcal} onChange={setKcal} suffix="kcal" autoFocus testId="quick-kcal" placeholder={macrosKcal > 0 ? String(Math.round(macrosKcal)) : ''} />
        <div class="grid-2">
          <NumField label="Białko" value={protein} onChange={setProtein} suffix="g" />
          <NumField label="Tłuszcz" value={fat} onChange={setFat} suffix="g" />
          <NumField label="Węglowodany" value={carbs} onChange={setCarbs} suffix="g" />
          <NumField label="Błonnik" value={fiber} onChange={setFiber} suffix="g" />
        </div>
        <button
          class="btn primary block"
          disabled={!finalKcal || finalKcal <= 0}
          data-testid="quick-save"
          onClick={async () => {
            await addEntry({
              date,
              meal,
              grams: 100,
              food: {
                id: `quick:${uid()}`,
                source: 'custom',
                name: name.trim() || 'Szybkie dodanie',
                per100: { kcal: finalKcal!, protein: protein ?? 0, fat: fat ?? 0, carbs: carbs ?? 0, fiber: fiber ?? 0 },
                portions: [{ label: 'porcja', grams: 100 }],
              },
              portionLabel: 'porcja',
              portionQty: 1,
            });
            onClose();
            onAdded?.();
          }}
        >
          Dodaj
        </button>
      </div>
    </Sheet>
  );
}

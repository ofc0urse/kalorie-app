import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { entriesForDate, getWater, getWeight, latestWeightOnOrBefore, setWater, setWeight } from '../db/db';
import { copyMeal, removeEntries } from '../diary';
import { addDays, formatDayLabel, today } from '../lib/date';
import { entryNutrients, fmt0, fmt1, sumEntries } from '../lib/nutrition';
import { useStore } from '../lib/store';
import { macroGoals } from '../lib/tdee';
import { toast } from '../lib/toast';
import type { Entry, MealDef, Nutrients } from '../lib/types';
import { navigate } from '../router';
import { bumpData, dataVersion, settingsStore } from '../settings';
import { diaryDate } from '../uiState';
import { FoodSheet } from '../ui/FoodSheet';
import { Icon } from '../ui/Icon';
import { NumField } from '../ui/NumField';
import { Sheet } from '../ui/Sheet';

export function DiaryView() {
  const date = useStore(diaryDate);
  const settings = useStore(settingsStore);
  const version = useStore(dataVersion);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [water, setWaterState] = useState(0);
  const [weight, setWeightState] = useState<{ kg: number; date: string } | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [mealMenu, setMealMenu] = useState<MealDef | null>(null);
  const [weightOpen, setWeightOpen] = useState(false);
  const dateInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [e, w, wt] = await Promise.all([entriesForDate(date), getWater(date), latestWeightOnOrBefore(date)]);
      if (!alive) return;
      setEntries(e);
      setWaterState(w);
      setWeightState(wt ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [date, version]);

  const totals = useMemo(() => sumEntries(entries ?? []), [entries]);
  const goals = macroGoals(settings.kcalGoal, settings.macroSplit, settings.fiberGoal);
  const meals = settings.meals;
  const orphanMeals = useMemo(() => {
    const ids = new Set(meals.map((m) => m.id));
    return [...new Set((entries ?? []).filter((e) => !ids.has(e.meal)).map((e) => e.meal))].map((id) => ({ id, name: 'Inne' }));
  }, [entries, meals]);

  const openAdd = (meal: string) => navigate('/dodaj', { d: date, m: meal });

  return (
    <div class="page" data-testid="diary">
      <header class="topbar">
        <div class="daynav grow">
          <button class="icon-btn" aria-label="Poprzedni dzień" onClick={() => diaryDate.set(addDays(date, -1))} data-testid="prev-day">
            <Icon name="left" />
          </button>
          <button
            class="label"
            onClick={() => {
              const el = dateInput.current;
              if (!el) return;
              if ('showPicker' in el) {
                try {
                  (el as HTMLInputElement & { showPicker: () => void }).showPicker();
                  return;
                } catch {
                  /* Safari < 16 */
                }
              }
              el.focus();
              el.click();
            }}
            data-testid="day-label"
          >
            {formatDayLabel(date)}
            {date !== today() && <small>dotknij, aby wybrać datę</small>}
          </button>
          <input
            ref={dateInput}
            type="date"
            class="visually-hidden"
            value={date}
            aria-label="Wybierz datę"
            onChange={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              if (v) diaryDate.set(v);
            }}
          />
          <button class="icon-btn" aria-label="Następny dzień" onClick={() => diaryDate.set(addDays(date, 1))} data-testid="next-day">
            <Icon name="right" />
          </button>
        </div>
      </header>

      {date !== today() && (
        <button class="btn small outline" style={{ margin: '0 auto 12px', display: 'flex' }} onClick={() => diaryDate.set(today())}>
          Wróć do dzisiaj
        </button>
      )}

      <Summary totals={totals} goals={goals} />

      <div class="stack mt">
        {[...meals, ...orphanMeals].map((m) => (
          <MealCard
            key={m.id}
            meal={m}
            entries={(entries ?? []).filter((e) => e.meal === m.id)}
            onAdd={() => openAdd(m.id)}
            onEdit={setEditing}
            onMenu={() => setMealMenu(m)}
          />
        ))}

        <WaterCard
          ml={water}
          goal={settings.waterGoalMl}
          step={settings.waterStepMl}
          onChange={async (ml) => {
            const prev = water;
            setWaterState(ml);
            await setWater(date, ml);
            bumpData();
            if (ml < prev) toast(`Woda: ${fmt0(ml)} ml`, { undo: async () => { await setWater(date, prev); bumpData(); } });
          }}
        />

        <div class="card">
          <div class="row">
            <Icon name="scale" class="accent" />
            <div class="grow">
              <h3>Waga</h3>
              <p class="small muted" data-testid="weight-info">
                {weight
                  ? weight.date === date
                    ? `${fmt1(weight.kg)} kg (dzisiejszy pomiar)`
                    : `${fmt1(weight.kg)} kg · ostatni pomiar ${formatDayLabel(weight.date).toLowerCase()}`
                  : 'Brak pomiarów'}
              </p>
            </div>
            <button class="btn small" onClick={() => setWeightOpen(true)} data-testid="weight-btn">
              {weight?.date === date ? 'Zmień' : 'Dodaj'}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <FoodSheet
          food={editing.food}
          date={date}
          meal={editing.meal}
          entry={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {mealMenu && (
        <MealMenu
          meal={mealMenu}
          date={date}
          entries={(entries ?? []).filter((e) => e.meal === mealMenu.id)}
          onClose={() => setMealMenu(null)}
        />
      )}

      {weightOpen && (
        <WeightSheet
          date={date}
          initial={weight?.kg ?? settings.profile?.weightKg ?? null}
          onClose={() => setWeightOpen(false)}
        />
      )}
    </div>
  );
}

function Summary({ totals, goals }: { totals: Nutrients; goals: Nutrients }) {
  const remaining = goals.kcal - totals.kcal;
  const over = remaining < 0;
  const pct = goals.kcal > 0 ? Math.min(1, totals.kcal / goals.kcal) : 0;
  const R = 56;
  const C = 2 * Math.PI * R;
  return (
    <section class="card" aria-label="Podsumowanie dnia" data-testid="summary">
      <div class="summary">
        <div class={`ring ${over ? 'over' : ''}`}>
          <svg viewBox="0 0 132 132" aria-hidden="true">
            <circle cx="66" cy="66" r={R} fill="none" stroke="var(--surface-2)" stroke-width="12" />
            <circle
              cx="66"
              cy="66"
              r={R}
              fill="none"
              stroke={over ? 'var(--danger)' : 'var(--accent)'}
              stroke-width="12"
              stroke-linecap="round"
              stroke-dasharray={`${C * pct} ${C}`}
            />
          </svg>
          <div class="ring-text">
            <span class="big" data-testid="kcal-remaining">{fmt0(Math.abs(remaining))}</span>
            <span class="lbl">{over ? 'kcal ponad cel' : 'kcal pozostało'}</span>
          </div>
        </div>
        <div class="stack" style={{ gap: 10 }}>
          <MacroBar label="Białko" value={totals.protein} goal={goals.protein} color="var(--protein)" />
          <MacroBar label="Tłuszcz" value={totals.fat} goal={goals.fat} color="var(--fat)" />
          <MacroBar label="Węglowodany" value={totals.carbs} goal={goals.carbs} color="var(--carbs)" />
          <MacroBar label="Błonnik" value={totals.fiber} goal={goals.fiber} color="var(--fiber)" minGoal />
        </div>
      </div>
      <div class="kcal-line">
        <div>
          Cel<b>{fmt0(goals.kcal)}</b>
        </div>
        <div class="center">
          Zjedzone<b data-testid="kcal-eaten">{fmt0(totals.kcal)}</b>
        </div>
        <div style={{ textAlign: 'right' }}>
          {over ? 'Nadwyżka' : 'Pozostało'}
          <b style={{ color: over ? 'var(--danger)' : undefined }}>{fmt0(Math.abs(remaining))}</b>
        </div>
      </div>
    </section>
  );
}

function MacroBar({ label, value, goal, color, minGoal }: { label: string; value: number; goal: number; color: string; minGoal?: boolean }) {
  const pct = goal > 0 ? (value / goal) * 100 : 0;
  const over = !minGoal && pct > 110;
  return (
    <div class="macro">
      <div class="macro-head">
        <b>{label}</b>
        <span class="num muted">
          {fmt0(value)} / {fmt0(goal)} g
        </span>
      </div>
      <div class={`bar ${over ? 'over' : ''}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemax={Math.round(goal)}>
        <i style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

function MealCard({
  meal,
  entries,
  onAdd,
  onEdit,
  onMenu,
}: {
  meal: MealDef;
  entries: Entry[];
  onAdd: () => void;
  onEdit: (e: Entry) => void;
  onMenu: () => void;
}) {
  const t = sumEntries(entries);
  return (
    <section class="card meal" data-testid={`meal-${meal.id}`} aria-label={meal.name}>
      <div class="meal-head">
        <h2>{meal.name}</h2>
        <span class="kcal" data-testid={`meal-kcal-${meal.id}`}>{fmt0(t.kcal)} kcal</span>
        <button class="icon-btn" aria-label={`Opcje: ${meal.name}`} onClick={onMenu}>
          <Icon name="more" />
        </button>
      </div>
      {entries.length > 0 && (
        <>
          <div class="meal-macros">
            B {fmt0(t.protein)} g · T {fmt0(t.fat)} g · W {fmt0(t.carbs)} g · Bł {fmt0(t.fiber)} g
          </div>
          <div class="list">
            {entries.map((e) => {
              const n = entryNutrients(e);
              const unit = e.food.unit === 'ml' ? 'ml' : 'g';
              return (
                <button class="list-item" key={e.id} onClick={() => onEdit(e)} data-testid="entry">
                  <div class="grow">
                    <div class="title ellipsis">{e.food.name}</div>
                    <div class="sub ellipsis">
                      {e.food.id.startsWith('quick:') ? (
                        <>szybkie dodanie{e.portionQty && e.portionQty !== 1 ? ` × ${fmt1(e.portionQty)}` : ''}</>
                      ) : (
                        <>
                          {e.portionLabel && e.portionQty ? `${fmt1(e.portionQty)} × ${e.portionLabel} · ` : ''}
                          {fmt0(e.grams)} {unit}
                          {e.food.brand ? ` · ${e.food.brand}` : ''}
                        </>
                      )}
                    </div>
                  </div>
                  <span class="kcal">{fmt0(n.kcal)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <div class="meal-add">
        <button class="btn" onClick={onAdd} data-testid={`add-${meal.id}`}>
          <Icon name="plus" class="sm" /> Dodaj
        </button>
      </div>
    </section>
  );
}

function MealMenu({ meal, date, entries, onClose }: { meal: MealDef; date: string; entries: Entry[]; onClose: () => void }) {
  const [fromDate, setFromDate] = useState(addDays(date, -1));
  const [allDay, setAllDay] = useState(false);
  const settings = useStore(settingsStore);
  return (
    <Sheet title={meal.name} onClose={onClose}>
      <div class="stack">
        <button
          class="btn block"
          onClick={async () => {
            await copyMeal(addDays(date, -1), meal.id, date, meal.id);
            onClose();
          }}
        >
          <Icon name="copy" class="sm" /> Kopiuj „{meal.name}” z wczoraj
        </button>
        <div class="card flat stack">
          <h3>Kopiuj z innego dnia</h3>
          <label class="field">
            <span>Z dnia</span>
            <input class="input" type="date" value={fromDate} onChange={(e) => setFromDate((e.currentTarget as HTMLInputElement).value)} data-testid="copy-from-date" />
          </label>
          <label class="check">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay((e.currentTarget as HTMLInputElement).checked)} />
            Cały dzień (wszystkie posiłki do odpowiadających im posiłków)
          </label>
          <button
            class="btn primary block"
            disabled={!fromDate || fromDate === date}
            onClick={async () => {
              await copyMeal(fromDate, allDay ? null : meal.id, date, allDay ? null : meal.id);
              onClose();
            }}
            data-testid="copy-btn"
          >
            Kopiuj {allDay ? 'cały dzień' : `„${meal.name}”`}
          </button>
        </div>
        {entries.length > 0 && (
          <button
            class="btn danger block"
            onClick={async () => {
              await removeEntries(entries);
              onClose();
            }}
          >
            <Icon name="trash" class="sm" /> Wyczyść posiłek ({entries.length})
          </button>
        )}
        {settings.meals.length > 0 && (
          <button
            class="btn ghost block"
            onClick={() => {
              onClose();
              navigate('/ustawienia', { s: 'posilki' });
            }}
          >
            Zmień listę posiłków
          </button>
        )}
      </div>
    </Sheet>
  );
}

function WaterCard({ ml, goal, step, onChange }: { ml: number; goal: number; step: number; onChange: (ml: number) => void }) {
  const glasses = Math.max(1, Math.ceil(goal / step));
  const full = Math.floor(ml / step);
  return (
    <section class="card" aria-label="Woda" data-testid="water">
      <div class="card-title">
        <div class="row">
          <Icon name="drop" class="sm" />
          <h3>Woda</h3>
        </div>
        <span class="small muted num" data-testid="water-amount">
          {fmt0(ml)} / {fmt0(goal)} ml
        </span>
      </div>
      <div class="water">
        <button class="icon-btn filled" aria-label={`Odejmij ${step} ml`} onClick={() => onChange(Math.max(0, ml - step))} disabled={ml <= 0}>
          <Icon name="minus" />
        </button>
        <div class="glasses" aria-hidden="true">
          {Array.from({ length: Math.max(glasses, full) }, (_, i) => (
            <span key={i} class={`glass ${i < full ? 'full' : ''}`} />
          ))}
        </div>
        <button class="icon-btn filled accent" aria-label={`Dodaj ${step} ml`} onClick={() => onChange(ml + step)} data-testid="water-plus">
          <Icon name="plus" />
        </button>
      </div>
    </section>
  );
}

function WeightSheet({ date, initial, onClose }: { date: string; initial: number | null; onClose: () => void }) {
  const [kg, setKg] = useState<number | null>(initial);
  const [existing, setExisting] = useState<number | null>(null);
  useEffect(() => {
    void getWeight(date).then((w) => {
      if (w) {
        setExisting(w.kg);
        setKg(w.kg);
      }
    });
  }, [date]);
  const valid = kg != null && kg >= 20 && kg <= 400;
  return (
    <Sheet title={`Waga – ${formatDayLabel(date).toLowerCase()}`} onClose={onClose}>
      <div class="stack">
        <NumField label="Masa ciała" value={kg} onChange={setKg} suffix="kg" autoFocus testId="weight-input" />
        <button
          class="btn primary block"
          disabled={!valid}
          onClick={async () => {
            await setWeight(date, Math.round(kg! * 10) / 10);
            bumpData();
            toast('Zapisano wagę', { kind: 'success' });
            onClose();
          }}
          data-testid="weight-save"
        >
          Zapisz
        </button>
        {existing != null && (
          <button
            class="btn danger block"
            onClick={async () => {
              await setWeight(date, null);
              bumpData();
              toast('Usunięto pomiar', { undo: async () => { await setWeight(date, existing); bumpData(); } });
              onClose();
            }}
          >
            Usuń pomiar
          </button>
        )}
      </div>
    </Sheet>
  );
}

import type { ActivityLevel, GoalType, MacroSplit, Nutrients, Profile, Sex } from './types';

export const ACTIVITY: Record<ActivityLevel, { factor: number; label: string; hint: string }> = {
  sedentary: { factor: 1.2, label: 'Siedzący', hint: 'praca przy biurku, brak treningów' },
  light: { factor: 1.375, label: 'Lekka aktywność', hint: 'spacery, 1–3 lekkie treningi w tygodniu' },
  moderate: { factor: 1.55, label: 'Umiarkowana', hint: '3–5 treningów w tygodniu' },
  active: { factor: 1.725, label: 'Wysoka', hint: '6–7 treningów lub praca fizyczna' },
  very_active: { factor: 1.9, label: 'Bardzo wysoka', hint: 'ciężka praca fizyczna + treningi' },
};

export const GOALS: Record<GoalType, { delta: number; label: string; hint: string }> = {
  lose: { delta: -500, label: 'Redukcja', hint: 'ok. −0,5 kg tygodniowo' },
  lose_slow: { delta: -250, label: 'Łagodna redukcja', hint: 'ok. −0,25 kg tygodniowo' },
  maintain: { delta: 0, label: 'Utrzymanie wagi', hint: 'bilans zerowy' },
  gain: { delta: 300, label: 'Budowa masy', hint: 'niewielka nadwyżka' },
};

/** Rozsądne minimum kalorii bez nadzoru specjalisty. */
export const MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };

/** Podstawowa przemiana materii – wzór Mifflina-St Jeora. */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

export function tdee(p: Profile): number {
  return bmr(p) * ACTIVITY[p.activity].factor;
}

export interface GoalResult {
  bmr: number;
  tdee: number;
  target: number;
  /** true, gdy cel został podniesiony do minimum */
  clamped: boolean;
  minimum: number;
}

export function computeGoal(p: Profile): GoalResult {
  const b = bmr(p);
  const t = tdee(p);
  let raw = t + GOALS[p.goal].delta;
  // Deficyt nie większy niż 25% TDEE
  if (GOALS[p.goal].delta < 0) raw = Math.max(raw, t * 0.75);
  const minimum = MIN_KCAL[p.sex];
  const target = Math.max(raw, minimum);
  return {
    bmr: Math.round(b),
    tdee: Math.round(t),
    target: Math.round(target / 10) * 10,
    clamped: raw < minimum,
    minimum,
  };
}

export const DEFAULT_SPLIT: MacroSplit = { protein: 25, fat: 30, carbs: 45 };

export const SPLIT_PRESETS: { label: string; split: MacroSplit }[] = [
  { label: 'Zbilansowany', split: { protein: 25, fat: 30, carbs: 45 } },
  { label: 'Wysokobiałkowy', split: { protein: 35, fat: 30, carbs: 35 } },
  { label: 'Niskowęglowodanowy', split: { protein: 30, fat: 45, carbs: 25 } },
  { label: 'Sportowy', split: { protein: 20, fat: 25, carbs: 55 } },
];

/** Cele w gramach z procentowego podziału energii. */
export function macroGoals(kcal: number, split: MacroSplit, fiber: number): Nutrients {
  return {
    kcal,
    protein: (kcal * split.protein) / 100 / 4,
    fat: (kcal * split.fat) / 100 / 9,
    carbs: (kcal * split.carbs) / 100 / 4,
    fiber,
  };
}

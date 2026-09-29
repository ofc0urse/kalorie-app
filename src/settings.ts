import { kvSet, loadSettingsRaw } from './db/db';
import { Store } from './lib/store';
import { DEFAULT_SPLIT, computeGoal } from './lib/tdee';
import type { Settings } from './lib/types';

export const DEFAULT_MEALS = [
  { id: 'breakfast', name: 'Śniadanie' },
  { id: 'lunch', name: 'Obiad' },
  { id: 'dinner', name: 'Kolacja' },
  { id: 'snacks', name: 'Przekąski' },
];

export const DEFAULT_SETTINGS: Settings = {
  profile: null,
  kcalGoal: 2000,
  kcalGoalManual: false,
  macroSplit: DEFAULT_SPLIT,
  fiberGoal: 28,
  waterGoalMl: 2000,
  waterStepMl: 250,
  meals: DEFAULT_MEALS,
  aiEndpoint: (import.meta.env.VITE_AI_ENDPOINT as string | undefined) ?? '',
  usdaApiKey: '',
  offPreferPoland: true,
  theme: 'system',
  onboarded: false,
};

export const settingsStore = new Store<Settings>(DEFAULT_SETTINGS);

export async function loadSettings(): Promise<Settings> {
  const raw = await loadSettingsRaw();
  const s: Settings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  if (!s.meals?.length) s.meals = DEFAULT_MEALS;
  if (!s.aiEndpoint) s.aiEndpoint = DEFAULT_SETTINGS.aiEndpoint;
  settingsStore.set(s);
  return s;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next: Settings = { ...settingsStore.get(), ...patch };
  if (next.profile && !next.kcalGoalManual) next.kcalGoal = computeGoal(next.profile).target;
  settingsStore.set(next);
  await kvSet('settings', next);
  return next;
}

/** Licznik zmian danych – widoki odświeżają się, gdy rośnie. */
export const dataVersion = new Store(0);
export function bumpData(): void {
  dataVersion.update((v) => v + 1);
}

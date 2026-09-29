/** Wartości odżywcze na 100 g (lub 100 ml). */
export interface Nutrients {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
}

export interface Portion {
  /** np. "sztuka", "kromka", "łyżka", "szklanka" */
  label: string;
  grams: number;
}

export type FoodSource = 'builtin' | 'custom' | 'off' | 'usda' | 'recipe' | 'ai';

export interface Food {
  /** builtin:xxx, custom:uuid, off:<kod>, usda:<fdcId>, recipe:uuid */
  id: string;
  source: FoodSource;
  name: string;
  brand?: string;
  barcode?: string;
  category?: string;
  per100: Nutrients;
  portions: Portion[];
  /** 'ml' dla płynów – wtedy "g" w interfejsie to ml */
  unit?: 'g' | 'ml';
  createdAt?: number;
  updatedAt?: number;
}

export interface RecipeIngredient {
  food: Food;
  grams: number;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  /** waga gotowej potrawy (po ugotowaniu); domyślnie suma składników */
  totalGrams: number;
  /** liczba porcji, na które dzieli się przepis */
  servings: number;
  createdAt: number;
  updatedAt: number;
}

export interface MealDef {
  id: string;
  name: string;
}

export interface Entry {
  id: string;
  /** YYYY-MM-DD (czas lokalny) */
  date: string;
  meal: string;
  /** Kopia produktu z chwili dodania – późniejsza edycja produktu nie zmienia historii. */
  food: Food;
  grams: number;
  /** opcjonalnie: wybrana porcja i jej liczba (tylko do wyświetlania) */
  portionLabel?: string;
  portionQty?: number;
  note?: string;
  createdAt: number;
}

export interface WeightEntry {
  date: string;
  kg: number;
}

export interface WaterEntry {
  date: string;
  ml: number;
}

export type Sex = 'female' | 'male';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type GoalType = 'lose' | 'lose_slow' | 'maintain' | 'gain';

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: GoalType;
}

export interface MacroSplit {
  /** procent energii */
  protein: number;
  fat: number;
  carbs: number;
}

export interface Settings {
  profile: Profile | null;
  /** cel kalorii – wyliczony albo wpisany ręcznie */
  kcalGoal: number;
  kcalGoalManual: boolean;
  macroSplit: MacroSplit;
  fiberGoal: number;
  waterGoalMl: number;
  waterStepMl: number;
  meals: MealDef[];
  aiEndpoint: string;
  usdaApiKey: string;
  offPreferPoland: boolean;
  theme: 'system' | 'light' | 'dark';
  onboarded: boolean;
}

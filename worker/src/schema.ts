import * as z from 'zod/v4';

/** Struktura odpowiedzi, którą wymuszamy na modelu (structured outputs). */
export const ItemSchema = z.object({
  name: z.string().describe('Polska nazwa składnika, np. "Ryż biały gotowany"'),
  grams: z.number().describe('Szacowana waga tego składnika na talerzu w gramach (dla napojów: ml)'),
  kcal: z.number().describe('Kalorie dla podanej wagi (nie na 100 g)'),
  protein: z.number().describe('Białko w gramach dla podanej wagi'),
  fat: z.number().describe('Tłuszcz w gramach dla podanej wagi'),
  carbs: z.number().describe('Węglowodany przyswajalne (bez błonnika) w gramach dla podanej wagi'),
  fiber: z.number().describe('Błonnik w gramach dla podanej wagi'),
  confidence: z.enum(['low', 'medium', 'high']).describe('Pewność rozpoznania i oszacowania ilości'),
});

export const EstimateSchema = z.object({
  is_food: z.boolean().describe('Czy na zdjęciu / w opisie jest jedzenie lub napój'),
  meal_name: z.string().describe('Krótka polska nazwa całego posiłku'),
  items: z.array(ItemSchema),
  notes: z.string().describe('Jedno-dwa zdania po polsku: założenia, np. ilość tłuszczu do smażenia, co było niewidoczne'),
});

export type Estimate = z.infer<typeof EstimateSchema>;
export type EstimateItem = z.infer<typeof ItemSchema>;

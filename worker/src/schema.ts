/** Format odpowiedzi – taki sam jak wcześniej, frontend go nie zmienia. */
export interface EstimateItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface Estimate {
  is_food: boolean;
  meal_name: string;
  items: EstimateItem[];
  notes: string;
}

const num = (description: string) => ({ type: 'NUMBER', description });

/**
 * responseSchema dla Gemini (podzbiór OpenAPI 3.0: typy WIELKIMI literami, `propertyOrdering`
 * utrzymuje kolejność pól w wygenerowanym JSON-ie).
 */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_food: { type: 'BOOLEAN', description: 'Czy na zdjęciu / w opisie jest jedzenie lub napój' },
    meal_name: { type: 'STRING', description: 'Krótka polska nazwa całego posiłku' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Polska nazwa składnika, np. "Ryż biały gotowany"' },
          grams: num('Szacowana waga składnika na talerzu w gramach (dla napojów: ml)'),
          kcal: num('Kalorie dla podanej wagi (nie na 100 g)'),
          protein: num('Białko w gramach dla podanej wagi'),
          fat: num('Tłuszcz w gramach dla podanej wagi'),
          carbs: num('Węglowodany przyswajalne (bez błonnika) w gramach dla podanej wagi'),
          fiber: num('Błonnik w gramach dla podanej wagi'),
          confidence: { type: 'STRING', enum: ['low', 'medium', 'high'], description: 'Pewność rozpoznania i oszacowania ilości' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'fat', 'carbs', 'fiber', 'confidence'],
        propertyOrdering: ['name', 'grams', 'kcal', 'protein', 'fat', 'carbs', 'fiber', 'confidence'],
      },
    },
    notes: { type: 'STRING', description: 'Jedno-dwa zdania po polsku: założenia, np. tłuszcz do smażenia, co było niewidoczne' },
  },
  required: ['is_food', 'meal_name', 'items', 'notes'],
  propertyOrdering: ['is_food', 'meal_name', 'items', 'notes'],
} as const;

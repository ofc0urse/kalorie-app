import { describe, expect, it } from 'vitest';
import { addDays, rangeKeys, toKey } from '../../src/lib/date';
import { kcalFromMacros, parseNum, recipeToFood, scale, sumEntries, toPer100 } from '../../src/lib/nutrition';
import { bmr, computeGoal, macroGoals } from '../../src/lib/tdee';
import { matchScore, normalize } from '../../src/lib/text';
import { validateBackup } from '../../src/lib/backup';
import type { Food } from '../../src/lib/types';

const apple: Food = { id: 'b:jablko', source: 'builtin', name: 'Jabłko', per100: { kcal: 52, protein: 0.3, fat: 0.2, carbs: 13.8, fiber: 2.4 }, portions: [{ label: 'sztuka', grams: 180 }] };

describe('tekst', () => {
  it('usuwa polskie znaki, także ł', () => {
    expect(normalize('Jabłko ŻÓŁTE źdźbło')).toBe('jablko zolte zdzblo');
    expect(normalize('Łosoś wędzony')).toBe('losos wedzony');
  });
  it('"jablko" znajduje "Jabłko"', () => {
    expect(matchScore('Jabłko', 'jablko')).toBeGreaterThan(0);
    expect(matchScore('Jabłko', 'jabł')).toBeGreaterThan(0);
    expect(matchScore('Chleb żytni', 'zytni chleb')).toBeGreaterThan(0);
    expect(matchScore('Chleb żytni', 'bułka')).toBe(0);
  });
  it('dokładne dopasowanie wyżej niż częściowe', () => {
    expect(matchScore('Mleko', 'mleko')).toBeGreaterThan(matchScore('Mleko kokosowe w puszce', 'mleko'));
    expect(matchScore('Ser żółty gouda', 'ser')).toBeGreaterThan(matchScore('Twaróg serowy', 'ser'));
  });
});

describe('wartości odżywcze', () => {
  it('skaluje do gramów', () => {
    const n = scale(apple.per100, 180);
    expect(n.kcal).toBeCloseTo(93.6);
    expect(n.fiber).toBeCloseTo(4.32);
  });
  it('sumuje wpisy', () => {
    const s = sumEntries([
      { food: apple, grams: 100 },
      { food: apple, grams: 50 },
    ]);
    expect(s.kcal).toBeCloseTo(78);
  });
  it('przelicza na 100 g', () => {
    expect(toPer100({ kcal: 200, protein: 10, fat: 5, carbs: 20, fiber: 2 }, 50).kcal).toBe(400);
  });
  it('parsuje przecinek dziesiętny', () => {
    expect(parseNum('72,5')).toBe(72.5);
    expect(parseNum(' 1 200 ')).toBe(1200);
    expect(parseNum('')).toBeNaN();
  });
  it('liczy kcal z makro', () => {
    expect(kcalFromMacros({ protein: 10, fat: 10, carbs: 10, fiber: 0 })).toBe(170);
  });
  it('przepis → produkt na 100 g i porcje', () => {
    const f = recipeToFood({
      id: 'r1',
      name: 'Owsianka',
      ingredients: [
        { food: { ...apple, per100: { kcal: 370, protein: 13, fat: 7, carbs: 60, fiber: 10 } }, grams: 50 },
        { food: { ...apple, per100: { kcal: 50, protein: 3.3, fat: 2, carbs: 4.8, fiber: 0 } }, grams: 250 },
      ],
      totalGrams: 300,
      servings: 2,
      createdAt: 0,
      updatedAt: 0,
    });
    // (185 + 125) / 300 * 100
    expect(f.per100.kcal).toBeCloseTo(103.33, 1);
    expect(f.portions[0]).toEqual({ label: 'porcja', grams: 150 });
  });
});

describe('zapotrzebowanie (Mifflin-St Jeor)', () => {
  it('BMR mężczyzny i kobiety', () => {
    expect(bmr({ sex: 'male', age: 30, heightCm: 180, weightKg: 80 })).toBe(1780);
    expect(bmr({ sex: 'female', age: 30, heightCm: 165, weightKg: 60 })).toBeCloseTo(1320.25);
  });
  it('cel z aktywnością i redukcją', () => {
    const r = computeGoal({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: 'moderate', goal: 'lose' });
    expect(r.tdee).toBe(2759);
    expect(r.target).toBe(2260);
  });
  it('nie schodzi poniżej minimum', () => {
    const r = computeGoal({ sex: 'female', age: 70, heightCm: 150, weightKg: 45, activity: 'sedentary', goal: 'lose' });
    expect(r.target).toBe(1200);
    expect(r.clamped).toBe(true);
  });
  it('deficyt nie większy niż 25% TDEE', () => {
    const r = computeGoal({ sex: 'female', age: 60, heightCm: 155, weightKg: 55, activity: 'sedentary', goal: 'lose' });
    expect(r.target).toBeGreaterThanOrEqual(Math.round((r.tdee * 0.75) / 10) * 10 - 10);
  });
  it('makro w gramach', () => {
    const g = macroGoals(2000, { protein: 25, fat: 30, carbs: 45 }, 28);
    expect(g.protein).toBe(125);
    expect(g.fat).toBeCloseTo(66.67, 1);
    expect(g.carbs).toBe(225);
  });
});

describe('daty', () => {
  it('dodaje dni przez zmianę czasu', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(rangeKeys('2026-09-29', 3)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29']);
    expect(toKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('kopia zapasowa', () => {
  it('odrzuca obce pliki', () => {
    expect(() => validateBackup({ foo: 1 })).toThrow(/nie jest kopia zapasowa/);
    expect(() => validateBackup(null)).toThrow();
    expect(() => validateBackup({ format: 'kalorie-backup', version: 99, data: {} })).toThrow(/wersja/);
  });
  it('akceptuje poprawną kopię', () => {
    const b = validateBackup({
      format: 'kalorie-backup',
      version: 1,
      exportedAt: '2026-01-01T00:00:00Z',
      settings: null,
      data: { entries: [{ id: 'a', date: '2026-01-01', grams: 100, food: apple, meal: 'breakfast', createdAt: 1 }] },
    });
    expect(b.data.entries).toHaveLength(1);
  });
  it('wykrywa uszkodzony wpis', () => {
    expect(() => validateBackup({ format: 'kalorie-backup', version: 1, data: { entries: [{ id: 1 }] } })).toThrow(/Uszkodzony/);
  });
});

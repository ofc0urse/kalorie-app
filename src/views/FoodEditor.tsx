import { useEffect, useState } from 'preact/hooks';
import { BASIC_FOODS } from '../data/basicFoods';
import { deleteFood, getFood, putFood } from '../db/db';
import { normalizeBarcode } from '../lib/barcode';
import { fmt0, kcalFromMacros, round1 } from '../lib/nutrition';
import { useStore } from '../lib/store';
import { uid } from '../lib/text';
import { toast } from '../lib/toast';
import type { Food, Nutrients, Portion } from '../lib/types';
import { goBack, navigate, routeStore } from '../router';
import { bumpData } from '../settings';
import { diaryDate } from '../uiState';
import { FoodSheet } from '../ui/FoodSheet';
import { Icon } from '../ui/Icon';
import { NumField } from '../ui/NumField';
import { Topbar } from '../ui/Topbar';

type N = { [K in keyof Nutrients]: number | null };

/** Tworzenie i edycja własnego produktu (także powiązanego z kodem kreskowym). */
export function FoodEditorView() {
  const route = useStore(routeStore);
  const id = route.params.get('id');
  const date = route.params.get('d') || diaryDate.get();
  const meal = route.params.get('m') || '';
  const [loaded, setLoaded] = useState(!id);
  const [orig, setOrig] = useState<Food | null>(null);
  const [name, setName] = useState(route.params.get('nazwa') ?? '');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(route.params.get('kod') ?? '');
  const [unit, setUnit] = useState<'g' | 'ml'>('g');
  const [basis, setBasis] = useState<number | null>(100);
  const [n, setN] = useState<N>({ kcal: null, protein: null, fat: null, carbs: null, fiber: null });
  const [portions, setPortions] = useState<{ label: string; grams: number | null }[]>([]);
  const [saved, setSaved] = useState<Food | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const f = (await getFood(id)) ?? BASIC_FOODS.find((b) => b.id === id);
      if (f) {
        setOrig(f);
        setName(f.name);
        setBrand(f.brand ?? '');
        setBarcode(f.barcode ?? '');
        setUnit(f.unit === 'ml' ? 'ml' : 'g');
        setN({ ...f.per100 });
        setPortions(f.portions.map((p) => ({ ...p })));
      }
      setLoaded(true);
    })();
  }, [id]);

  const isCustom = orig?.source === 'custom';
  const b = basis && basis > 0 ? basis : 100;
  const per100: Nutrients = {
    kcal: ((n.kcal ?? 0) * 100) / b,
    protein: ((n.protein ?? 0) * 100) / b,
    fat: ((n.fat ?? 0) * 100) / b,
    carbs: ((n.carbs ?? 0) * 100) / b,
    fiber: ((n.fiber ?? 0) * 100) / b,
  };
  const macroKcal = kcalFromMacros(per100);
  const mismatch = n.kcal != null && macroKcal > 0 && Math.abs(macroKcal - per100.kcal) > Math.max(25, per100.kcal * 0.2);
  const codeOk = !barcode || /^\d{6,14}$/.test(barcode);
  const valid = name.trim().length > 0 && n.kcal != null && per100.kcal <= 950 && codeOk;

  const save = async () => {
    if (!valid) return;
    const food: Food = {
      id: isCustom ? orig!.id : `custom:${uid()}`,
      source: 'custom',
      name: name.trim(),
      brand: brand.trim() || undefined,
      barcode: barcode.trim() ? normalizeBarcode(barcode) : undefined,
      per100: {
        kcal: round1(per100.kcal),
        protein: round1(per100.protein),
        fat: round1(per100.fat),
        carbs: round1(per100.carbs),
        fiber: round1(per100.fiber),
      },
      portions: portions.filter((p): p is Portion => !!p.label.trim() && !!p.grams && p.grams > 0).map((p) => ({ label: p.label.trim(), grams: p.grams })),
      unit: unit === 'ml' ? 'ml' : undefined,
      createdAt: isCustom ? orig!.createdAt : Date.now(),
    };
    await putFood(food);
    bumpData();
    toast(isCustom ? 'Zapisano produkt' : 'Dodano produkt do „Moje”', { kind: 'success' });
    if (route.params.get('dodaj') === '1' || (meal && !id)) setSaved(food);
    else goBack('/produkty');
  };

  if (!loaded) return <div class="page no-tabbar" />;

  return (
    <div class="page no-tabbar" data-testid="food-editor">
      <Topbar title={isCustom ? 'Edytuj produkt' : orig ? 'Własna wersja produktu' : 'Nowy produkt'} />
      <div class="stack">
        {orig && !isCustom && (
          <div class="notice info">
            <Icon name="info" class="sm" /> Zmiany zostaną zapisane jako Twój własny produkt – oryginał z {orig.source === 'off' ? 'Open Food Facts' : orig.source === 'usda' ? 'USDA' : 'bazy'} pozostanie bez zmian.
          </div>
        )}
        <label class="field">
          <span>Nazwa *</span>
          <input class="input" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} placeholder="np. Jogurt skyr waniliowy" data-testid="fe-name" />
        </label>
        <div class="grid-2">
          <label class="field">
            <span>Marka</span>
            <input class="input" value={brand} onInput={(e) => setBrand((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>Kod kreskowy</span>
            <input
              class="input num"
              inputMode="numeric"
              value={barcode}
              onInput={(e) => setBarcode((e.currentTarget as HTMLInputElement).value.replace(/\D/g, ''))}
              data-testid="fe-barcode"
            />
          </label>
        </div>
        {!codeOk && <p class="small" style={{ color: 'var(--danger)' }}>Kod kreskowy powinien mieć 6–14 cyfr.</p>}

        <div class="card flat stack">
          <div class="row wrap">
            <h3 class="grow">Wartości odżywcze</h3>
            <div class="seg" role="group" aria-label="Jednostka" style={{ minWidth: 140 }}>
              <button aria-pressed={unit === 'g'} onClick={() => setUnit('g')}>
                g
              </button>
              <button aria-pressed={unit === 'ml'} onClick={() => setUnit('ml')}>
                ml
              </button>
            </div>
          </div>
          <NumField label={`Wartości podane na (${unit})`} value={basis} onChange={setBasis} suffix={unit} testId="fe-basis" />
          <div class="grid-2">
            <NumField label="Kalorie *" value={n.kcal} onChange={(v) => setN({ ...n, kcal: v })} suffix="kcal" testId="fe-kcal" />
            <NumField label="Białko" value={n.protein} onChange={(v) => setN({ ...n, protein: v })} suffix="g" testId="fe-protein" />
            <NumField label="Tłuszcz" value={n.fat} onChange={(v) => setN({ ...n, fat: v })} suffix="g" testId="fe-fat" />
            <NumField label="Węglowodany" value={n.carbs} onChange={(v) => setN({ ...n, carbs: v })} suffix="g" testId="fe-carbs" />
            <NumField label="Błonnik" value={n.fiber} onChange={(v) => setN({ ...n, fiber: v })} suffix="g" testId="fe-fiber" />
          </div>
          {b !== 100 && n.kcal != null && (
            <p class="small muted">
              Na 100 {unit}: {fmt0(per100.kcal)} kcal
            </p>
          )}
          {mismatch && (
            <div class="notice">
              <Icon name="alert" class="sm" /> Kalorie nie zgadzają się z makroskładnikami (z makro wychodzi ok. {fmt0(macroKcal)} kcal na 100 {unit}). Sprawdź etykietę.
            </div>
          )}
          {per100.kcal > 950 && <p class="small" style={{ color: 'var(--danger)' }}>Ponad 950 kcal na 100 {unit} – to prawdopodobnie błąd.</p>}
        </div>

        <div class="card flat stack">
          <h3>Porcje</h3>
          {portions.map((p, i) => (
            <div class="row" key={i}>
              <input
                class="input grow"
                placeholder="np. sztuka, kromka"
                value={p.label}
                aria-label="Nazwa porcji"
                onInput={(e) => setPortions(portions.map((x, j) => (j === i ? { ...x, label: (e.currentTarget as HTMLInputElement).value } : x)))}
              />
              <div style={{ width: 120 }}>
                <NumField value={p.grams} onChange={(v) => setPortions(portions.map((x, j) => (j === i ? { ...x, grams: v } : x)))} suffix={unit} />
              </div>
              <button class="icon-btn" aria-label="Usuń porcję" onClick={() => setPortions(portions.filter((_, j) => j !== i))}>
                <Icon name="x" class="sm" />
              </button>
            </div>
          ))}
          <button class="btn small outline" onClick={() => setPortions([...portions, { label: '', grams: null }])}>
            <Icon name="plus" class="sm" /> Dodaj porcję
          </button>
        </div>

        <button class="btn primary block" disabled={!valid} onClick={save} data-testid="fe-save">
          Zapisz produkt
        </button>
        {isCustom && (
          <button
            class="btn danger block"
            onClick={async () => {
              if (!confirm(`Usunąć produkt „${orig!.name}”? Wpisy w dzienniku zostaną.`)) return;
              await deleteFood(orig!.id);
              bumpData();
              toast('Usunięto produkt', {
                undo: async () => {
                  await putFood(orig!);
                  bumpData();
                },
              });
              goBack('/produkty');
            }}
          >
            Usuń produkt
          </button>
        )}
      </div>
      {saved && (
        <FoodSheet
          food={saved}
          date={date}
          meal={meal || 'snacks'}
          onClose={() => {
            setSaved(null);
            goBack('/produkty');
          }}
          onAdded={() => {
            diaryDate.set(date);
            navigate('/', undefined, true);
          }}
        />
      )}
    </div>
  );
}

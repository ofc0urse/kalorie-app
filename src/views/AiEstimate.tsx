import { useRef, useState } from 'preact/hooks';
import { AiError, estimateWithAi, type AiEstimate, type AiItem } from '../api/ai';
import { addEntries } from '../diary';
import { compressImage, type CompressedImage } from '../lib/image';
import { fmt0, fmt1, round1, scale, toPer100 } from '../lib/nutrition';
import { useStore } from '../lib/store';
import { uid } from '../lib/text';
import type { Food } from '../lib/types';
import { navigate, routeStore } from '../router';
import { settingsStore } from '../settings';
import { diaryDate } from '../uiState';
import { Icon } from '../ui/Icon';
import { NumField } from '../ui/NumField';
import { AmountSheet, IngredientPicker } from '../ui/Pickers';
import { Topbar } from '../ui/Topbar';

/** Pozycja do edycji – zapamiętujemy wartości "na gram", żeby zmiana gramów przeliczała resztę. */
interface EditItem {
  key: string;
  name: string;
  grams: number | null;
  perGram: { kcal: number; protein: number; fat: number; carbs: number; fiber: number };
  confidence: AiItem['confidence'] | 'manual';
  food?: Food;
}

const CONF: Record<EditItem['confidence'], string> = { high: 'pewne', medium: 'średnio pewne', low: 'niepewne', manual: 'dodane ręcznie' };

function toEditItem(i: AiItem): EditItem {
  const g = i.grams > 0 ? i.grams : 100;
  return {
    key: uid(),
    name: i.name,
    grams: i.grams > 0 ? round1(i.grams) : 100,
    perGram: { kcal: i.kcal / g, protein: i.protein / g, fat: i.fat / g, carbs: i.carbs / g, fiber: i.fiber / g },
    confidence: i.confidence,
  };
}

function itemTotals(i: EditItem) {
  const g = i.grams ?? 0;
  return { kcal: i.perGram.kcal * g, protein: i.perGram.protein * g, fat: i.perGram.fat * g, carbs: i.perGram.carbs * g, fiber: i.perGram.fiber * g };
}

export function AiEstimateView() {
  const route = useStore(routeStore);
  const settings = useStore(settingsStore);
  const date = route.params.get('d') || diaryDate.get();
  const [meal, setMeal] = useState(route.params.get('m') || 'lunch');
  const [mode, setMode] = useState<'photo' | 'text'>(route.params.get('tryb') === 'opis' ? 'text' : 'photo');
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [context, setContext] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiEstimate | null>(null);
  const [items, setItems] = useState<EditItem[]>([]);
  const [picking, setPicking] = useState(false);
  const [amountFor, setAmountFor] = useState<Food | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const ctrl = useRef<AbortController | null>(null);

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    setError('');
    setResult(null);
    try {
      setPhoto(await compressImage(f, 1024, 0.8));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const run = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    ctrl.current = new AbortController();
    try {
      const r = await estimateWithAi(
        settings.aiEndpoint,
        mode === 'photo' ? { mode: 'photo', image: photo!.base64, text: context.trim() || undefined } : { mode: 'text', text: description.trim() },
        ctrl.current.signal,
      );
      setResult(r);
      setItems(r.items.map(toEditItem));
      if (!r.is_food || r.items.length === 0) setError('Nie rozpoznano jedzenia. Spróbuj innego zdjęcia albo opisz posiłek słowami.');
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Nieoczekiwany błąd.');
    } finally {
      setBusy(false);
    }
  };

  const totals = items.reduce(
    (acc, i) => {
      const t = itemTotals(i);
      return { kcal: acc.kcal + t.kcal, protein: acc.protein + t.protein, fat: acc.fat + t.fat, carbs: acc.carbs + t.carbs, fiber: acc.fiber + t.fiber };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
  );
  const validItems = items.filter((i) => i.name.trim() && (i.grams ?? 0) > 0);

  const save = async () => {
    await addEntries(
      validItems.map((i) => {
        const t = itemTotals(i);
        const grams = round1(i.grams!);
        const food: Food = i.food ?? {
          id: `ai:${uid()}`,
          source: 'ai',
          name: i.name.trim(),
          per100: toPer100(t, grams),
          portions: [],
        };
        return { date, meal, food, grams };
      }),
      `Dodano ${validItems.length} ${validItems.length === 1 ? 'pozycję' : 'pozycje'} (${fmt0(totals.kcal)} kcal)`,
    );
    diaryDate.set(date);
    navigate('/', undefined, true);
  };

  const canRun = !busy && (mode === 'photo' ? !!photo : description.trim().length >= 3);

  return (
    <div class="page no-tabbar" data-testid="ai-view">
      <Topbar title={mode === 'photo' ? 'Szacowanie ze zdjęcia' : 'Opisz posiłek'} />

      <div class="notice" role="note">
        <Icon name="info" class="sm" />
        <div>
          <b>To tylko szacunek.</b> AI ocenia porcje na oko – przed zapisaniem sprawdź i popraw gramy. Zdjęcie trafia do Twojego backendu i do Claude API (Anthropic), nie jest zapisywane w aplikacji.
        </div>
      </div>

      {!settings.aiEndpoint && (
        <div class="notice error mt" data-testid="ai-no-endpoint">
          <Icon name="alert" class="sm" />
          <div class="grow">
            Brak adresu backendu AI.{' '}
            <a href="#/ustawienia?s=integracje">Ustaw go w Ustawieniach</a> (instrukcja wdrożenia Workera jest w README).
          </div>
        </div>
      )}

      <div class="seg mt" role="group" aria-label="Tryb">
        <button aria-pressed={mode === 'photo'} onClick={() => setMode('photo')}>
          Zdjęcie
        </button>
        <button aria-pressed={mode === 'text'} onClick={() => setMode('text')}>
          Opis słowami
        </button>
      </div>

      {mode === 'photo' ? (
        <div class="stack mt">
          {photo ? (
            <img class="photo-preview" src={photo.dataUrl} alt="Zdjęcie posiłku" data-testid="photo-preview" />
          ) : (
            <div class="card center muted" style={{ padding: 32 }}>
              <Icon name="camera" class="accent" />
              <p class="mt">Zrób zdjęcie talerza z góry lub pod kątem – najlepiej z widocznymi sztućcami dla skali.</p>
            </div>
          )}
          <div class="grid-2">
            <button class="btn" onClick={() => cameraInput.current?.click()} data-testid="take-photo">
              <Icon name="camera" class="sm" /> {photo ? 'Nowe zdjęcie' : 'Zrób zdjęcie'}
            </button>
            <button class="btn" onClick={() => galleryInput.current?.click()} data-testid="pick-photo">
              <Icon name="image" class="sm" /> Z galerii
            </button>
          </div>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" class="visually-hidden" onChange={onFile} data-testid="camera-input" />
          <input ref={galleryInput} type="file" accept="image/*" class="visually-hidden" onChange={onFile} data-testid="gallery-input" />
          {photo && <p class="tiny muted">Zdjęcie po kompresji: {photo.width}×{photo.height}, {fmt0(photo.bytes / 1024)} kB</p>}
          <label class="field">
            <span>Kontekst (opcjonalnie)</span>
            <input
              class="input"
              value={context}
              maxLength={300}
              placeholder="np. smażone na maśle, zjadłem połowę"
              onInput={(e) => setContext((e.currentTarget as HTMLInputElement).value)}
              data-testid="ai-context"
            />
          </label>
        </div>
      ) : (
        <label class="field mt">
          <span>Co zjadłeś/zjadłaś?</span>
          <textarea
            class="textarea"
            maxLength={1000}
            placeholder="np. dwie kromki chleba żytniego z masłem i szynką, pomidor, kawa z mlekiem"
            value={description}
            onInput={(e) => setDescription((e.currentTarget as HTMLTextAreaElement).value)}
            data-testid="ai-description"
          />
        </label>
      )}

      {!result && (
        <button class="btn primary block mt" disabled={!canRun || !settings.aiEndpoint} onClick={run} data-testid="ai-run">
          {busy ? (
            <>
              <span class="spinner" style={{ borderTopColor: 'var(--on-accent)' }} /> Analizuję… (do ok. 30 s)
            </>
          ) : (
            <>
              <Icon name="sparkles" class="sm" /> Oszacuj kalorie
            </>
          )}
        </button>
      )}
      {busy && (
        <button class="btn ghost block" onClick={() => ctrl.current?.abort()}>
          Anuluj
        </button>
      )}

      {error && (
        <div class="notice error mt" role="alert" data-testid="ai-error">
          <Icon name="alert" class="sm" />
          <div>{error}</div>
        </div>
      )}

      {result && (
        <section class="card mt" data-testid="ai-result">
          <div class="card-title">
            <h2>{result.meal_name || 'Wynik'}</h2>
            <span class="badge ai">szacunek AI</span>
          </div>
          {result.notes && <p class="small muted">{result.notes}</p>}
          <div class="mt">
            {items.map((i, idx) => {
              const t = itemTotals(i);
              return (
                <div class="ai-item" key={i.key} data-testid="ai-item">
                  <div class="stack" style={{ gap: 6 }}>
                    <input
                      class="input"
                      value={i.name}
                      aria-label="Nazwa składnika"
                      onInput={(e) => setItems(items.map((x, j) => (j === idx ? { ...x, name: (e.currentTarget as HTMLInputElement).value } : x)))}
                    />
                    <div class="row">
                      <div style={{ width: 120 }}>
                        <NumField value={i.grams} onChange={(v) => setItems(items.map((x, j) => (j === idx ? { ...x, grams: v } : x)))} suffix="g" testId="ai-grams" label={`Gramy: ${i.name}`} />
                      </div>
                      <span class={`conf ${i.confidence === 'manual' ? 'high' : i.confidence}`}>{CONF[i.confidence]}</span>
                    </div>
                    <span class="small muted num">
                      {fmt0(t.kcal)} kcal · B {fmt1(t.protein)} · T {fmt1(t.fat)} · W {fmt1(t.carbs)} · Bł {fmt1(t.fiber)}
                    </span>
                  </div>
                  <button class="icon-btn" aria-label={`Usuń ${i.name}`} onClick={() => setItems(items.filter((_, j) => j !== idx))}>
                    <Icon name="trash" class="sm" />
                  </button>
                </div>
              );
            })}
          </div>
          <button class="btn outline block mt" onClick={() => setPicking(true)} data-testid="ai-add-item">
            <Icon name="plus" class="sm" /> Dodaj składnik z bazy
          </button>
          <div class="kcal-line">
            <div>
              Razem<b data-testid="ai-total">{fmt0(totals.kcal)} kcal</b>
            </div>
            <div class="center">
              B / T / W<b>{fmt0(totals.protein)} / {fmt0(totals.fat)} / {fmt0(totals.carbs)} g</b>
            </div>
          </div>
          <label class="field mt">
            <span>Posiłek</span>
            <select class="select" value={meal} onChange={(e) => setMeal((e.currentTarget as HTMLSelectElement).value)}>
              {settings.meals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button class="btn primary block mt" disabled={validItems.length === 0} onClick={save} data-testid="ai-save">
            <Icon name="check" class="sm" /> Dodaj do dziennika
          </button>
          <button
            class="btn ghost block"
            onClick={() => {
              setResult(null);
              setItems([]);
            }}
          >
            Oszacuj ponownie
          </button>
        </section>
      )}

      {picking && (
        <IngredientPicker
          title="Dodaj składnik"
          onClose={() => setPicking(false)}
          onPick={(f) => {
            setPicking(false);
            setAmountFor(f);
          }}
        />
      )}
      {amountFor && (
        <AmountSheet
          food={amountFor}
          initial={amountFor.portions[0]?.grams ?? 100}
          onClose={() => setAmountFor(null)}
          onSave={(grams) => {
            const n = scale(amountFor.per100, 1);
            setItems([...items, { key: uid(), name: amountFor.name, grams, perGram: n, confidence: 'manual', food: amountFor }]);
            setAmountFor(null);
          }}
        />
      )}
    </div>
  );
}

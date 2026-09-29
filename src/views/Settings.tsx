import { useEffect, useRef, useState } from 'preact/hooks';
import { getDB } from '../db/db';
import { backupFileName, createBackup, restoreBackup, validateBackup } from '../lib/backup';
import { fmt0 } from '../lib/nutrition';
import { useStore } from '../lib/store';
import { ACTIVITY, GOALS, SPLIT_PRESETS, computeGoal, macroGoals } from '../lib/tdee';
import { uid } from '../lib/text';
import { toast } from '../lib/toast';
import type { ActivityLevel, GoalType, MacroSplit, MealDef, Profile, Settings } from '../lib/types';
import { navigate, routeStore } from '../router';
import { bumpData, loadSettings, saveSettings, settingsStore } from '../settings';
import { applyTheme } from '../theme';
import { Icon } from '../ui/Icon';
import { NumField } from '../ui/NumField';

export function SettingsView() {
  const settings = useStore(settingsStore);
  const route = useStore(routeStore);
  useEffect(() => {
    const s = route.params.get('s');
    if (s) document.getElementById(`sec-${s}`)?.scrollIntoView({ block: 'start' });
  }, []);
  return (
    <div class="page" data-testid="settings">
      <header class="topbar">
        <span class="spacer" />
        <h1>Ustawienia</h1>
        <span class="spacer" />
      </header>
      <GoalSection settings={settings} />
      <MacroSection settings={settings} />
      <MealsSection settings={settings} />
      <WaterSection settings={settings} />
      <IntegrationsSection settings={settings} />
      <AppearanceSection settings={settings} />
      <DataSection />
      <p class="tiny muted center mt-lg">
        Kalorie · dane przechowywane tylko na tym urządzeniu · wersja {__APP_VERSION__}
      </p>
    </div>
  );
}

export function ProfileForm({ initial, onSave, submitLabel = 'Zapisz i przelicz' }: { initial: Profile | null; onSave: (p: Profile) => void; submitLabel?: string }) {
  const [p, setP] = useState<Partial<Profile>>(
    initial ?? { sex: 'female', activity: 'light', goal: 'lose_slow' },
  );
  const set = (patch: Partial<Profile>) => setP({ ...p, ...patch });
  const complete =
    p.sex && p.activity && p.goal && p.age && p.age >= 14 && p.age <= 110 && p.heightCm && p.heightCm >= 100 && p.heightCm <= 250 && p.weightKg && p.weightKg >= 30 && p.weightKg <= 400;
  const result = complete ? computeGoal(p as Profile) : null;
  return (
    <div class="stack" data-testid="profile-form">
      <div class="seg" role="group" aria-label="Płeć">
        <button aria-pressed={p.sex === 'female'} onClick={() => set({ sex: 'female' })}>
          Kobieta
        </button>
        <button aria-pressed={p.sex === 'male'} onClick={() => set({ sex: 'male' })}>
          Mężczyzna
        </button>
      </div>
      <div class="grid-3">
        <NumField label="Wiek" value={p.age} onChange={(v) => set({ age: v ?? undefined })} suffix="lat" testId="age" />
        <NumField label="Wzrost" value={p.heightCm} onChange={(v) => set({ heightCm: v ?? undefined })} suffix="cm" testId="height" />
        <NumField label="Waga" value={p.weightKg} onChange={(v) => set({ weightKg: v ?? undefined })} suffix="kg" testId="weight" />
      </div>
      <label class="field">
        <span>Aktywność</span>
        <select class="select" value={p.activity} onChange={(e) => set({ activity: (e.currentTarget as HTMLSelectElement).value as ActivityLevel })} data-testid="activity">
          {Object.entries(ACTIVITY).map(([k, a]) => (
            <option key={k} value={k}>
              {a.label}
            </option>
          ))}
        </select>
        {p.activity && <small class="tiny muted">{ACTIVITY[p.activity].hint}</small>}
      </label>
      <label class="field">
        <span>Cel</span>
        <select class="select" value={p.goal} onChange={(e) => set({ goal: (e.currentTarget as HTMLSelectElement).value as GoalType })} data-testid="goal">
          {Object.entries(GOALS).map(([k, g]) => (
            <option key={k} value={k}>
              {g.label}
            </option>
          ))}
        </select>
        {p.goal && <small class="tiny muted">{GOALS[p.goal].hint}</small>}
      </label>
      {result && (
        <div class="notice info" data-testid="goal-result">
          <Icon name="info" class="sm" />
          <div>
            Podstawowa przemiana materii (Mifflin-St Jeor): <b>{fmt0(result.bmr)} kcal</b>, całkowite zapotrzebowanie: <b>{fmt0(result.tdee)} kcal</b>.
            <br />
            Twój cel: <b data-testid="goal-kcal">{fmt0(result.target)} kcal</b> dziennie.
            {result.clamped && (
              <>
                <br />
                Cel podniesiono do bezpiecznego minimum ({result.minimum} kcal). Niższe spożycie warto skonsultować z lekarzem lub dietetykiem.
              </>
            )}
          </div>
        </div>
      )}
      <button class="btn primary block" disabled={!complete} onClick={() => complete && onSave(p as Profile)} data-testid="profile-save">
        {submitLabel}
      </button>
    </div>
  );
}

function GoalSection({ settings }: { settings: Settings }) {
  const [manual, setManual] = useState<number | null>(settings.kcalGoal);
  useEffect(() => setManual(settings.kcalGoal), [settings.kcalGoal]);
  return (
    <>
      <h2 class="section-label" id="sec-cel">
        Cel kalorii
      </h2>
      <section class="card stack">
        <p class="small muted">
          Aktualny cel: <b style={{ color: 'var(--text)' }} data-testid="current-goal">{fmt0(settings.kcalGoal)} kcal</b>
          {settings.kcalGoalManual ? ' (ustawiony ręcznie)' : settings.profile ? ' (z kalkulatora)' : ''}
        </p>
        <ProfileForm
          initial={settings.profile}
          onSave={async (profile) => {
            await saveSettings({ profile, kcalGoalManual: false });
            toast('Przeliczono cel', { kind: 'success' });
          }}
        />
        <div class="row" style={{ alignItems: 'flex-end' }}>
          <div class="grow">
            <NumField label="Albo wpisz cel ręcznie" value={manual} onChange={setManual} suffix="kcal" testId="manual-goal" />
          </div>
          <button
            class="btn"
            disabled={!manual || manual < 800 || manual > 8000}
            onClick={async () => {
              await saveSettings({ kcalGoal: Math.round(manual!), kcalGoalManual: true });
              toast('Zapisano cel', { kind: 'success' });
            }}
          >
            Ustaw
          </button>
        </div>
        {settings.kcalGoal < 1200 && (
          <div class="notice">
            <Icon name="alert" class="sm" /> Cel poniżej 1200 kcal jest bardzo niski – rozważ konsultację ze specjalistą.
          </div>
        )}
      </section>
    </>
  );
}

function MacroSection({ settings }: { settings: Settings }) {
  const [split, setSplit] = useState<MacroSplit>(settings.macroSplit);
  const [fiber, setFiber] = useState<number | null>(settings.fiberGoal);
  useEffect(() => setSplit(settings.macroSplit), [settings.macroSplit]);
  const sum = split.protein + split.fat + split.carbs;
  const g = macroGoals(settings.kcalGoal, split, fiber ?? 0);
  const setK = (k: keyof MacroSplit) => (v: number | null) => setSplit({ ...split, [k]: v ?? 0 });
  return (
    <>
      <h2 class="section-label" id="sec-makro">
        Podział makroskładników
      </h2>
      <section class="card stack">
        <div class="chips">
          {SPLIT_PRESETS.map((p) => (
            <button
              key={p.label}
              class="chip"
              aria-pressed={p.split.protein === split.protein && p.split.fat === split.fat && p.split.carbs === split.carbs}
              onClick={() => setSplit(p.split)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div class="grid-3">
          <NumField label="Białko" value={split.protein} onChange={setK('protein')} suffix="%" testId="split-protein" />
          <NumField label="Tłuszcz" value={split.fat} onChange={setK('fat')} suffix="%" testId="split-fat" />
          <NumField label="Węgle" value={split.carbs} onChange={setK('carbs')} suffix="%" testId="split-carbs" />
        </div>
        <p class={`small ${sum === 100 ? 'muted' : ''}`} style={{ color: sum === 100 ? undefined : 'var(--danger)' }}>
          Suma: {sum}% {sum !== 100 && '– musi wynosić 100%'} · B {fmt0(g.protein)} g · T {fmt0(g.fat)} g · W {fmt0(g.carbs)} g
        </p>
        <NumField label="Cel błonnika" value={fiber} onChange={setFiber} suffix="g" />
        <button
          class="btn primary block"
          disabled={sum !== 100 || !fiber}
          onClick={async () => {
            await saveSettings({ macroSplit: split, fiberGoal: fiber ?? 25 });
            toast('Zapisano podział makro', { kind: 'success' });
          }}
          data-testid="split-save"
        >
          Zapisz podział
        </button>
      </section>
    </>
  );
}

function MealsSection({ settings }: { settings: Settings }) {
  const [meals, setMeals] = useState<MealDef[]>(settings.meals);
  const [newName, setNewName] = useState('');
  useEffect(() => setMeals(settings.meals), [settings.meals]);
  const save = async (m: MealDef[]) => {
    setMeals(m);
    await saveSettings({ meals: m });
  };
  return (
    <>
      <h2 class="section-label" id="sec-posilki">
        Posiłki
      </h2>
      <section class="card">
        <div class="list">
          {meals.map((m, i) => (
            <div class="list-item" key={m.id}>
              <input
                class="input grow"
                value={m.name}
                aria-label={`Nazwa posiłku ${i + 1}`}
                onChange={(e) => {
                  const name = (e.currentTarget as HTMLInputElement).value.trim();
                  if (name) void save(meals.map((x) => (x.id === m.id ? { ...x, name } : x)));
                }}
              />
              <button class="icon-btn" aria-label={`Przesuń ${m.name} w górę`} disabled={i === 0} onClick={() => save(swap(meals, i, i - 1))}>
                <Icon name="left" class="sm rot90" />
              </button>
              <button
                class="icon-btn"
                aria-label={`Usuń ${m.name}`}
                disabled={meals.length <= 1}
                onClick={() => {
                  if (confirm(`Usunąć posiłek „${m.name}”? Wpisy z tego posiłku pozostaną widoczne jako „Inne”.`)) void save(meals.filter((x) => x.id !== m.id));
                }}
              >
                <Icon name="trash" class="sm" />
              </button>
            </div>
          ))}
        </div>
        <div class="row mt">
          <input
            class="input grow"
            placeholder="Nowy posiłek, np. II śniadanie"
            value={newName}
            onInput={(e) => setNewName((e.currentTarget as HTMLInputElement).value)}
            data-testid="new-meal"
          />
          <button
            class="btn"
            disabled={!newName.trim()}
            onClick={async () => {
              await save([...meals, { id: `meal-${uid().slice(0, 8)}`, name: newName.trim() }]);
              setNewName('');
            }}
            data-testid="add-meal"
          >
            Dodaj
          </button>
        </div>
      </section>
    </>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const c = [...arr];
  [c[a], c[b]] = [c[b], c[a]];
  return c;
}

function WaterSection({ settings }: { settings: Settings }) {
  return (
    <>
      <h2 class="section-label">Woda</h2>
      <section class="card grid-2">
        <NumField label="Cel dzienny" value={settings.waterGoalMl} onChange={(v) => v && v >= 250 && saveSettings({ waterGoalMl: v })} suffix="ml" />
        <NumField label="Jedna szklanka" value={settings.waterStepMl} onChange={(v) => v && v >= 50 && saveSettings({ waterStepMl: v })} suffix="ml" />
      </section>
    </>
  );
}

function IntegrationsSection({ settings }: { settings: Settings }) {
  const [endpoint, setEndpoint] = useState(settings.aiEndpoint);
  const [key, setKey] = useState(settings.usdaApiKey);
  return (
    <>
      <h2 class="section-label" id="sec-integracje">
        Źródła danych i AI
      </h2>
      <section class="card stack">
        <label class="field">
          <span>Adres backendu AI (Cloudflare Worker)</span>
          <input
            class="input"
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellcheck={false}
            placeholder="https://kalorie-ai.twoje-konto.workers.dev"
            value={endpoint}
            onInput={(e) => setEndpoint((e.currentTarget as HTMLInputElement).value)}
            onBlur={() => saveSettings({ aiEndpoint: endpoint.trim().replace(/\/+$/, '') })}
            data-testid="ai-endpoint"
          />
        </label>
        <p class="tiny muted">Potrzebny do szacowania kalorii ze zdjęcia i z opisu (Gemini API). Instrukcja wdrożenia jest w README repozytorium.</p>
        <label class="check">
          <input
            type="checkbox"
            checked={settings.aiAccurate}
            onChange={(e) => saveSettings({ aiAccurate: (e.currentTarget as HTMLInputElement).checked })}
            data-testid="ai-accurate"
          />
          <span>
            Dokładniej (Gemini Flash)
            <br />
            <small class="tiny muted">Wolniej i z niższym limitem darmowego pakietu. Domyślnie: Gemini Flash-Lite.</small>
          </span>
        </label>
        <label class="field">
          <span>Klucz API USDA FoodData Central (opcjonalny)</span>
          <input
            class="input"
            autoCapitalize="off"
            autoCorrect="off"
            spellcheck={false}
            placeholder="bez klucza: DEMO_KEY (mały limit)"
            value={key}
            onInput={(e) => setKey((e.currentTarget as HTMLInputElement).value)}
            onBlur={() => saveSettings({ usdaApiKey: key.trim() })}
            data-testid="usda-key"
          />
        </label>
        <p class="tiny muted">
          Darmowy klucz: <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noopener">fdc.nal.usda.gov/api-key-signup</a>. Klucz USDA jest publiczny z natury (limit na klucz), dlatego może być przechowywany w przeglądarce.
        </p>
        <label class="check">
          <input type="checkbox" checked={settings.offPreferPoland} onChange={(e) => saveSettings({ offPreferPoland: (e.currentTarget as HTMLInputElement).checked })} />
          Open Food Facts: najpierw produkty sprzedawane w Polsce
        </label>
      </section>
    </>
  );
}

function AppearanceSection({ settings }: { settings: Settings }) {
  return (
    <>
      <h2 class="section-label">Wygląd</h2>
      <section class="card">
        <div class="seg" role="group" aria-label="Motyw">
          {(
            [
              ['system', 'Systemowy'],
              ['light', 'Jasny'],
              ['dark', 'Ciemny'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              aria-pressed={settings.theme === k}
              onClick={async () => {
                await saveSettings({ theme: k });
                applyTheme(k);
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h2 class="section-label" id="sec-dane">
        Kopia zapasowa
      </h2>
      <section class="card stack">
        <p class="small muted">Dane są tylko na tym urządzeniu. Rób regularnie kopię – np. przed wyczyszczeniem danych Safari.</p>
        <button
          class="btn block"
          disabled={busy}
          data-testid="export"
          onClick={async () => {
            setBusy(true);
            try {
              const b = await createBackup();
              const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
              const name = backupFileName();
              const file = new File([blob], name, { type: 'application/json' });
              const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
              if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
                await navigator.share({ files: [file], title: name });
              } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
              }
              toast('Wyeksportowano kopię', { kind: 'success' });
            } catch (e) {
              if ((e as Error).name !== 'AbortError') toast(`Błąd eksportu: ${(e as Error).message}`, { kind: 'error' });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="download" class="sm" /> Eksportuj dane (JSON)
        </button>
        <button class="btn block" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" class="sm" /> Importuj kopię
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          class="visually-hidden"
          data-testid="import-file"
          onChange={async (e) => {
            const input = e.currentTarget as HTMLInputElement;
            const f = input.files?.[0];
            input.value = '';
            if (!f) return;
            setBusy(true);
            try {
              const b = validateBackup(JSON.parse(await f.text()));
              const n = (b.data.entries ?? []).length;
              const replace = confirm(
                `Kopia z ${new Date(b.exportedAt).toLocaleString('pl-PL')} (${n} wpisów).\n\nOK – zastąp obecne dane kopią.\nAnuluj – połącz z obecnymi danymi.`,
              );
              await restoreBackup(b, replace ? 'replace' : 'merge');
              await loadSettings();
              bumpData();
              toast('Zaimportowano dane', { kind: 'success' });
            } catch (err) {
              toast(`Nie udało się zaimportować: ${(err as Error).message}`, { kind: 'error', ms: 6000 });
            } finally {
              setBusy(false);
            }
          }}
        />
        <button
          class="btn danger block"
          onClick={async () => {
            if (!confirm('Usunąć WSZYSTKIE dane z tego urządzenia? Tej operacji nie można cofnąć. Najpierw wyeksportuj kopię.')) return;
            const db = await getDB();
            for (const s of ['entries', 'foods', 'recipes', 'favorites', 'recents', 'weights', 'water', 'kv', 'cache'] as const) await db.clear(s);
            await loadSettings();
            bumpData();
            navigate('/', undefined, true);
            toast('Usunięto dane');
          }}
        >
          Usuń wszystkie dane
        </button>
      </section>
    </>
  );
}

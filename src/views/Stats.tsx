import { useEffect, useMemo, useState } from 'preact/hooks';
import { allWeights, entriesInRange, waterInRange } from '../db/db';
import { formatShort, rangeKeys, today, weekdayShort } from '../lib/date';
import { add, entryNutrients, fmt0, fmt1, ZERO } from '../lib/nutrition';
import { useStore } from '../lib/store';
import { macroGoals } from '../lib/tdee';
import type { Entry, Nutrients, WaterEntry, WeightEntry } from '../lib/types';
import { dataVersion, settingsStore } from '../settings';
import { BarChart, LineChart, type Point } from '../ui/Charts';

type Range = 7 | 30 | 90;

export function StatsView() {
  const settings = useStore(settingsStore);
  const version = useStore(dataVersion);
  const [range, setRange] = useState<Range>(7);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [water, setWater] = useState<WaterEntry[]>([]);
  const [showTable, setShowTable] = useState(false);
  const days = useMemo(() => rangeKeys(today(), range), [range]);

  useEffect(() => {
    void (async () => {
      setEntries(await entriesInRange(days[0], days[days.length - 1]));
      setWeights(await allWeights());
      setWater(await waterInRange(days[0], days[days.length - 1]));
    })();
  }, [days, version]);

  const perDay = useMemo(() => {
    const m = new Map<string, Nutrients>();
    for (const e of entries) m.set(e.date, add(m.get(e.date) ?? { ...ZERO }, entryNutrients(e)));
    return m;
  }, [entries]);

  const logged = days.filter((d) => (perDay.get(d)?.kcal ?? 0) > 0);
  const avg = logged.reduce((acc, d) => add(acc, perDay.get(d)!), { ...ZERO });
  const n = Math.max(1, logged.length);
  const avgN: Nutrients = { kcal: avg.kcal / n, protein: avg.protein / n, fat: avg.fat / n, carbs: avg.carbs / n, fiber: avg.fiber / n };
  const goals = macroGoals(settings.kcalGoal, settings.macroSplit, settings.fiberGoal);
  const onTarget = logged.filter((d) => Math.abs(perDay.get(d)!.kcal - goals.kcal) <= goals.kcal * 0.1).length;
  const waterDays = water.filter((w) => w.ml > 0);
  const avgWater = waterDays.length ? waterDays.reduce((s, w) => s + w.ml, 0) / waterDays.length : 0;

  const kcalPoints: Point[] = days.map((d) => ({
    key: d,
    label: range === 7 ? weekdayShort(d) : formatShort(d),
    value: perDay.get(d)?.kcal ?? 0,
    tip: `${formatShort(d)}: ${fmt0(perDay.get(d)?.kcal ?? 0)} kcal`,
  }));

  const wRange = rangeKeys(today(), range === 7 ? 30 : range);
  const wMap = new Map(weights.map((w) => [w.date, w.kg]));
  const weightPoints: Point[] = wRange.map((d) => ({
    key: d,
    label: formatShort(d),
    value: wMap.get(d) ?? null,
    tip: wMap.has(d) ? `${formatShort(d)}: ${fmt1(wMap.get(d)!)} kg` : undefined,
  }));
  const wVals = weightPoints.filter((p) => p.value != null);
  const wDelta = wVals.length >= 2 ? wVals[wVals.length - 1].value! - wVals[0].value! : null;

  const macroEnergy = avgN.protein * 4 + avgN.fat * 9 + avgN.carbs * 4;
  const pct = (g: number, f: number) => (macroEnergy > 0 ? Math.round(((g * f) / macroEnergy) * 100) : 0);

  return (
    <div class="page" data-testid="stats">
      <header class="topbar">
        <span class="spacer" />
        <h1>Statystyki</h1>
        <span class="spacer" />
      </header>
      <div class="seg" role="group" aria-label="Zakres">
        {([7, 30, 90] as Range[]).map((r) => (
          <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
            {r === 7 ? 'Tydzień' : r === 30 ? 'Miesiąc' : '3 miesiące'}
          </button>
        ))}
      </div>

      <div class="stat-tiles mt">
        <div class="stat-tile">
          <div class="v" data-testid="avg-kcal">{fmt0(avgN.kcal)}</div>
          <div class="l">śr. kcal / dzień</div>
        </div>
        <div class="stat-tile">
          <div class="v">
            {onTarget}/{logged.length}
          </div>
          <div class="l">dni w celu (±10%)</div>
        </div>
        <div class="stat-tile">
          <div class="v">{wDelta == null ? '–' : `${wDelta > 0 ? '+' : ''}${fmt1(wDelta)}`}</div>
          <div class="l">zmiana wagi (kg)</div>
        </div>
        <div class="stat-tile">
          <div class="v">{fmt1(avgWater / 1000)} l</div>
          <div class="l">śr. woda / dzień</div>
        </div>
      </div>

      <section class="card mt">
        <div class="card-title">
          <h2>Kalorie</h2>
          <button class="btn small ghost" onClick={() => setShowTable(!showTable)}>
            {showTable ? 'Wykres' : 'Tabela'}
          </button>
        </div>
        {showTable ? (
          <table class="small num" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr class="muted">
                <th style={{ textAlign: 'left' }}>Dzień</th>
                <th style={{ textAlign: 'right' }}>kcal</th>
                <th style={{ textAlign: 'right' }}>B</th>
                <th style={{ textAlign: 'right' }}>T</th>
                <th style={{ textAlign: 'right' }}>W</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => {
                const v = perDay.get(d) ?? ZERO;
                return (
                  <tr key={d} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 0' }}>
                      {weekdayShort(d)} {formatShort(d)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmt0(v.kcal)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt0(v.protein)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt0(v.fat)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt0(v.carbs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <BarChart points={kcalPoints} goal={settings.kcalGoal} unit="kcal" label={`Kalorie dziennie, ostatnie ${range} dni`} />
        )}
        <p class="tiny muted mt">Dotknij słupka, aby zobaczyć wartość. Czerwony – ponad 105% celu.</p>
      </section>

      <section class="card mt">
        <h2>Średnie makroskładniki</h2>
        <p class="small muted" style={{ marginBottom: 12 }}>
          z {logged.length} {logged.length === 1 ? 'dnia' : 'dni'} z wpisami
        </p>
        <div class="stack" style={{ gap: 10 }}>
          <AvgRow label="Białko" v={avgN.protein} goal={goals.protein} pct={pct(avgN.protein, 4)} color="var(--protein)" />
          <AvgRow label="Tłuszcz" v={avgN.fat} goal={goals.fat} pct={pct(avgN.fat, 9)} color="var(--fat)" />
          <AvgRow label="Węglowodany" v={avgN.carbs} goal={goals.carbs} pct={pct(avgN.carbs, 4)} color="var(--carbs)" />
          <AvgRow label="Błonnik" v={avgN.fiber} goal={goals.fiber} color="var(--fiber)" />
        </div>
      </section>

      <section class="card mt">
        <div class="card-title">
          <h2>Waga</h2>
          <span class="small muted">{wVals.length ? `ostatnio ${fmt1(wVals[wVals.length - 1].value!)} kg` : ''}</span>
        </div>
        {wVals.length ? (
          <LineChart points={weightPoints} unit="kg" label="Waga w czasie" />
        ) : (
          <p class="empty small">Dodaj pomiar wagi w dzienniku, aby zobaczyć wykres.</p>
        )}
      </section>
    </div>
  );
}

function AvgRow({ label, v, goal, pct, color }: { label: string; v: number; goal: number; pct?: number; color: string }) {
  return (
    <div class="macro">
      <div class="macro-head">
        <b>{label}</b>
        <span class="num muted">
          {fmt0(v)} / {fmt0(goal)} g{pct != null ? ` · ${pct}% energii` : ''}
        </span>
      </div>
      <div class="bar">
        <i style={{ width: `${Math.min(100, goal > 0 ? (v / goal) * 100 : 0)}%`, background: color }} />
      </div>
    </div>
  );
}

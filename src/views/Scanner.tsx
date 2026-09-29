import { useEffect, useRef, useState } from 'preact/hooks';
import { RateLimitedError } from '../api/rateLimit';
import { isPlausibleBarcode, normalizeBarcode } from '../lib/barcode';
import { useStore } from '../lib/store';
import type { Food } from '../lib/types';
import { lookupBarcode, type LookupResult } from '../lookup';
import { navigate, routeStore } from '../router';
import { CameraError, startScanner, type ScannerHandle } from '../scanner';
import { diaryDate } from '../uiState';
import { FoodSheet } from '../ui/FoodSheet';
import { Icon } from '../ui/Icon';
import { Topbar } from '../ui/Topbar';

type Phase = 'starting' | 'scanning' | 'looking' | 'result' | 'camera-error';

export function ScannerView() {
  const route = useStore(routeStore);
  const date = route.params.get('d') || diaryDate.get();
  const meal = route.params.get('m') || 'snacks';
  const video = useRef<HTMLVideoElement>(null);
  const handle = useRef<ScannerHandle | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [camError, setCamError] = useState('');
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState('');
  const [food, setFood] = useState<Food | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const stop = () => {
    handle.current?.stop();
    handle.current = null;
  };

  const lookup = async (raw: string) => {
    stop();
    setPhase('looking');
    setError('');
    try {
      const r = await lookupBarcode(raw);
      setResult(r);
      setPhase('result');
      if (r.status === 'found') setFood(r.food);
    } catch (e) {
      setError(e instanceof RateLimitedError ? e.message : (e as Error).message || 'Błąd wyszukiwania.');
      setPhase('result');
      setResult(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (phase !== 'starting' || !video.current) return;
    startScanner(video.current, (code) => {
      if (!cancelled) void lookup(code);
    })
      .then((h) => {
        if (cancelled) h.stop();
        else {
          handle.current = h;
          setPhase((p) => (p === 'starting' ? 'scanning' : p));
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setCamError(e instanceof CameraError ? e.message : `Nie udało się uruchomić skanera: ${(e as Error).message}`);
        setPhase('camera-error');
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [attempt]);

  const restart = () => {
    setResult(null);
    setFood(null);
    setError('');
    setPhase('starting');
    setAttempt((a) => a + 1);
  };

  const manualCode = normalizeBarcode(manual);

  return (
    <div class="page no-tabbar" data-testid="scanner">
      <Topbar
        title="Skaner kodów"
        right={
          handle.current?.torch ? (
            <button
              class="icon-btn"
              aria-label="Latarka"
              aria-pressed={torchOn}
              onClick={async () => {
                await handle.current?.torch?.(!torchOn);
                setTorchOn(!torchOn);
              }}
            >
              <Icon name="flash" filled={torchOn} />
            </button>
          ) : undefined
        }
      />

      {(phase === 'starting' || phase === 'scanning') && (
        <div class="scanner">
          <video ref={video} playsInline muted autoPlay aria-label="Podgląd z aparatu" />
          <div class="frame" />
          {phase === 'scanning' && <div class="laser" />}
        </div>
      )}
      {phase === 'starting' && <p class="small muted center mt">Uruchamiam aparat…</p>}
      {phase === 'scanning' && <p class="small muted center mt">Skieruj aparat na kod kreskowy produktu.</p>}
      {phase === 'camera-error' && (
        <div class="notice error" role="alert" data-testid="camera-error">
          <Icon name="alert" class="sm" />
          <div class="grow stack" style={{ gap: 8 }}>
            {camError}
            <button class="btn small outline" style={{ alignSelf: 'flex-start' }} onClick={restart}>
              Spróbuj ponownie
            </button>
          </div>
        </div>
      )}
      {phase === 'looking' && (
        <div class="card center mt">
          <div class="spinner" style={{ margin: '0 auto 8px' }} />
          Szukam produktu…
        </div>
      )}

      {phase === 'result' && (
        <div class="stack mt">
          {error && (
            <div class="notice error" role="alert">
              <Icon name="alert" class="sm" />
              <div>{error}</div>
            </div>
          )}
          {result?.status === 'found' && (
            <div class="card" data-testid="scan-found">
              <p class="small muted">{result.from === 'local' ? 'Znaleziono w Twoich produktach' : 'Znaleziono w Open Food Facts'}</p>
              <h2 class="mt">{result.food.name}</h2>
              {result.food.brand && <p class="muted">{result.food.brand}</p>}
              <button class="btn primary block mt" onClick={() => setFood(result.food)}>
                Wybierz ilość
              </button>
            </div>
          )}
          {result?.status === 'notfound' && (
            <div class="card stack" data-testid="scan-notfound">
              <h2>Nie znaleziono produktu</h2>
              <p class="muted">
                Kodu <b class="num">{result.code}</b> nie ma w Open Food Facts{result.hint ? ' (albo brakuje w nim wartości odżywczych)' : ''}. Dodaj go z etykiety – następnym razem skaner go rozpozna.
              </p>
              <button
                class="btn primary block"
                onClick={() =>
                  navigate('/produkt', { kod: result.code, nazwa: [result.hint?.brand, result.hint?.name].filter(Boolean).join(' ') || undefined, dodaj: '1', d: date, m: meal }, true)
                }
                data-testid="scan-add-custom"
              >
                <Icon name="plus" class="sm" /> Dodaj produkt z etykiety
              </button>
            </div>
          )}
          <button class="btn block" onClick={restart} data-testid="scan-again">
            <Icon name="barcode" class="sm" /> Skanuj ponownie
          </button>
        </div>
      )}

      <section class="card mt">
        <h3>Wpisz kod ręcznie</h3>
        <form
          class="row mt"
          onSubmit={(e) => {
            e.preventDefault();
            if (isPlausibleBarcode(manualCode)) void lookup(manualCode);
          }}
        >
          <input
            class="input grow num"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="np. 5900259000002"
            value={manual}
            onInput={(e) => setManual((e.currentTarget as HTMLInputElement).value.replace(/\D/g, ''))}
            aria-label="Kod kreskowy"
            data-testid="manual-code"
          />
          <button class="btn primary" type="submit" disabled={!isPlausibleBarcode(manualCode)} data-testid="manual-go">
            Szukaj
          </button>
        </form>
      </section>

      {food && (
        <FoodSheet
          food={food}
          date={date}
          meal={meal}
          onClose={() => setFood(null)}
          onAdded={() => {
            diaryDate.set(date);
            navigate('/', undefined, true);
          }}
          onEditFood={(f) => {
            setFood(null);
            navigate('/produkt', { id: f.id, d: date, m: meal });
          }}
        />
      )}
    </div>
  );
}

import { useState } from 'preact/hooks';
import { Icon } from './Icon';

const KEY = 'kalorie:install-hint-dismissed';

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
}

/** Podpowiedź instalacji na iPhonie (Safari nie pokazuje własnego komunikatu). */
export function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || !isIos() || isStandalone()) return null;
  return (
    <div class="notice info" style={{ marginBottom: 12 }} data-testid="install-hint">
      <Icon name="download" class="sm" />
      <div class="grow">
        <b>Zainstaluj aplikację:</b> w Safari stuknij <b>Udostępnij</b> (kwadrat ze strzałką), a potem <b>Do ekranu początkowego</b>. Będzie działać jak zwykła aplikacja, także offline.
      </div>
      <button
        class="icon-btn"
        aria-label="Ukryj podpowiedź"
        onClick={() => {
          try {
            localStorage.setItem(KEY, '1');
          } catch {
            /* tryb prywatny */
          }
          setHidden(true);
        }}
      >
        <Icon name="x" class="sm" />
      </button>
    </div>
  );
}

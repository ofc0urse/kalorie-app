import { useStore } from '../lib/store';
import { dismissToast, toastStore } from '../lib/toast';

export function Toast() {
  const t = useStore(toastStore);
  if (!t) return null;
  return (
    <div class={`toast ${t.kind}`} role="status" aria-live="polite">
      <div class="grow">{t.text}</div>
      {t.undo && (
        <button
          onClick={async () => {
            const u = t.undo!;
            dismissToast();
            await u();
          }}
        >
          Cofnij
        </button>
      )}
      <button onClick={dismissToast} aria-label="Zamknij powiadomienie">
        ✕
      </button>
    </div>
  );
}
